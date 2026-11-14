"""HOSE breadth and turnover for the pinned strip, on VNINDEX session dates only."""

from datetime import date, datetime

from sqlalchemy import Date, and_, case, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.models import DailyBar, Symbol
from app.schemas import MarketDayOut, MarketIndexOut, MarketSummaryOut

INDEX = "VNINDEX"
SOURCE = "dnse"
HOSE_TYPES = ("stock", "etf")


def _points(stored: int) -> float:
    return round(stored / 100, 2)


def _as_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _calendar(db: Session, sessions: int) -> list[tuple[date, int]]:
    rows = db.execute(
        select(DailyBar.date, DailyBar.close)
        .where(DailyBar.ticker == INDEX, DailyBar.source == SOURCE)
        .order_by(DailyBar.date.desc())
        .limit(sessions + 1)
    ).all()
    return [(_as_date(row.date), int(row.close)) for row in reversed(rows)]


def _window(calendar: list[tuple[date, int]], sessions: int) -> tuple[list[tuple[date, int]], date | None]:
    if len(calendar) > sessions:
        return calendar[-sessions:], calendar[-(sessions + 1)][0]
    return calendar, None


def _dates(dates: list[date]):
    parts = [select(literal(day, type_=Date).label("d")) for day in dates]
    return parts[0].subquery("days") if len(parts) == 1 else union_all(*parts).subquery("days")


def _session_rows(db: Session, pairs: list[tuple[date, date | None]], dates: list[date]) -> dict[date, tuple[int, int, int, int]]:
    if not pairs:
        return {}
    parts = [
        select(
            literal(day, type_=Date).label("session_date"),
            literal(prev, type_=Date).label("prev_date"),
        )
        for day, prev in pairs
    ]
    sessions = parts[0].subquery("sess") if len(parts) == 1 else union_all(*parts).subquery("sess")
    # Equality on (ticker, date) uses uq_daily_bar_ticker_date. A date IN-list ref on ticker alone walks each name's history.
    days = _dates(dates)
    bars = (
        select(
            DailyBar.ticker.label("ticker"),
            DailyBar.date.label("date"),
            DailyBar.close.label("close"),
            DailyBar.value.label("value"),
        )
        .select_from(Symbol)
        .join(days, literal(True))
        .join(DailyBar, and_(DailyBar.ticker == Symbol.ticker, DailyBar.date == days.c.d))
        .where(
            DailyBar.source == SOURCE,
            Symbol.board == "HOSE",
            Symbol.type.in_(HOSE_TYPES),
        )
        .prefix_with("STRAIGHT_JOIN")
        .subquery("bars")
    )
    curr = bars.alias("curr")
    prev = bars.alias("prev")
    counted = and_(prev.c.close.is_not(None), curr.c.close.is_not(None))
    rows = db.execute(
        select(
            sessions.c.session_date,
            func.coalesce(func.sum(case((and_(counted, curr.c.close > prev.c.close), 1), else_=0)), 0),
            func.coalesce(func.sum(case((and_(counted, curr.c.close < prev.c.close), 1), else_=0)), 0),
            func.coalesce(func.sum(case((and_(counted, curr.c.close == prev.c.close), 1), else_=0)), 0),
            func.coalesce(func.sum(curr.c.value), 0),
        )
        .select_from(sessions)
        .outerjoin(curr, curr.c.date == sessions.c.session_date)
        .outerjoin(prev, and_(prev.c.ticker == curr.c.ticker, prev.c.date == sessions.c.prev_date))
        .group_by(sessions.c.session_date)
    ).all()
    return {
        _as_date(row[0]): (int(row[1] or 0), int(row[2] or 0), int(row[3] or 0), int(row[4] or 0)) for row in rows
    }


def market_summary(db: Session, sessions: int) -> MarketSummaryOut:
    calendar = _calendar(db, sessions)
    window, prior = _window(calendar, sessions)
    if not window:
        return MarketSummaryOut(sessions=sessions, as_of=None, index=MarketIndexOut(), days=[])

    pairs: list[tuple[date, date | None]] = []
    previous = prior
    for day, _close in window:
        pairs.append((day, previous))
        previous = day
    dates = [day for day, _prev in pairs]
    if prior is not None:
        dates.append(prior)
    counts = _session_rows(db, pairs, dates)

    first = window[0][1]
    last = window[-1][1]
    change = round((last - first) / 100, 2)
    change_pct = None if first == 0 else round((last - first) / first * 100, 2)
    days = []
    for day, _close in window:
        up, down, flat, value = counts.get(day, (0, 0, 0, 0))
        days.append(MarketDayOut(date=day, up=up, down=down, flat=flat, value=value))
    return MarketSummaryOut(
        sessions=sessions,
        as_of=window[-1][0],
        index=MarketIndexOut(
            close=_points(last),
            change=change,
            change_pct=change_pct,
            closes=[_points(close) for _day, close in window],
        ),
        days=days,
    )
