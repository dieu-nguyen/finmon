from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.telegram import TelegramSender
from app.config import Settings, get_settings
from app.db import SessionLocal
from app.models import DailyBar, PatternDef, ScanHit, ScanRun, Symbol
from app.patterns import Hit, MethodResult, method_for
from app.patterns.named import FRESH_SESSIONS, PATTERN_LABELS, detect, pattern_lookback, score_named
from app.patterns.windows import Window

WINDOW = 90
_BOARDS = ("HOSE", "HNX", "UPCOM", "UPX")
_SCAN_THREADS: list[threading.Thread] = []
_SCAN_LOCK = threading.Lock()


def _window_from_group(group: list, as_of: date, length: int = WINDOW) -> Window | None:
    group.sort(key=lambda item: item.date)
    if len(group) < WINDOW:
        return None
    newest = group[-1]
    if newest.date != as_of or newest.source != "dnse":
        return None
    take = length if length > WINDOW else WINDOW
    chosen = group[-take:]
    return Window(
        closes=[float(item.close) for item in chosen],
        window_start=chosen[0].date,
        window_end=chosen[-1].date,
        highs=[float(item.high) for item in chosen],
        lows=[float(item.low) for item in chosen],
        dates=[item.date for item in chosen],
    )


def _fetch_windows(db: Session, as_of: date, tickers: list[str], length: int = WINDOW) -> dict[str, Window]:
    if not tickers:
        return {}
    ranked = (
        select(
            DailyBar.ticker.label("ticker"),
            DailyBar.date.label("date"),
            DailyBar.high.label("high"),
            DailyBar.low.label("low"),
            DailyBar.close.label("close"),
            DailyBar.source.label("source"),
            func.row_number().over(partition_by=DailyBar.ticker, order_by=DailyBar.date.desc()).label("rn"),
        )
        .where(DailyBar.ticker.in_(tickers), DailyBar.date <= as_of)
        .subquery()
    )
    rows = db.execute(
        select(ranked.c.ticker, ranked.c.date, ranked.c.high, ranked.c.low, ranked.c.close, ranked.c.source).where(
            ranked.c.rn <= (length if length > WINDOW else WINDOW)
        )
    ).all()
    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row.ticker, []).append(row)
    windows: dict[str, Window] = {}
    for ticker, group in grouped.items():
        window = _window_from_group(group, as_of, length)
        if window is not None:
            windows[ticker] = window
    return windows


def load_windows(db: Session, as_of: date, tickers: list[str] | None = None, length: int = WINDOW) -> tuple[dict[str, Window], int]:
    stmt = select(Symbol).where(
        Symbol.listed.is_(True),
        Symbol.type.in_(("stock", "etf")),
        Symbol.board.in_(_BOARDS),
    )
    if tickers is not None:
        if not tickers:
            return {}, 0
        stmt = stmt.where(Symbol.ticker.in_(tickers))
    symbols = db.scalars(stmt).all()
    windows = _fetch_windows(db, as_of, [row.ticker for row in symbols], length)
    return windows, len(windows)


def load_one_window(db: Session, ticker: str, length: int = WINDOW) -> Window | None:
    as_of = db.scalar(select(func.max(DailyBar.date)).where(DailyBar.ticker == ticker, DailyBar.source == "dnse"))
    if as_of is None:
        return None
    return _fetch_windows(db, as_of, [ticker], length).get(ticker)


def format_named_message(name: str, as_of: date, result: MethodResult) -> str:
    if not result.hits:
        return f"{name}: as of {as_of.isoformat()} — nothing cleared the floor"
    lines = [name, f"as of {as_of.isoformat()}"]
    for hit in result.hits:
        label = PATTERN_LABELS.get(hit.pattern or "", "")
        tail = f" {hit.state}" if hit.state else ""
        if label:
            tail = f"{tail} {label}"
        lines.append(f"{hit.ticker} {hit.score:.4f}{tail}")
    return "\n".join(lines)


def format_scan_message(name: str, reference: str, as_of: date, result: MethodResult) -> str:
    if not result.reference_compared:
        return f"{name}: {reference} as of {as_of.isoformat()} was not compared"
    if not result.hits:
        return f"{name}: {reference} as of {as_of.isoformat()} — nothing cleared the floor"
    lines = [name, f"Reference {reference} as of {as_of.isoformat()}"]
    for hit in result.hits:
        lines.append(f"{hit.ticker} {hit.score:.4f}")
    return "\n".join(lines)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _score_one(
    db: Session,
    pattern: PatternDef,
    windows: dict[str, Window],
    eligible_count: int,
    as_of: date,
    sender: TelegramSender,
    existing: ScanRun | None = None,
) -> bool:
    started = existing.started_at if existing is not None else _now()
    spec = dict(pattern.spec or {})
    try:
        fn = method_for(pattern.kind)
        result = fn(spec, windows)
    except Exception:
        if existing is None:
            db.add(
                ScanRun(
                    pattern_id=pattern.id,
                    started_at=started,
                    finished_at=_now(),
                    status="failed",
                    eligible_count=eligible_count,
                    compared_count=0,
                    as_of=as_of,
                    reference_compared=False,
                )
            )
        else:
            existing.finished_at = _now()
            existing.status = "failed"
            existing.eligible_count = eligible_count
            existing.compared_count = 0
            existing.as_of = as_of
            existing.reference_compared = False
        db.commit()
        return False
    if existing is None:
        run = ScanRun(
            pattern_id=pattern.id,
            started_at=started,
            finished_at=_now(),
            status="ok",
            eligible_count=eligible_count,
            compared_count=result.compared_count,
            as_of=as_of,
            reference_compared=result.reference_compared,
        )
        db.add(run)
    else:
        run = existing
        run.finished_at = _now()
        run.status = "ok"
        run.eligible_count = eligible_count
        run.compared_count = result.compared_count
        run.as_of = as_of
        run.reference_compared = result.reference_compared
    db.flush()
    for hit in result.hits:
        db.add(
            ScanHit(
                run_id=run.id,
                pattern_id=pattern.id,
                ticker=hit.ticker,
                score=hit.score,
                window_start=hit.window_start,
                window_end=hit.window_end,
                swings=hit.swings,
                state=hit.state,
            )
        )
    db.commit()
    if pattern.kind == "named":
        message = format_named_message(pattern.name, as_of, result)
    else:
        reference = str(spec.get("reference") or "").upper()
        message = format_scan_message(pattern.name, reference, as_of, result)
    try:
        sender.send(message)
    except Exception:
        return True
    return True


def run_pattern_scan(db: Session, as_of: date, settings: Settings | None = None) -> None:
    """Score enabled daily look-alike patterns. Backfill and the quote poll do not call this."""
    settings = settings or get_settings()
    windows, eligible_count = load_windows(db, as_of)
    patterns = list(
        db.scalars(
            select(PatternDef)
            .where(PatternDef.enabled.is_(True), PatternDef.schedule == "daily", PatternDef.kind == "lookalike")
            .order_by(PatternDef.id)
        )
    )
    if not patterns:
        return
    sender = TelegramSender(settings.telegram_bot_token, settings.telegram_chat_id)
    try:
        for pattern in patterns:
            _score_one(db, pattern, windows, eligible_count, as_of, sender)
    finally:
        sender._client.close()


class NamedScanFailed(Exception):
    """Scoring failed after a failed scan_run was stored."""


class LookalikeScanFailed(Exception):
    """Scoring failed after a failed scan_run was stored."""


def wait_background_scans(timeout: float = 60) -> None:
    with _SCAN_LOCK:
        threads = list(_SCAN_THREADS)
    for thread in threads:
        thread.join(timeout)
    with _SCAN_LOCK:
        _SCAN_THREADS[:] = [thread for thread in _SCAN_THREADS if thread.is_alive()]


def _mark_scan_failed(run_id: int) -> None:
    db = SessionLocal()
    try:
        run = db.get(ScanRun, run_id)
        if run is None or run.status != "accepted":
            return
        run.status = "failed"
        run.finished_at = _now()
        db.commit()
    finally:
        db.close()


def _spawn_scan(target) -> None:
    def runner() -> None:
        try:
            target()
        except Exception:
            return

    thread = threading.Thread(target=runner, daemon=True)
    with _SCAN_LOCK:
        _SCAN_THREADS.append(thread)
    thread.start()


def accept_lookalike(db: Session, pattern_id: int, settings: Settings | None = None) -> int:
    """Store an accepted look-alike run and score it off the request."""
    settings = settings or get_settings()
    pattern = db.get(PatternDef, pattern_id)
    if pattern is None or pattern.kind != "lookalike" or not pattern.enabled:
        raise LookalikeScanFailed
    reference = str((pattern.spec or {}).get("reference") or "").strip()
    if not reference:
        raise LookalikeScanFailed
    run = ScanRun(
        pattern_id=pattern.id,
        started_at=_now(),
        finished_at=None,
        status="accepted",
        eligible_count=0,
        compared_count=0,
        as_of=date.today(),
        reference_compared=False,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    run_id = run.id
    _spawn_scan(lambda: execute_lookalike(run_id, settings))
    return run_id


def execute_lookalike(run_id: int, settings: Settings | None = None) -> None:
    """Score one saved look-alike pattern against the eligible universe."""
    settings = settings or get_settings()
    db = SessionLocal()
    try:
        run = db.get(ScanRun, run_id)
        if run is None or run.status != "accepted":
            return
        pattern = db.get(PatternDef, run.pattern_id)
        if pattern is None:
            _mark_scan_failed(run_id)
            return
        as_of = _latest_as_of(db, None) or date.today()
        try:
            windows, eligible = load_windows(db, as_of)
        except Exception:
            db.rollback()
            _mark_scan_failed(run_id)
            return
        sender = TelegramSender(settings.telegram_bot_token, settings.telegram_chat_id)
        try:
            _score_one(db, pattern, windows, eligible, as_of, sender, existing=run)
        finally:
            sender._client.close()
    except Exception:
        db.rollback()
        _mark_scan_failed(run_id)
    finally:
        db.close()


MANUAL_PATTERN_NAME = "Named patterns"


def _manual_pattern(db: Session) -> PatternDef:
    row = db.scalar(select(PatternDef).where(PatternDef.name == MANUAL_PATTERN_NAME, PatternDef.kind == "named"))
    if row is None:
        row = PatternDef(
            name=MANUAL_PATTERN_NAME,
            kind="named",
            spec={"manual": True},
            schedule="manual",
            enabled=False,
        )
        db.add(row)
        db.flush()
    return row


def _latest_as_of(db: Session, tickers: list[str] | None) -> date | None:
    stmt = select(Symbol.ticker).where(
        Symbol.listed.is_(True),
        Symbol.type.in_(("stock", "etf")),
        Symbol.board.in_(_BOARDS),
    )
    if tickers is not None:
        if not tickers:
            return None
        stmt = stmt.where(Symbol.ticker.in_(tickers))
    eligible = list(db.scalars(stmt).all())
    if not eligible:
        return None
    return db.scalar(select(func.max(DailyBar.date)).where(DailyBar.source == "dnse", DailyBar.ticker.in_(eligible)))


def _save_named_run(
    db: Session,
    *,
    status: str,
    as_of: date,
    eligible: int,
    compared: int,
    request: dict,
    hits: list[Hit],
) -> ScanRun:
    pattern = _manual_pattern(db)
    run = ScanRun(
        pattern_id=pattern.id,
        started_at=_now(),
        finished_at=_now(),
        status=status,
        eligible_count=eligible,
        compared_count=compared,
        as_of=as_of,
        reference_compared=False,
        request=request,
    )
    db.add(run)
    db.flush()
    if status == "ok":
        for hit in hits:
            db.add(
                ScanHit(
                    run_id=run.id,
                    pattern_id=pattern.id,
                    ticker=hit.ticker,
                    score=hit.score,
                    window_start=hit.window_start,
                    window_end=hit.window_end,
                    swings=hit.swings,
                    state=hit.state,
                )
            )
    db.commit()
    return run


def _notify_market(settings: Settings, as_of: date, hits: list[Hit]) -> None:
    sender = TelegramSender(settings.telegram_bot_token, settings.telegram_chat_id)
    try:
        message = format_named_message(
            "Named patterns",
            as_of,
            MethodResult(hits=hits, compared_count=len(hits), reference_compared=True),
        )
        sender.send(message)
    except Exception:
        return
    finally:
        sender._client.close()


def accept_named_market(
    db: Session,
    patterns: list[str],
    scope: str,
    tickers: list[str],
    settings: Settings | None = None,
) -> int:
    """Store an accepted market run and score it off the request."""
    settings = settings or get_settings()
    scope_tickers = list(tickers) if scope == "subset" else []
    request = {"mode": "market", "patterns": list(patterns), "scope": scope, "tickers": scope_tickers}
    pattern = _manual_pattern(db)
    run = ScanRun(
        pattern_id=pattern.id,
        started_at=_now(),
        finished_at=None,
        status="accepted",
        eligible_count=0,
        compared_count=0,
        as_of=date.today(),
        reference_compared=False,
        request=request,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    run_id = run.id
    _spawn_scan(lambda: execute_named_market(run_id, settings))
    return run_id


def execute_named_market(run_id: int, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    db = SessionLocal()
    try:
        run = db.get(ScanRun, run_id)
        if run is None or run.status != "accepted":
            return
        request = dict(run.request or {})
        patterns = [name for name in request.get("patterns") or [] if isinstance(name, str)]
        scope = request.get("scope") if request.get("scope") in ("all", "subset") else "all"
        scope_tickers = [str(ticker) for ticker in request.get("tickers") or []]
        only = scope_tickers if scope == "subset" else None
        try:
            as_of = _latest_as_of(db, only) or date.today()
            windows, eligible = load_windows(db, as_of, only, max(pattern_lookback(name) for name in patterns))
            hits: list[Hit] = []
            for name in patterns:
                hits.extend(score_named({"pattern": name}, windows).hits)
            compared = len(windows)
            request = {**request, "compared": sorted(windows)}
        except Exception:
            db.rollback()
            failed = db.get(ScanRun, run_id)
            if failed is not None and failed.status == "accepted":
                failed.status = "failed"
                failed.finished_at = _now()
                failed.request = request
                db.commit()
            return
        finished = db.get(ScanRun, run_id)
        if finished is None:
            return
        finished.status = "ok"
        finished.finished_at = _now()
        finished.as_of = as_of
        finished.eligible_count = eligible
        finished.compared_count = compared
        finished.request = request
        finished.reference_compared = False
        pattern_id = finished.pattern_id
        db.flush()
        for hit in hits:
            db.add(
                ScanHit(
                    run_id=finished.id,
                    pattern_id=pattern_id,
                    ticker=hit.ticker,
                    score=hit.score,
                    window_start=hit.window_start,
                    window_end=hit.window_end,
                    swings=hit.swings,
                    state=hit.state,
                )
            )
        db.commit()
        _notify_market(settings, as_of, hits)
    except Exception:
        db.rollback()
        _mark_scan_failed(run_id)
    finally:
        db.close()


def trigger_named_ticker(db: Session, ticker: str, patterns: list[str]) -> None:
    symbol = ticker.strip().upper()
    request = {"mode": "ticker", "patterns": list(patterns), "scope": "ticker", "tickers": [symbol]}
    try:
        window = load_one_window(db, symbol, max(pattern_lookback(name) for name in patterns))
        as_of = window.window_end if window is not None else date.today()
        hits: list[Hit] = []
        if window is not None:
            for name in patterns:
                found = detect(window, name)
                if found is not None:
                    hits.append(
                        Hit(
                            ticker=symbol,
                            score=found.score,
                            window_start=found.window_start,
                            window_end=found.window_end,
                            state=found.state,
                            swings=found.swings,
                            pattern=found.pattern,
                        )
                    )
        eligible = 1 if window is not None else 0
        request = {**request, "compared": [symbol] if window is not None else []}
    except Exception:
        db.rollback()
        _save_named_run(
            db,
            status="failed",
            as_of=date.today(),
            eligible=0,
            compared=0,
            request=request,
            hits=[],
        )
        raise NamedScanFailed
    _save_named_run(
        db,
        status="ok",
        as_of=as_of,
        eligible=eligible,
        compared=eligible,
        request=request,
        hits=hits,
    )


def latest_market_run(db: Session) -> ScanRun | None:
    rows = db.scalars(select(ScanRun).where(ScanRun.request.is_not(None)).order_by(ScanRun.id.desc())).all()
    for row in rows:
        if (row.request or {}).get("mode") == "market":
            return row
    return None


def latest_named_run(db: Session, *, mode: str, ticker: str | None = None) -> ScanRun | None:
    rows = db.scalars(
        select(ScanRun).where(ScanRun.status == "ok", ScanRun.request.is_not(None)).order_by(ScanRun.id.desc())
    ).all()
    for row in rows:
        req = row.request or {}
        if req.get("mode") != mode:
            continue
        if ticker is not None and ticker not in (req.get("tickers") or []):
            continue
        return row
    return None


@dataclass(frozen=True)
class NamedTickerResult:
    run: ScanRun
    hits: list[ScanHit]


def _request_tickers(raw: object) -> set[str]:
    if not isinstance(raw, list):
        return set()
    return {str(item).strip().upper() for item in raw if str(item).strip()}


def _swing_pattern(hit: ScanHit) -> str:
    swings = hit.swings if isinstance(hit.swings, dict) else {}
    pattern = swings.get("pattern") if isinstance(swings, dict) else None
    return pattern if isinstance(pattern, str) else ""


def _parse_day(value: object) -> date | None:
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _anchor_date(hit: ScanHit) -> date | None:
    swings = hit.swings if isinstance(hit.swings, dict) else {}
    points = swings.get("points") if isinstance(swings.get("points"), list) else []
    swing_dates = [_parse_day(point.get("date")) for point in points if isinstance(point, dict)]
    last_swing = max((day for day in swing_dates if day is not None), default=None)
    confirmed = _parse_day(swings.get("confirmed_on"))
    candidates = [day for day in (last_swing, confirmed) if day is not None]
    if not candidates:
        return None
    return max(candidates)


def _fresh_hits(db: Session, hits: list[ScanHit]) -> list[ScanHit]:
    if not hits:
        return []
    tickers = sorted({hit.ticker for hit in hits})
    rows = db.execute(select(DailyBar.ticker, DailyBar.date).where(DailyBar.ticker.in_(tickers))).all()
    dates: dict[str, set[date]] = {}
    for ticker, day in rows:
        dates.setdefault(ticker, set()).add(day)
    kept: list[ScanHit] = []
    for hit in hits:
        series = dates.get(hit.ticker)
        anchor = _anchor_date(hit)
        if series and anchor is not None:
            behind = sum(1 for day in series if day > anchor)
            if behind > FRESH_SESSIONS:
                continue
        kept.append(hit)
    return kept


def _covered_tickers(db: Session, run: ScanRun, hit_tickers: set[str], eligible_cache: dict[date, set[str]]) -> set[str]:
    req = run.request or {}
    mode = req.get("mode")
    if mode == "ticker" or req.get("scope") == "subset":
        return _request_tickers(req.get("tickers"))
    if mode != "market":
        return set()
    compared = req.get("compared")
    if isinstance(compared, list):
        return _request_tickers(compared)
    as_of = run.as_of
    if as_of not in eligible_cache:
        windows, _eligible = load_windows(db, as_of)
        eligible_cache[as_of] = set(windows)
    return set(eligible_cache[as_of]) | hit_tickers


def combined_named(db: Session) -> dict[str, NamedTickerResult]:
    """Newest ok named run that covered each ticker, and the hits still on screen."""
    runs = [
        row
        for row in db.scalars(
            select(ScanRun).where(ScanRun.status == "ok", ScanRun.request.is_not(None)).order_by(ScanRun.id.desc())
        ).all()
        if (row.request or {}).get("mode") in ("market", "ticker")
    ]
    if not runs:
        return {}
    by_run: dict[int, list[ScanHit]] = {}
    for hit in db.scalars(select(ScanHit).where(ScanHit.run_id.in_([row.id for row in runs]))).all():
        by_run.setdefault(hit.run_id, []).append(hit)
    assigned: dict[str, ScanRun] = {}
    pending: dict[str, list[ScanHit]] = {}
    eligible_cache: dict[date, set[str]] = {}
    for run in runs:
        hit_rows = by_run.get(run.id, [])
        covered = _covered_tickers(db, run, {hit.ticker.strip().upper() for hit in hit_rows}, eligible_cache)
        grouped: dict[str, list[ScanHit]] = {}
        for hit in hit_rows:
            grouped.setdefault(hit.ticker.strip().upper(), []).append(hit)
        for symbol in covered:
            if symbol in assigned:
                continue
            assigned[symbol] = run
            pending[symbol] = list(grouped.get(symbol, []))
    fresh_ids = {hit.id for hit in _fresh_hits(db, [hit for rows in pending.values() for hit in rows])}
    view: dict[str, NamedTickerResult] = {}
    for symbol, run in assigned.items():
        kept = [hit for hit in pending[symbol] if hit.id in fresh_ids]
        kept.sort(key=lambda hit: (-hit.score, hit.ticker, _swing_pattern(hit)))
        view[symbol] = NamedTickerResult(run=run, hits=kept)
    return view
