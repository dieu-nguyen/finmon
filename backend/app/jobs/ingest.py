from __future__ import annotations

from datetime import datetime, timedelta, timezone
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


def is_weekend_ict(when: datetime | None = None) -> bool:
    now = when or datetime.now(ICT)
    return now.weekday() >= 5


def market_type_for(symbol: Symbol) -> str:
    if symbol.type == "index":
        return "index"
    return "stock"


def upsert_instrument(db: Session, inst: Instrument) -> None:
    row = db.get(Symbol, inst.ticker)
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


def ingest_instruments_and_bars(
    db: Session,
    settings: Settings,
    client: DnseClient | None = None,
    *,
    force: bool = False,
) -> None:
    if client is None:
        client = DnseClient(settings)
    if not client.configured():
        write_watermark(db, "eod", "unconfigured", "DNSE keys missing")
        return
    if not force and is_weekend_ict():
        write_watermark(db, "eod", "ok", "weekend skip")
        return
    try:
        instruments = client.list_instruments()
        wanted = [
            i
            for i in instruments
            if i.type in {"stock", "etf", "index"} and i.listed
        ]
        if settings.ingest_limit:
            wanted = wanted[: settings.ingest_limit]
        for inst in wanted:
            upsert_instrument(db, inst)
        db.commit()

        now = datetime.now(timezone.utc)
        to_ts = int(now.timestamp())
        from_ts = int((now - timedelta(days=400)).timestamp())
        for inst in wanted:
            mt = "index" if inst.type == "index" else "stock"
            bars = client.ohlc(inst.ticker, from_ts, to_ts, market_type=mt)
            for bar in bars:
                existing = db.scalar(
                    select(DailyBar).where(DailyBar.ticker == bar.ticker, DailyBar.date == bar.date)
                )
                if existing:
                    existing.open = bar.open
                    existing.high = bar.high
                    existing.low = bar.low
                    existing.close = bar.close
                    existing.volume = bar.volume
                    existing.value = bar.value
                else:
                    db.add(
                        DailyBar(
                            ticker=bar.ticker,
                            date=bar.date,
                            open=bar.open,
                            high=bar.high,
                            low=bar.low,
                            close=bar.close,
                            volume=bar.volume,
                            value=bar.value,
                            source="dnse",
                        )
                    )
            db.commit()
        write_watermark(db, "eod", "ok")
    except Exception as exc:
        db.rollback()
        write_watermark(db, "eod", "error", str(exc))
        raise


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
        db.commit()
        write_watermark(db, "quotes", "ok")
    except Exception as exc:
        db.rollback()
        write_watermark(db, "quotes", "error", str(exc))
        raise
