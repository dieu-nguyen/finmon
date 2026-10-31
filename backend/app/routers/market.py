from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.market_summary import market_summary
from app.schemas import MarketSummaryOut

router = APIRouter(prefix="/api")

SESSIONS = 30


@router.get("/market/summary", response_model=MarketSummaryOut)
def get_market_summary(db: Session = Depends(get_db)) -> MarketSummaryOut:
    return market_summary(db, SESSIONS)
