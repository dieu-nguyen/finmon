from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.clients.vnstock_client import CompanyLoad, VnstockClient
from app.config import get_settings
from app.db import get_db
from app.models import CompanyCache

router = APIRouter(prefix="/api")

_loads_guard = threading.Lock()
_loads: dict[str, CompanyLoad] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fresh(db: Session, ticker: str, now: datetime) -> dict | None:
    row = db.get(CompanyCache, ticker)
    if row is not None and now - row.fetched_at < timedelta(hours=24):
        return row.payload
    return None


def begin_company_load(ticker: str) -> CompanyLoad:
    """Start the vnstock reads once per ticker until the 24h cache is written."""
    with _loads_guard:
        current = _loads.get(ticker)
        if current is not None and not current.stored:
            return current
        load = VnstockClient(get_settings()).start(ticker)
        _loads[ticker] = load
        return load


def _store(db: Session, ticker: str, load: CompanyLoad, now: datetime) -> None:
    if load.stored or not load.ready():
        return
    payload = load.payload(ticker)
    with load.store_lock:
        if load.stored:
            return
        row = db.get(CompanyCache, ticker)
        if row is None:
            db.add(CompanyCache(ticker=ticker, payload=payload, fetched_at=now))
        else:
            row.payload = payload
            row.fetched_at = now
        db.commit()
        load.stored = True
    with _loads_guard:
        if _loads.get(ticker) is load:
            _loads.pop(ticker, None)


def _unavailable() -> HTTPException:
    return HTTPException(status_code=503, detail={"error": "unavailable"})


@router.get("/symbols/{ticker}/company/profile")
def company_profile(ticker: str, db: Session = Depends(get_db)) -> dict:
    ticker = ticker.upper()
    now = _now()
    cached = _fresh(db, ticker, now)
    if cached is not None:
        return {
            "ticker": cached.get("ticker", ticker),
            "profile": cached.get("profile", {}),
            "fetched_at": cached.get("fetched_at"),
        }
    try:
        load = begin_company_load(ticker)
        profile = load.profile()
    except Exception:
        raise _unavailable() from None
    _store(db, ticker, load, now)
    body: dict = {"ticker": ticker, "profile": profile}
    if load.stored:
        body["fetched_at"] = load.payload(ticker).get("fetched_at")
    return body


@router.get("/symbols/{ticker}/company/statements")
def company_statements(ticker: str, db: Session = Depends(get_db)) -> dict:
    ticker = ticker.upper()
    now = _now()
    cached = _fresh(db, ticker, now)
    if cached is not None:
        return {
            "ticker": cached.get("ticker", ticker),
            "statements": cached.get("statements", {}),
            "ratios": cached.get("ratios", {}),
            "fetched_at": cached.get("fetched_at"),
        }
    try:
        load = begin_company_load(ticker)
        statements = load.statements()
        ratios = load.ratios()
    except Exception:
        raise _unavailable() from None
    _store(db, ticker, load, now)
    body: dict = {"ticker": ticker, "statements": statements, "ratios": ratios}
    if load.stored:
        body["fetched_at"] = load.payload(ticker).get("fetched_at")
    return body


@router.get("/symbols/{ticker}/company")
def company(ticker: str, db: Session = Depends(get_db)) -> dict:
    ticker = ticker.upper()
    now = _now()
    cached = _fresh(db, ticker, now)
    if cached is not None:
        return cached
    try:
        load = begin_company_load(ticker)
        payload = load.payload(ticker)
    except Exception:
        raise _unavailable() from None
    _store(db, ticker, load, now)
    return payload
