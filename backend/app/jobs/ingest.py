from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.dnse import DnseClient, Instrument
from app.config import Settings
from app.models import DailyBar, IngestWatermark, QuoteSnapshot, Symbol, WatchlistItem

ICT = ZoneInfo("Asia/Ho_Chi_Minh")


def write_watermark(db: Session, job: str, status: str, message: str = "") -> None:
    row = db.scalar(select(IngestWatermark).where(IngestWatermark.job == job, IngestWatermark.source == "dnse"))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if row is None:
        row = IngestWatermark(source="dnse", job=job, as_of=now, status=status, message=message)
        db.add(row)
    else:
        row.as_of = now
        row.status = status
        row.message = message
    db.commit()


def upsert_instrument(db: Session, inst: Instrument) -> None:
    row = db.get(Symbol, inst.ticker)
    if row is None:
        row = next((obj for obj in db.new if isinstance(obj, Symbol) and obj.ticker == inst.ticker), None)
    if row is None:
        db.add(
            Symbol(
                ticker=inst.ticker,
                name=inst.name,
                board=inst.board,
                type=inst.type,
                listed=inst.listed,
            )
        )
        return
    row.name = inst.name
    row.board = inst.board
    row.type = inst.type
    row.listed = inst.listed


def apply_quote_candle(db: Session, ticker: str, last: int, today: date) -> None:
    """Form today's candle from sampled last prices. A DNSE bar for today is left as stored."""
    if last <= 0:
        return
    row = db.scalar(select(DailyBar).where(DailyBar.ticker == ticker, DailyBar.date == today))
    if row is not None and row.source == "dnse":
        return
    if row is None:
        prev = db.scalar(
            select(DailyBar)
            .where(DailyBar.ticker == ticker, DailyBar.date < today)
            .order_by(DailyBar.date.desc())
        )
        db.add(
            DailyBar(
                ticker=ticker,
                date=today,
                open=prev.close if prev is not None else last,
                high=last,
                low=last,
                close=last,
                volume=0,
                value=0,
                source="quote",
            )
        )
        return
    row.high = max(row.high, last)
    row.low = min(row.low, last)
    row.close = last


def ingest_watchlist_quotes(
    db: Session,
    settings: Settings,
    client: DnseClient | None = None,
    *,
    force: bool = False,
) -> None:
    if client is None:
        client = DnseClient(settings)
    if not client.configured():
        write_watermark(db, "quotes", "unconfigured", "DNSE keys missing")
        return
    now = datetime.now(ICT)
    in_session = 9 <= now.hour < 15 or (now.hour == 15 and now.minute == 0)
    if not force and (now.weekday() >= 5 or not in_session):
        write_watermark(db, "quotes", "ok", "outside session")
        return
    try:
        tickers = [w.ticker for w in db.scalars(select(WatchlistItem)).all()]
        for ticker in tickers:
            sym = db.get(Symbol, ticker)
            board = sym.board if sym else None
            quote = client.latest_quote(ticker, board_id=board or None)
            row = db.get(QuoteSnapshot, ticker)
            if row is None:
                db.add(
                    QuoteSnapshot(
                        ticker=ticker,
                        last=quote.last,
                        ref=quote.ref,
                        ceiling=quote.ceiling,
                        floor=quote.floor,
                        time=datetime.now(timezone.utc).replace(tzinfo=None),
                        source="dnse",
                    )
                )
            else:
                row.last = quote.last
                row.ref = quote.ref
                row.ceiling = quote.ceiling
                row.floor = quote.floor
                row.time = datetime.now(timezone.utc).replace(tzinfo=None)
            if quote.last:
                apply_quote_candle(db, ticker, quote.last, now.date())
        db.commit()
        write_watermark(db, "quotes", "ok")
    except Exception as exc:
        db.rollback()
        write_watermark(db, "quotes", "error", str(exc))
        raise
