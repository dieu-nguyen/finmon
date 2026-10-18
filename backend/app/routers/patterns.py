from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, union_all
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.jobs.pattern_scan import (
    LookalikeScanFailed,
    NamedScanFailed,
    NamedTickerResult,
    accept_lookalike,
    accept_named_market,
    combined_named,
    latest_market_run,
    latest_named_run,
    trigger_named_ticker,
)
from app.models import DailyBar, PatternDef, ScanHit, ScanRun, Symbol
from app.patterns.named import PATTERN_LABELS, PATTERNS
from app.schemas import (
    CatalogItem,
    HitOut,
    HitsOut,
    NamedCheckOut,
    NamedMarketIn,
    NamedMarketOut,
    NamedMatchOut,
    NamedTickerIn,
    PatternIn,
    PatternOut,
)

router = APIRouter(prefix="/api")


def _fields(body: PatternIn) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name is required")
    if body.kind == "named":
        pattern = body.pattern.strip()
        if pattern not in PATTERNS:
            raise HTTPException(400, "unknown pattern")
        return {"name": name, "kind": "named", "spec": {"pattern": pattern}, "enabled": body.enabled}
    if body.kind != "lookalike":
        raise HTTPException(400, "unknown kind")
    reference = body.reference.strip().upper()
    if not reference:
        raise HTTPException(400, "reference is required")
    if body.min_score < -1 or body.min_score > 1:
        raise HTTPException(400, "min_score must be between -1 and 1")
    if body.top_k < 1:
        raise HTTPException(400, "top_k must be at least 1")
    return {
        "name": name,
        "kind": "lookalike",
        "spec": {"reference": reference, "min_score": body.min_score, "top_k": body.top_k},
        "enabled": body.enabled,
    }


def _out(row: PatternDef) -> PatternOut:
    return PatternOut(
        id=row.id,
        name=row.name,
        kind=row.kind,
        schedule=row.schedule,
        enabled=row.enabled,
        spec=row.spec or {},
    )


def _apply(row: PatternDef, fields: dict) -> None:
    row.name = fields["name"]
    row.kind = fields["kind"]
    row.schedule = "daily"
    row.spec = fields["spec"]
    row.enabled = fields["enabled"]


@router.get("/patterns", response_model=list[PatternOut])
def list_patterns(db: Session = Depends(get_db)) -> list[PatternOut]:
    rows = db.scalars(select(PatternDef).order_by(PatternDef.id)).all()
    return [_out(row) for row in rows]


@router.post("/patterns", response_model=PatternOut)
def create_pattern(body: PatternIn, db: Session = Depends(get_db)) -> PatternOut:
    fields = _fields(body)
    row = PatternDef(name=fields["name"], kind=fields["kind"], spec=fields["spec"], schedule="daily", enabled=fields["enabled"])
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.put("/patterns/{pattern_id}", response_model=PatternOut)
def update_pattern(pattern_id: int, body: PatternIn, db: Session = Depends(get_db)) -> PatternOut:
    row = db.get(PatternDef, pattern_id)
    if row is None:
        raise HTTPException(404, "unknown pattern")
    _apply(row, _fields(body))
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/patterns/{pattern_id}/hits", response_model=HitsOut)
def pattern_hits(
    pattern_id: int,
    db: Session = Depends(get_db),
    right_edge: Annotated[int | None, Query(ge=0)] = None,
) -> HitsOut:
    pattern = db.get(PatternDef, pattern_id)
    if pattern is None:
        raise HTTPException(404, "unknown pattern")
    spec = pattern.spec or {}
    reference = str(spec.get("reference") or "")
    pattern_name = str(spec.get("pattern") or "") or None
    run = db.scalar(
        select(ScanRun)
        .where(ScanRun.pattern_id == pattern.id, ScanRun.status == "ok")
        .order_by(ScanRun.id.desc())
        .limit(1)
    )
    newest = db.scalar(select(ScanRun).where(ScanRun.pattern_id == pattern.id).order_by(ScanRun.id.desc()).limit(1))
    run_id = newest.id if newest is not None else None
    status = newest.status if newest is not None else None
    if run is None:
        return HitsOut(
            pattern_id=pattern.id,
            name=pattern.name,
            kind=pattern.kind,
            pattern=pattern_name,
            reference=reference,
            run_id=run_id,
            status=status,
        )
    hits = list(
        db.scalars(
            select(ScanHit).where(ScanHit.run_id == run.id).order_by(ScanHit.score.desc(), ScanHit.ticker)
        ).all()
    )
    if right_edge is not None:
        if pattern.kind == "lookalike":
            hits = _apply_right_edge(db, hits, right_edge, lambda hit: _lookalike_anchor(hit, run.as_of))
        else:
            hits = _apply_right_edge(db, hits, right_edge)
    names: dict[str, str] = {}
    tickers = [hit.ticker for hit in hits]
    if tickers:
        names = {
            row.ticker: row.name
            for row in db.scalars(select(Symbol).where(Symbol.ticker.in_(tickers)))
        }
    return HitsOut(
        pattern_id=pattern.id,
        name=pattern.name,
        kind=pattern.kind,
        pattern=pattern_name,
        reference=reference,
        as_of=run.as_of,
        reference_compared=run.reference_compared,
        run_id=run_id,
        status=status,
        hits=[
            HitOut(
                ticker=hit.ticker,
                name=names.get(hit.ticker) or hit.ticker,
                score=hit.score,
                window_start=hit.window_start,
                window_end=hit.window_end,
                state=hit.state,
                swings=hit.swings,
                pattern=pattern_name,
            )
            for hit in hits
        ],
    )


@router.post("/patterns/{pattern_id}/scan", response_model=HitsOut)
def scan_lookalike(pattern_id: int, db: Session = Depends(get_db)) -> HitsOut:
    pattern = db.get(PatternDef, pattern_id)
    if pattern is None or pattern.kind != "lookalike":
        raise HTTPException(404, "unknown pattern")
    if not pattern.enabled:
        raise HTTPException(400, "pattern is disabled")
    if not str((pattern.spec or {}).get("reference") or "").strip():
        raise HTTPException(400, "reference is required")
    try:
        accept_lookalike(db, pattern.id, get_settings())
    except LookalikeScanFailed:
        raise HTTPException(500, "scan failed") from None
    return pattern_hits(pattern_id, db)


def _chosen_patterns(names: list[str]) -> list[str]:
    wanted: list[str] = []
    for raw in names:
        name = raw.strip()
        if not name:
            continue
        if name not in PATTERNS:
            raise HTTPException(400, "unknown pattern")
        if name not in wanted:
            wanted.append(name)
    if not wanted:
        raise HTTPException(400, "select a pattern")
    return [name for name in PATTERNS if name in wanted]


def _chosen_tickers(names: list[str]) -> list[str]:
    picked: list[str] = []
    for raw in names:
        ticker = raw.strip().upper()
        if ticker and ticker not in picked:
            picked.append(ticker)
    return picked


def _pattern_of(hit: ScanHit) -> str:
    swings = hit.swings if isinstance(hit.swings, dict) else {}
    pattern = swings.get("pattern") if isinstance(swings, dict) else None
    return pattern if isinstance(pattern, str) else ""


def _symbol_names(db: Session, tickers: list[str]) -> dict[str, str]:
    if not tickers:
        return {}
    return {row.ticker: row.name for row in db.scalars(select(Symbol).where(Symbol.ticker.in_(tickers)))}


@router.get("/pattern-catalog", response_model=list[CatalogItem])
def pattern_catalog() -> list[CatalogItem]:
    return [CatalogItem(id=name, label=PATTERN_LABELS[name]) for name in PATTERNS]


def _scanned_at(run: ScanRun) -> datetime:
    return run.finished_at or run.started_at


def _combined_named_hits(db: Session) -> tuple[dict[str, NamedTickerResult], list[ScanHit], dict[int, datetime]]:
    """The Scans match list: latest covering result per symbol and pattern, from stored rows."""
    view = combined_named(db)
    hits = [hit for result in view.values() for hit in result.hits]
    hits.sort(key=lambda hit: (-hit.score, hit.ticker, _pattern_of(hit)))
    ids = sorted({hit.run_id for hit in hits})
    times: dict[int, datetime] = {}
    if ids:
        for row in db.scalars(select(ScanRun).where(ScanRun.id.in_(ids))):
            times[row.id] = _scanned_at(row)
    return view, hits, times


def _named_hit_out(hit: ScanHit, names: dict[str, str], scanned_at: datetime | None) -> HitOut:
    return HitOut(
        ticker=hit.ticker,
        name=names.get(hit.ticker) or hit.ticker,
        score=hit.score,
        window_start=hit.window_start,
        window_end=hit.window_end,
        state=hit.state,
        swings=hit.swings,
        pattern=_pattern_of(hit) or None,
        run_id=hit.run_id,
        scanned_at=scanned_at,
    )


def _parse_day(raw: object) -> date | None:
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _anchor_date(hit: ScanHit) -> date | None:
    """Last swing, or the confirming close when that close is later."""
    swings = hit.swings if isinstance(hit.swings, dict) else {}
    latest: date | None = None
    points = swings.get("points")
    if isinstance(points, list):
        for point in points:
            if not isinstance(point, dict):
                continue
            parsed = _parse_day(point.get("date"))
            if parsed is not None and (latest is None or parsed > latest):
                latest = parsed
    confirmed = _parse_day(swings.get("confirmed_on"))
    if confirmed is not None and (latest is None or confirmed > latest):
        latest = confirmed
    return latest


def _match_state(raw: str) -> str:
    state = raw.strip().lower()
    if state not in ("", "all", "forming", "confirmed"):
        raise HTTPException(400, "unknown state")
    return "all" if state in ("", "all") else state


def _narrow_hits(hits: list[ScanHit], *, pattern: str, ticker: str, state: str) -> list[ScanHit]:
    pattern_name = pattern.strip()
    ticker_q = ticker.strip().upper()
    kept: list[ScanHit] = []
    for hit in hits:
        if pattern_name and _pattern_of(hit) != pattern_name:
            continue
        if ticker_q and ticker_q not in hit.ticker.upper():
            continue
        if state != "all" and (hit.state or "") != state:
            continue
        kept.append(hit)
    return kept


def _newest_dates(db: Session, tickers: list[str], limit: int) -> dict[str, list[date]]:
    """Newest `limit` dates per ticker. One query, `ORDER BY date DESC LIMIT` on `uq_daily_bar_ticker_date`."""
    unique = list(dict.fromkeys(ticker.strip().upper() for ticker in tickers if ticker and ticker.strip()))
    if not unique or limit <= 0:
        return {}
    parts = [
        select(DailyBar.ticker, DailyBar.date)
        .where(DailyBar.ticker == ticker)
        .order_by(DailyBar.date.desc())
        .limit(limit)
        for ticker in unique
    ]
    rows = db.execute(parts[0] if len(parts) == 1 else union_all(*parts)).all()
    found: dict[str, list[date]] = {}
    for ticker, day in rows:
        parsed = _parse_day(day)
        if parsed is None:
            continue
        found.setdefault(str(ticker), []).append(parsed)
    return found


def _lookalike_anchor(hit: ScanHit, as_of: date | None) -> date | None:
    """End of the matched window when that date is stored, otherwise the run as-of date."""
    return _parse_day(hit.window_end) or as_of


def _within_right_edge(anchor: date | None, newest: list[date], sessions: int) -> bool:
    if anchor is None:
        return False
    # `newest` is at most sessions+1 dates. More than `sessions` of them after the anchor means the hit is further behind.
    behind = sum(1 for day in newest if day > anchor)
    return behind <= sessions


def _apply_right_edge(db: Session, hits: list[ScanHit], sessions: int, anchor_of=None) -> list[ScanHit]:
    resolve = anchor_of or _anchor_date
    dates = _newest_dates(db, [hit.ticker for hit in hits], sessions + 1)
    return [hit for hit in hits if _within_right_edge(resolve(hit), dates.get(hit.ticker.strip().upper(), []), sessions)]


def _read_named_market(
    db: Session,
    *,
    pattern: str = "",
    ticker: str = "",
    state: str = "all",
    right_edge: int | None = None,
) -> NamedMarketOut:
    chosen = _match_state(state)
    _view, hits, times = _combined_named_hits(db)
    narrowed = hits
    if pattern.strip() or ticker.strip() or chosen != "all":
        narrowed = _narrow_hits(hits, pattern=pattern, ticker=ticker, state=chosen)
    if right_edge is not None:
        narrowed = _apply_right_edge(db, narrowed, right_edge)
    run = latest_named_run(db, mode="market")
    pending = latest_market_run(db)
    if run is None and pending is None and not narrowed and not hits:
        return NamedMarketOut()
    source = pending if pending is not None else run
    req = (source.request or {}) if source is not None else {}
    scope = req.get("scope") if req.get("scope") in ("all", "subset") else "all"
    names = _symbol_names(db, [hit.ticker for hit in narrowed])
    return NamedMarketOut(
        as_of=run.as_of if run is not None else None,
        patterns=list(req.get("patterns") or []),
        scope=scope,
        tickers=list(req.get("tickers") or []),
        hits=[_named_hit_out(hit, names, times.get(hit.run_id)) for hit in narrowed],
        run_id=source.id if source is not None else None,
        status=source.status if source is not None else None,
    )


@router.get("/named-scans", response_model=NamedMarketOut)
def read_named_scan(
    db: Session = Depends(get_db),
    pattern: str = "",
    ticker: str = "",
    state: str = "all",
    right_edge: Annotated[int | None, Query(ge=0)] = None,
) -> NamedMarketOut:
    return _read_named_market(db, pattern=pattern, ticker=ticker, state=state, right_edge=right_edge)


@router.post("/named-scans", response_model=NamedMarketOut)
def run_named_scan(body: NamedMarketIn, db: Session = Depends(get_db)) -> NamedMarketOut:
    patterns = _chosen_patterns(body.patterns)
    tickers = _chosen_tickers(body.tickers) if body.scope == "subset" else []
    if body.scope == "subset" and not tickers:
        raise HTTPException(400, "select a ticker")
    accept_named_market(db, patterns, body.scope, tickers, get_settings())
    return _read_named_market(db)


@router.get("/symbols/{ticker}/named-patterns", response_model=NamedCheckOut)
def named_patterns(ticker: str, db: Session = Depends(get_db)) -> NamedCheckOut:
    symbol = ticker.strip().upper()
    view, hits, times = _combined_named_hits(db)
    result = view.get(symbol)
    if result is None:
        return NamedCheckOut(ticker=symbol)
    req = result.run.request or {}
    return NamedCheckOut(
        ticker=symbol,
        as_of=result.run.as_of,
        patterns=list(req.get("patterns") or []),
        matches=[
            NamedMatchOut(
                pattern=_pattern_of(hit),
                state=hit.state or "",
                score=hit.score,
                window_start=hit.window_start,
                window_end=hit.window_end,
                swings=hit.swings or {},
                run_id=hit.run_id,
                scanned_at=times.get(hit.run_id),
            )
            for hit in hits
            if hit.ticker == symbol and _pattern_of(hit)
        ],
    )


@router.post("/symbols/{ticker}/named-patterns", response_model=NamedCheckOut)
def scan_named_patterns(ticker: str, body: NamedTickerIn, db: Session = Depends(get_db)) -> NamedCheckOut:
    patterns = _chosen_patterns(body.patterns)
    try:
        trigger_named_ticker(db, ticker, patterns)
    except NamedScanFailed:
        raise HTTPException(500, "scan failed") from None
    return named_patterns(ticker, db)
