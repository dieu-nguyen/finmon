from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.bars_window import resolve_window
from app.db import get_db
from app.models import DailyBar, QuoteSnapshot, Symbol, WatchlistItem
from app.schemas import BarOut, SymbolPage, SymbolRow

router = APIRouter(prefix="/api")

_TYPES = {"stock", "etf", "index", "bond"}
_PAGE_MAX = 50


def _change(last: int | None, prev: int | None) -> float | None:
    if last is None or prev is None or prev == 0:
        return None
    return (last - prev) / prev * 100.0


def _prices(snap: QuoteSnapshot | None, bars: list[DailyBar]) -> tuple[int | None, int | None, int | None]:
    """bars are newest first."""
    volume = bars[0].volume if bars else None
    if snap is not None:
        last = snap.last
        prev = bars[0].close if bars else None
        return last, prev, volume
    last = bars[0].close if bars else None
    prev = bars[1].close if len(bars) > 1 else None
    return last, prev, volume


def _last_and_prev(db: Session, ticker: str) -> tuple[int | None, int | None, int | None]:
    snap = db.get(QuoteSnapshot, ticker)
    bars = list(
        db.scalars(select(DailyBar).where(DailyBar.ticker == ticker).order_by(DailyBar.date.desc()).limit(2))
    )
    return _prices(snap, bars)


def _like_pattern(fragment: str) -> str:
    return fragment.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _type_clause(symbol_type: str):
    if symbol_type == "all":
        return None
    types = [part.strip().lower() for part in symbol_type.split(",") if part.strip()]
    if not types or any(part not in _TYPES for part in types):
        raise HTTPException(400, "unknown type")
    return Symbol.type.in_(types)


def _board_clause(board: str | None):
    if not board:
        return None
    code = board.strip().upper()
    if code == "UPCOM":
        return Symbol.board.in_(("UPCOM", "UPX"))
    return Symbol.board == code


def _latest_two_bars(db: Session, tickers: list[str]) -> dict[str, list[DailyBar]]:
    ranked = (
        select(
            DailyBar.id.label("id"),
            func.row_number().over(partition_by=DailyBar.ticker, order_by=DailyBar.date.desc()).label("rn"),
        )
        .where(DailyBar.ticker.in_(tickers))
        .subquery()
    )
    bars = db.scalars(
        select(DailyBar)
        .join(ranked, DailyBar.id == ranked.c.id)
        .where(ranked.c.rn <= 2)
        .order_by(DailyBar.ticker, DailyBar.date.desc())
    ).all()
    grouped: dict[str, list[DailyBar]] = {}
    for bar in bars:
        grouped.setdefault(bar.ticker, []).append(bar)
    return grouped


def _symbol_row(row: Symbol, pinned: bool, snap: QuoteSnapshot | None, bars: list[DailyBar]) -> SymbolRow:
    last, prev, volume = _prices(snap, bars)
    return SymbolRow(
        ticker=row.ticker,
        name=row.name,
        board=row.board,
        type=row.type,
        listed=row.listed,
        last=last,
        change=_change(last, prev),
        volume=volume,
        watchlist=pinned,
    )


@router.get("/symbols", response_model=SymbolPage)
def list_symbols(
    db: Session = Depends(get_db),
    symbol_type: str = Query(default="stock", alias="type"),
    board: str | None = None,
    q: str | None = None,
    watchlist: bool | None = None,
    limit: int = Query(default=_PAGE_MAX, ge=1, le=_PAGE_MAX),
    offset: int = Query(default=0, ge=0),
) -> SymbolPage:
    clauses = []
    type_clause = _type_clause(symbol_type)
    if type_clause is not None:
        clauses.append(type_clause)
    board_clause = _board_clause(board)
    if board_clause is not None:
        clauses.append(board_clause)
    rank = None
    query = (q or "").strip()
    if query:
        qu = query.upper()
        escaped = _like_pattern(qu)
        prefix = f"{escaped}%"
        contains = f"%{escaped}%"
        ticker_u = func.upper(Symbol.ticker)
        name_u = func.upper(Symbol.name)
        clauses.append(
            or_(
                ticker_u == qu,
                ticker_u.like(prefix, escape="\\"),
                name_u.like(contains, escape="\\"),
            )
        )
        rank = case((ticker_u == qu, 0), (ticker_u.like(prefix, escape="\\"), 1), else_=2)

    stmt = select(Symbol, WatchlistItem.ticker).outerjoin(WatchlistItem, WatchlistItem.ticker == Symbol.ticker)
    count_stmt = select(func.count()).select_from(Symbol)
    if watchlist:
        stmt = stmt.where(WatchlistItem.ticker.is_not(None))
        count_stmt = count_stmt.join(WatchlistItem, WatchlistItem.ticker == Symbol.ticker)
    if clauses:
        stmt = stmt.where(*clauses)
        count_stmt = count_stmt.where(*clauses)
    if rank is not None:
        stmt = stmt.order_by(rank, Symbol.ticker)
    else:
        stmt = stmt.order_by(Symbol.ticker)

    total = int(db.scalar(count_stmt) or 0)
    page = db.execute(stmt.limit(limit).offset(offset)).all()
    tickers = [row.ticker for row, _pinned in page]
    snaps: dict[str, QuoteSnapshot] = {}
    bars_by: dict[str, list[DailyBar]] = {}
    if tickers:
        snaps = {
            snap.ticker: snap
            for snap in db.scalars(select(QuoteSnapshot).where(QuoteSnapshot.ticker.in_(tickers)))
        }
        bars_by = _latest_two_bars(db, tickers)
    items = [
        _symbol_row(row, pinned is not None, snaps.get(row.ticker), bars_by.get(row.ticker, []))
        for row, pinned in page
    ]
    return SymbolPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/symbols/{ticker}", response_model=SymbolRow)
def get_symbol(ticker: str, db: Session = Depends(get_db)) -> SymbolRow:
    ticker = ticker.upper()
    row = db.get(Symbol, ticker)
    if row is None:
        raise HTTPException(404, "unknown ticker")
    pinned = db.get(WatchlistItem, ticker) is not None
    last, prev, volume = _last_and_prev(db, ticker)
    return SymbolRow(
        ticker=row.ticker,
        name=row.name,
        board=row.board,
        type=row.type,
        listed=row.listed,
        last=last,
        change=_change(last, prev),
        volume=volume,
        watchlist=pinned,
    )


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
    from_, to = resolve_window(from_, to)
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
