from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.alerts import AlertRule, LastPrice, evaluate_rules
from app.clients.telegram import TelegramSender
from app.config import Settings
from app.models import AlertDelivery, DailyBar, PriceAlert, QuoteSnapshot, Symbol

ICT = ZoneInfo("Asia/Ho_Chi_Minh")


def last_price_for(db: Session, ticker: str) -> int | None:
    snap = db.get(QuoteSnapshot, ticker)
    if snap is not None:
        return snap.last
    bar = db.scalars(
        select(DailyBar).where(DailyBar.ticker == ticker).order_by(DailyBar.date.desc())
    ).first()
    if bar is None:
        return None
    return bar.close


def evaluate_alerts(db: Session, settings: Settings, sender: TelegramSender | None = None) -> int:
    if sender is None:
        sender = TelegramSender(settings.telegram_bot_token, settings.telegram_chat_id)
    rules_rows = db.scalars(select(PriceAlert).where(PriceAlert.enabled.is_(True))).all()
    rules: list[AlertRule] = []
    prices: dict[str, LastPrice] = {}
    for row in rules_rows:
        last = last_price_for(db, row.ticker)
        if last is None:
            continue
        sym = db.get(Symbol, row.ticker)
        board = sym.board if sym else ""
        rules.append(
            AlertRule(
                id=row.id,
                ticker=row.ticker,
                op=row.op,
                price=row.price,
                mode=row.mode,
                enabled=row.enabled,
                last_fired_at=row.last_fired_at,
                board=board,
            )
        )
        prices[row.ticker] = LastPrice(ticker=row.ticker, last=last, board=board)
    now = datetime.now(ICT)
    fired = evaluate_rules(rules, prices, now, sender)
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    for alert_id in fired:
        row = db.get(PriceAlert, alert_id)
        if row is None:
            continue
        row.last_fired_at = now_naive
        db.add(
            AlertDelivery(
                alert_id=alert_id,
                sent_at=now_naive,
                telegram_ok=True,
                payload="ok",
            )
        )
    db.commit()
    return len(fired)
