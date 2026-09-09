from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.indicators import atr, bollinger, ema, macd, rsi, sma, volume_ma
from app.models import DailyBar

router = APIRouter(prefix="/api")


@router.get("/symbols/{ticker}/indicators")
def indicators(
    ticker: str,
    db: Session = Depends(get_db),
    names: str = Query(default="sma:20"),
) -> dict:
    ticker = ticker.upper()
    bars = db.scalars(
        select(DailyBar).where(DailyBar.ticker == ticker).order_by(DailyBar.date)
    ).all()
    if not bars:
        raise HTTPException(404, "no bars")
    closes = [float(b.close) for b in bars]
    highs = [float(b.high) for b in bars]
    lows = [float(b.low) for b in bars]
    vols = [float(b.volume) for b in bars]
    dates = [b.date.isoformat() for b in bars]
    series: dict = {"dates": dates}
    for part in names.split(","):
        part = part.strip().lower()
        if not part:
            continue
        name, _, arg = part.partition(":")
        period = int(arg) if arg else None
        if name == "sma":
            series[part] = sma(closes, period or 20)
        elif name == "ema":
            series[part] = ema(closes, period or 20)
        elif name == "rsi":
            series[part] = rsi(closes, period or 14)
        elif name == "macd":
            series[part] = macd(closes)
        elif name == "bollinger":
            series[part] = bollinger(closes, period or 20)
        elif name == "atr":
            series[part] = atr(highs, lows, closes, period or 14)
        elif name == "volume_ma":
            series[part] = volume_ma(vols, period or 20)
    return series
