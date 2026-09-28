from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PatternDef, ScanHit, ScanRun, Symbol
from app.schemas import HitOut, HitsOut, PatternIn, PatternOut

router = APIRouter(prefix="/api")


def _spec(body: PatternIn) -> dict:
    name = body.name.strip()
    reference = body.reference.strip().upper()
    if not name:
        raise HTTPException(400, "name is required")
    if not reference:
        raise HTTPException(400, "reference is required")
    if body.min_score < -1 or body.min_score > 1:
        raise HTTPException(400, "min_score must be between -1 and 1")
    if body.top_k < 1:
        raise HTTPException(400, "top_k must be at least 1")
    return {
        "name": name,
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


@router.get("/patterns", response_model=list[PatternOut])
def list_patterns(db: Session = Depends(get_db)) -> list[PatternOut]:
    rows = db.scalars(select(PatternDef).order_by(PatternDef.id)).all()
    return [_out(row) for row in rows]


@router.post("/patterns", response_model=PatternOut)
def create_pattern(body: PatternIn, db: Session = Depends(get_db)) -> PatternOut:
    fields = _spec(body)
    row = PatternDef(name=fields["name"], kind="lookalike", spec=fields["spec"], schedule="daily", enabled=fields["enabled"])
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.put("/patterns/{pattern_id}", response_model=PatternOut)
def update_pattern(pattern_id: int, body: PatternIn, db: Session = Depends(get_db)) -> PatternOut:
    row = db.get(PatternDef, pattern_id)
    if row is None:
        raise HTTPException(404, "unknown pattern")
    fields = _spec(body)
    row.name = fields["name"]
    row.kind = "lookalike"
    row.schedule = "daily"
    row.spec = fields["spec"]
    row.enabled = fields["enabled"]
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
    run = db.scalar(
        select(ScanRun)
        .where(ScanRun.pattern_id == pattern.id, ScanRun.status == "ok")
        .order_by(ScanRun.id.desc())
        .limit(1)
    )
    if run is None:
        return HitsOut(pattern_id=pattern.id, name=pattern.name, reference=reference)
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
            )
            for hit in hits
        ],
    )
