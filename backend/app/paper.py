from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import DailyBar, PaperAccount, PaperFill, PaperPosition, QuoteSnapshot, Symbol
from app.schemas import PaperAccountOut, PaperFillOut, PaperOrderIn, PaperPositionOut

STARTING_CASH = 1_000_000_000
ACCOUNT_ID = 1
TRADEABLE = {"stock", "etf"}
FILL_LIMIT = 20


def _account(db: Session) -> PaperAccount:
    row = db.get(PaperAccount, ACCOUNT_ID)
    if row is None:
        row = PaperAccount(id=ACCOUNT_ID, cash=STARTING_CASH, starting_cash=STARTING_CASH)
        db.add(row)
        db.flush()
    return row


def last_price(db: Session, ticker: str) -> int | None:
    snap = db.get(QuoteSnapshot, ticker)
    if snap is not None:
        return snap.last
    bar = db.scalars(select(DailyBar).where(DailyBar.ticker == ticker).order_by(DailyBar.date.desc()).limit(1)).first()
    return bar.close if bar is not None else None


def snapshot(db: Session) -> PaperAccountOut:
    account = _account(db)
    positions = list(db.scalars(select(PaperPosition).order_by(PaperPosition.ticker)).all())
    fills = list(db.scalars(select(PaperFill).order_by(PaperFill.id.desc()).limit(FILL_LIMIT)).all())
    realized = int(db.scalar(select(func.coalesce(func.sum(PaperFill.realized_pnl), 0))) or 0)
    out_positions: list[PaperPositionOut] = []
    market_value = 0
    unrealized = 0
    for pos in positions:
        symbol = db.get(Symbol, pos.ticker)
        last = last_price(db, pos.ticker)
        if last is None:
            last = pos.cost_basis // pos.quantity if pos.quantity else 0
        avg = pos.cost_basis // pos.quantity if pos.quantity else 0
        value = last * pos.quantity
        pnl = value - pos.cost_basis
        market_value += value
        unrealized += pnl
        change_pct = ((last - avg) / avg * 100.0) if avg else None
        out_positions.append(
            PaperPositionOut(
                ticker=pos.ticker,
                name=symbol.name if symbol is not None else pos.ticker,
                quantity=pos.quantity,
                avg_cost=avg,
                last=last,
                market_value=value,
                unrealized_pnl=pnl,
                change_pct=change_pct,
            )
        )
    equity = account.cash + market_value
    return PaperAccountOut(
        starting_cash=account.starting_cash,
        cash=account.cash,
        equity=equity,
        market_value=market_value,
        realized_pnl=realized,
        unrealized_pnl=unrealized,
        total_pnl=equity - account.starting_cash,
        positions=out_positions,
        fills=[
            PaperFillOut(
                id=fill.id,
                ticker=fill.ticker,
                side=fill.side,
                quantity=fill.quantity,
                price=fill.price,
                realized_pnl=fill.realized_pnl,
                created_at=fill.created_at,
            )
            for fill in fills
        ],
    )


def place_order(db: Session, body: PaperOrderIn) -> PaperAccountOut:
    ticker = body.ticker.strip().upper()
    symbol = db.get(Symbol, ticker)
    if symbol is None:
        raise HTTPException(404, "unknown ticker")
    if symbol.type not in TRADEABLE:
        raise HTTPException(400, "not tradeable")
    price = last_price(db, ticker)
    if price is None:
        raise HTTPException(400, "no last price")
    account = _account(db)
    qty = body.quantity
    if body.side == "buy":
        cost = qty * price
        if account.cash < cost:
            raise HTTPException(400, "insufficient cash")
        account.cash -= cost
        pos = db.get(PaperPosition, ticker)
        if pos is None:
            db.add(PaperPosition(ticker=ticker, quantity=qty, cost_basis=cost))
        else:
            pos.quantity += qty
            pos.cost_basis += cost
        realized = 0
    else:
        pos = db.get(PaperPosition, ticker)
        if pos is None or pos.quantity < qty:
            raise HTTPException(400, "insufficient shares")
        sold_cost = pos.cost_basis * qty // pos.quantity
        realized = qty * price - sold_cost
        account.cash += qty * price
        pos.quantity -= qty
        pos.cost_basis -= sold_cost
        if pos.quantity == 0:
            db.delete(pos)
    db.add(
        PaperFill(
            ticker=ticker,
            side=body.side,
            quantity=qty,
            price=price,
            realized_pnl=realized,
            cash_after=account.cash,
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    return snapshot(db)


def reset_account(db: Session) -> PaperAccountOut:
    account = _account(db)
    db.execute(delete(PaperFill))
    db.execute(delete(PaperPosition))
    account.cash = account.starting_cash
    db.commit()
    return snapshot(db)
