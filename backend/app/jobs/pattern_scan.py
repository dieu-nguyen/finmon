from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.clients.telegram import TelegramSender
from app.config import Settings, get_settings
from app.models import DailyBar, PatternDef, ScanHit, ScanRun, Symbol
from app.patterns import MethodResult, method_for
from app.patterns.windows import Window

WINDOW = 90
_BOARDS = ("HOSE", "HNX", "UPCOM", "UPX")


def load_windows(db: Session, as_of: date) -> tuple[dict[str, Window], int]:
    symbols = db.scalars(
        select(Symbol).where(
            Symbol.listed.is_(True),
            Symbol.type.in_(("stock", "etf")),
            Symbol.board.in_(_BOARDS),
        )
    ).all()
    tickers = [row.ticker for row in symbols]
    if not tickers:
        return {}, 0
    ranked = (
        select(
            DailyBar.ticker.label("ticker"),
            DailyBar.date.label("date"),
            DailyBar.close.label("close"),
            DailyBar.source.label("source"),
            func.row_number().over(partition_by=DailyBar.ticker, order_by=DailyBar.date.desc()).label("rn"),
        )
        .where(DailyBar.ticker.in_(tickers), DailyBar.date <= as_of)
        .subquery()
    )
    rows = db.execute(
        select(ranked.c.ticker, ranked.c.date, ranked.c.close, ranked.c.source).where(ranked.c.rn <= WINDOW)
    ).all()
    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row.ticker, []).append(row)
    windows: dict[str, Window] = {}
    for ticker, group in grouped.items():
        group.sort(key=lambda item: item.date)
        if len(group) < WINDOW:
            continue
        newest = group[-1]
        if newest.date != as_of or newest.source != "dnse":
            continue
        chosen = group[-WINDOW:]
        windows[ticker] = Window(
            closes=[float(item.close) for item in chosen],
            window_start=chosen[0].date,
            window_end=chosen[-1].date,
        )
    return windows, len(windows)


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
) -> None:
    started = _now()
    spec = dict(pattern.spec or {})
    try:
        fn = method_for(pattern.kind)
        result = fn(spec, windows)
    except Exception:
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
        db.commit()
        return
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
            )
        )
    db.commit()
    reference = str(spec.get("reference") or "").upper()
    try:
        sender.send(format_scan_message(pattern.name, reference, as_of, result))
    except Exception:
        return


def run_pattern_scan(db: Session, as_of: date, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    windows, eligible_count = load_windows(db, as_of)
    patterns = list(
        db.scalars(
            select(PatternDef)
            .where(PatternDef.enabled.is_(True), PatternDef.schedule == "daily")
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
