from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.jobs.pattern_scan import NamedScanFailed, latest_named_run, trigger_named_market, trigger_named_ticker
from app.models import PatternDef, ScanHit, ScanRun, Symbol
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
def pattern_hits(pattern_id: int, db: Session = Depends(get_db)) -> HitsOut:
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
    if run is None:
        return HitsOut(pattern_id=pattern.id, name=pattern.name, kind=pattern.kind, pattern=pattern_name, reference=reference)
    hits = db.scalars(
        select(ScanHit).where(ScanHit.run_id == run.id).order_by(ScanHit.score.desc(), ScanHit.ticker)
    ).all()
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


def _ordered_hits(db: Session, run: ScanRun) -> list[ScanHit]:
    rows = list(db.scalars(select(ScanHit).where(ScanHit.run_id == run.id)).all())
    order = {name: index for index, name in enumerate(PATTERNS)}
    rows.sort(key=lambda hit: (order.get(_pattern_of(hit), len(PATTERNS)), -hit.score, hit.ticker))
    return rows


def _symbol_names(db: Session, tickers: list[str]) -> dict[str, str]:
    if not tickers:
        return {}
    return {row.ticker: row.name for row in db.scalars(select(Symbol).where(Symbol.ticker.in_(tickers)))}


@router.get("/pattern-catalog", response_model=list[CatalogItem])
def pattern_catalog() -> list[CatalogItem]:
    return [CatalogItem(id=name, label=PATTERN_LABELS[name]) for name in PATTERNS]


@router.get("/named-scans", response_model=NamedMarketOut)
def read_named_scan(db: Session = Depends(get_db)) -> NamedMarketOut:
    run = latest_named_run(db, mode="market")
    if run is None:
        return NamedMarketOut()
    req = run.request or {}
    scope = req.get("scope") if req.get("scope") in ("all", "subset") else "all"
    hits = _ordered_hits(db, run)
    names = _symbol_names(db, [hit.ticker for hit in hits])
    return NamedMarketOut(
        as_of=run.as_of,
        patterns=list(req.get("patterns") or []),
        scope=scope,
        tickers=list(req.get("tickers") or []),
        hits=[
            HitOut(
                ticker=hit.ticker,
                name=names.get(hit.ticker) or hit.ticker,
                score=hit.score,
                window_start=hit.window_start,
                window_end=hit.window_end,
                state=hit.state,
                swings=hit.swings,
                pattern=_pattern_of(hit) or None,
            )
            for hit in hits
        ],
    )


@router.post("/named-scans", response_model=NamedMarketOut)
def run_named_scan(body: NamedMarketIn, db: Session = Depends(get_db)) -> NamedMarketOut:
    patterns = _chosen_patterns(body.patterns)
    tickers = _chosen_tickers(body.tickers) if body.scope == "subset" else []
    if body.scope == "subset" and not tickers:
        raise HTTPException(400, "select a ticker")
    try:
        trigger_named_market(db, patterns, body.scope, tickers, get_settings())
    except NamedScanFailed:
        raise HTTPException(500, "scan failed") from None
    return read_named_scan(db)


@router.get("/symbols/{ticker}/named-patterns", response_model=NamedCheckOut)
def named_patterns(ticker: str, db: Session = Depends(get_db)) -> NamedCheckOut:
    symbol = ticker.strip().upper()
    run = latest_named_run(db, mode="ticker", ticker=symbol)
    if run is None:
        return NamedCheckOut(ticker=symbol)
    req = run.request or {}
    return NamedCheckOut(
        ticker=symbol,
        as_of=run.as_of,
        patterns=list(req.get("patterns") or []),
        matches=[
            NamedMatchOut(
                pattern=_pattern_of(hit),
                state=hit.state or "",
                score=hit.score,
                window_start=hit.window_start,
                window_end=hit.window_end,
                swings=hit.swings or {},
            )
            for hit in _ordered_hits(db, run)
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
