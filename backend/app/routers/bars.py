from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.chart_bars import INTERVALS, chart_window, split_aggregated
from app.db import get_db
from app.indicators import atr, bollinger, ema, macd, rsi, sma, volume_ma
from app.models import DailyBar

router = APIRouter(prefix="/api")

_DEFAULT_PERIOD = {
    "sma": 20,
    "ema": 20,
    "rsi": 14,
    "bollinger": 20,
    "atr": 14,
    "volume_ma": 20,
}


def _warmup_period(names: str) -> int:
    period = 1
    for part in names.split(","):
        part = part.strip().lower()
        if not part:
            continue
        name, _, arg = part.partition(":")
        if name == "macd":
            period = max(period, int(arg) if arg else 26)
        elif name in _DEFAULT_PERIOD:
            period = max(period, int(arg) if arg else _DEFAULT_PERIOD[name])
    return period


def _clip(value, indexes: list[int]):
    if isinstance(value, dict):
        return {key: _clip(item, indexes) for key, item in value.items()}
    return [value[i] for i in indexes]


@router.get("/symbols/{ticker}/indicators")
def indicators(
    ticker: str,
    db: Session = Depends(get_db),
    names: str = Query(default="sma:20"),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    months: int | None = Query(default=None),
    interval: str = Query(default="day"),
) -> dict:
    ticker = ticker.upper()
    size = interval.strip().lower()
    if size not in INTERVALS:
        raise HTTPException(400, "invalid interval")
    try:
        from_, to = chart_window(db, ticker, from_, to, months)
    except ValueError as exc:
        raise HTTPException(400, "invalid months") from exc
    period = _warmup_period(names)
    warmup_from = from_ - timedelta(days=period * 3)
    daily = db.scalars(
        select(DailyBar)
        .where(DailyBar.ticker == ticker, DailyBar.date >= warmup_from, DailyBar.date <= to)
        .order_by(DailyBar.date)
    ).all()
    if not daily:
        raise HTTPException(404, "no bars")
    warmup, visible = split_aggregated(daily, from_, to, size)
    bars = warmup + visible
    indexes = list(range(len(warmup), len(bars)))
    if not indexes:
        raise HTTPException(404, "no bars")
    closes = [float(b.close) for b in bars]
    highs = [float(b.high) for b in bars]
    lows = [float(b.low) for b in bars]
    vols = [float(b.volume) for b in bars]
    series: dict = {"dates": [bars[i].date.isoformat() for i in indexes]}
    for part in names.split(","):
        raw = part.strip().lower()
        if not raw:
            continue
        name, _, arg = raw.partition(":")
        period_arg = int(arg) if arg else None
        if name == "sma":
            computed = sma(closes, period_arg or 20)
        elif name == "ema":
            computed = ema(closes, period_arg or 20)
        elif name == "rsi":
            computed = rsi(closes, period_arg or 14)
        elif name == "macd":
            computed = macd(closes)
        elif name == "bollinger":
            computed = bollinger(closes, period_arg or 20)
        elif name == "atr":
            computed = atr(highs, lows, closes, period_arg or 14)
        elif name == "volume_ma":
            computed = volume_ma(vols, period_arg or 20)
        else:
            continue
        series[raw] = _clip(computed, indexes)
    return series
