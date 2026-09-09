from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DailyBar, QuoteSnapshot, Symbol, WatchlistItem
from app.schemas import BarOut, SymbolRow

router = APIRouter(prefix="/api")


def _change(last: int | None, prev: int | None) -> float | None:
    if last is None or prev is None or prev == 0:
        return None
    return (last - prev) / prev * 100.0


def _last_and_prev(db: Session, ticker: str) -> tuple[int | None, int | None, int | None]:
    snap = db.get(QuoteSnapshot, ticker)
    bars = db.scalars(
        select(DailyBar).where(DailyBar.ticker == ticker).order_by(DailyBar.date.desc()).limit(2)
    ).all()
    volume = bars[0].volume if bars else None
    if snap is not None:
        last = snap.last
        prev = bars[0].close if bars else None
        return last, prev, volume
    last = bars[0].close if bars else None
    prev = bars[1].close if len(bars) > 1 else None
    return last, prev, volume


@router.get("/symbols", response_model=list[SymbolRow])
def list_symbols(
    db: Session = Depends(get_db),
    board: str | None = None,
    q: str | None = None,
    watchlist: bool | None = None,
) -> list[SymbolRow]:
    stmt = select(Symbol)
    if board:
        stmt = stmt.where(Symbol.board == board.upper())
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Symbol.ticker.like(like), Symbol.name.like(like)))
    pinned = {w.ticker for w in db.scalars(select(WatchlistItem)).all()}
    rows = db.scalars(stmt.order_by(Symbol.ticker)).all()
    out: list[SymbolRow] = []
    for row in rows:
        is_pin = row.ticker in pinned
        if watchlist is True and not is_pin:
            continue
        last, prev, volume = _last_and_prev(db, row.ticker)
        out.append(
            SymbolRow(
                ticker=row.ticker,
                name=row.name,
                board=row.board,
                type=row.type,
                listed=row.listed,
                last=last,
                change=_change(last, prev),
                volume=volume,
                watchlist=is_pin,
            )
        )
    return out


@router.get("/symbols/{ticker}/bars", response_model=list[BarOut])
def symbol_bars(
    ticker: str,
    db: Session = Depends(get_db),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
) -> list[BarOut]:
    ticker = ticker.upper()
    if db.get(Symbol, ticker) is None and db.scalars(select(DailyBar).where(DailyBar.ticker == ticker)).first() is None:
        raise HTTPException(404, "unknown ticker")
    if to is None:
        to = date.today()
    if from_ is None:
        from_ = to - timedelta(days=365)
    bars = db.scalars(
        select(DailyBar)
        .where(DailyBar.ticker == ticker, DailyBar.date >= from_, DailyBar.date <= to)
        .order_by(DailyBar.date)
    ).all()
    return [
        BarOut(
            date=b.date,
            open=b.open,
            high=b.high,
            low=b.low,
            close=b.close,
            volume=b.volume,
            value=b.value,
        )
        for b in bars
    ]
