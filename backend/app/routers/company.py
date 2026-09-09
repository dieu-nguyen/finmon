from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.clients.vnstock_client import VnstockClient
from app.config import get_settings
from app.db import get_db
from app.models import CompanyCache

router = APIRouter(prefix="/api")


@router.get("/symbols/{ticker}/company")
def company(ticker: str, db: Session = Depends(get_db)) -> dict:
    ticker = ticker.upper()
    settings = get_settings()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = db.get(CompanyCache, ticker)
    if row is not None and now - row.fetched_at < timedelta(hours=24):
        return row.payload
    client = VnstockClient(settings)
    try:
        payload = client.fetch(ticker)
    except Exception:
        raise HTTPException(status_code=503, detail={"error": "unavailable"})
    if row is None:
        db.add(CompanyCache(ticker=ticker, payload=payload, fetched_at=now))
    else:
        row.payload = payload
        row.fetched_at = now
    db.commit()
    return payload
