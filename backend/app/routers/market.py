from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.market_summary import market_summary
from app.schemas import MarketSummaryOut

router = APIRouter(prefix="/api")

_SESSIONS = {"7": 7, "30": 30}


@router.get("/market/summary", response_model=MarketSummaryOut)
def get_market_summary(sessions: str = Query(default="7"), db: Session = Depends(get_db)) -> MarketSummaryOut:
    count = _SESSIONS.get(sessions)
    if count is None:
        raise HTTPException(400, "invalid sessions")
    return market_summary(db, count)
