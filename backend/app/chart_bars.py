"""Chart window and OHLC aggregation from stored daily bars.

Months count back from the newest `daily_bar` date. Week buckets are the
Monday–Friday trading week in Asia/Ho_Chi_Minh (ISO weeks, which start Monday).
Month buckets are calendar months in that same zone. No bars are invented.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.bars_window import resolve_window
from app.models import DailyBar

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
INTERVALS = {"day", "week", "month"}


@dataclass(frozen=True)
class Candle:
    date: date
    open: int
    high: int
    low: int
    close: int
    volume: int
    value: int


def subtract_months(anchor: date, months: int) -> date:
    """Calendar months before `anchor`, clamped to the last day of the target month."""
    index = anchor.year * 12 + (anchor.month - 1) - months
    year, month0 = divmod(index, 12)
    month = month0 + 1
    day = min(anchor.day, _month_length(year, month))
    return date(year, month, day)


def chart_window(
    db: Session,
    ticker: str,
    from_: date | None,
    to: date | None,
    months: int | None,
) -> tuple[date, date]:
    if months is None:
        return resolve_window(from_, to)
    if months < 1:
        raise ValueError("invalid months")
    newest = db.scalar(select(func.max(DailyBar.date)).where(DailyBar.ticker == ticker))
    anchor = newest if newest is not None else date.today()
    return subtract_months(anchor, months), anchor


def aggregate_candles(bars, interval: str) -> list[Candle]:
    """Collapse sorted-or-unsorted daily rows into day, week, or month candles."""
    if interval not in INTERVALS:
        raise ValueError("invalid interval")
    ordered = sorted(bars, key=lambda bar: bar.date)
    if interval == "day" or not ordered:
        return [_one(bar) for bar in ordered]
    grouped: list[list] = []
    key = None
    for bar in ordered:
        bucket = _bucket_key(bar.date, interval)
        if key != bucket:
            grouped.append([])
            key = bucket
        grouped[-1].append(bar)
    return [_collapse(bucket) for bucket in grouped]


def split_aggregated(bars, from_: date, to: date, interval: str) -> tuple[list[Candle], list[Candle]]:
    """Warmup candles (strictly before `from_`) and the visible window, aggregated apart."""
    warmup = [bar for bar in bars if bar.date < from_]
    visible = [bar for bar in bars if from_ <= bar.date <= to]
    return aggregate_candles(warmup, interval), aggregate_candles(visible, interval)


def _one(bar) -> Candle:
    return Candle(
        date=bar.date,
        open=int(bar.open),
        high=int(bar.high),
        low=int(bar.low),
        close=int(bar.close),
        volume=int(bar.volume),
        value=int(bar.value or 0),
    )


def _collapse(bucket) -> Candle:
    first = bucket[0]
    last = bucket[-1]
    return Candle(
        date=last.date,
        open=int(first.open),
        high=max(int(bar.high) for bar in bucket),
        low=min(int(bar.low) for bar in bucket),
        close=int(last.close),
        volume=sum(int(bar.volume) for bar in bucket),
        value=sum(int(bar.value or 0) for bar in bucket),
    )


def _bucket_key(day: date, interval: str) -> tuple[int, int]:
    local = datetime(day.year, day.month, day.day, 12, tzinfo=ICT)
    if interval == "week":
        iso = local.isocalendar()
        return iso.year, iso.week
    return local.year, local.month


def _month_length(year: int, month: int) -> int:
    if month == 2:
        leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        return 29 if leap else 28
    if month in {4, 6, 9, 11}:
        return 30
    return 31
