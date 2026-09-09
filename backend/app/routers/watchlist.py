from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Symbol, WatchlistItem
from app.schemas import SymbolRow
from app.routers.symbols import _last_and_prev, _change

router = APIRouter(prefix="/api")


@router.get("/watchlist")
def get_watchlist(db: Session = Depends(get_db)) -> list[str]:
    return [w.ticker for w in db.scalars(select(WatchlistItem).order_by(WatchlistItem.position)).all()]


@router.post("/watchlist/{ticker}")
def pin(ticker: str, db: Session = Depends(get_db)) -> SymbolRow:
    ticker = ticker.upper()
    if db.get(WatchlistItem, ticker) is None:
        count = len(db.scalars(select(WatchlistItem)).all())
        db.add(WatchlistItem(ticker=ticker, position=count))
        db.commit()
    row = db.get(Symbol, ticker)
    last, prev, volume = _last_and_prev(db, ticker)
    return SymbolRow(
        ticker=ticker,
        name=row.name if row else ticker,
        board=row.board if row else "",
        type=row.type if row else "stock",
        listed=row.listed if row else True,
        last=last,
        change=_change(last, prev),
        volume=volume,
        watchlist=True,
    )


@router.delete("/watchlist/{ticker}")
def unpin(ticker: str, db: Session = Depends(get_db)) -> dict[str, str]:
    ticker = ticker.upper()
    row = db.get(WatchlistItem, ticker)
    if row is None:
        raise HTTPException(404, "not on watchlist")
    db.delete(row)
    db.commit()
    return {"status": "ok"}
