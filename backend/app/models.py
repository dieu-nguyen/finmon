from datetime import date, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Symbol(Base):
    __tablename__ = "symbol"

    ticker: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    board: Mapped[str] = mapped_column(String(16), default="")
    type: Mapped[str] = mapped_column(String(16), default="stock")
    listed: Mapped[bool] = mapped_column(Boolean, default=True)


class DailyBar(Base):
    __tablename__ = "daily_bar"
    __table_args__ = (UniqueConstraint("ticker", "date", name="uq_daily_bar_ticker_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    date: Mapped[date] = mapped_column(Date)
    open: Mapped[int] = mapped_column(BigInteger)
    high: Mapped[int] = mapped_column(BigInteger)
    low: Mapped[int] = mapped_column(BigInteger)
    close: Mapped[int] = mapped_column(BigInteger)
    volume: Mapped[int] = mapped_column(BigInteger, default=0)
    value: Mapped[int] = mapped_column(BigInteger, default=0)
    source: Mapped[str] = mapped_column(String(16), default="dnse")


class QuoteSnapshot(Base):
    __tablename__ = "quote_snapshot"

    ticker: Mapped[str] = mapped_column(String(32), primary_key=True)
    last: Mapped[int] = mapped_column(BigInteger)
    ref: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    ceiling: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    floor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="dnse")


class WatchlistItem(Base):
    __tablename__ = "watchlist_item"

    ticker: Mapped[str] = mapped_column(String(32), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Drawing(Base):
    __tablename__ = "drawing"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    tool: Mapped[str] = mapped_column(String(32))
    points: Mapped[list] = mapped_column(JSON, default=list)
    style: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChartNote(Base):
    __tablename__ = "chart_note"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    date: Mapped[date] = mapped_column(Date)
    price: Mapped[int] = mapped_column(BigInteger)
    text: Mapped[str] = mapped_column(Text, default="")


class PageNote(Base):
    __tablename__ = "page_note"

    ticker: Mapped[str] = mapped_column(String(32), primary_key=True)
    body: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PageNoteRevision(Base):
    __tablename__ = "page_note_revision"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PriceAlert(Base):
    __tablename__ = "price_alert"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    op: Mapped[str] = mapped_column(String(8))
    price: Mapped[int] = mapped_column(BigInteger)
    mode: Mapped[str] = mapped_column(String(8), default="once")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AlertDelivery(Base):
    __tablename__ = "alert_delivery"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("price_alert.id"))
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    telegram_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[str] = mapped_column(Text, default="")


class IngestWatermark(Base):
    __tablename__ = "ingest_watermark"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32))
    job: Mapped[str] = mapped_column(String(32))
    as_of: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ok")
    message: Mapped[str] = mapped_column(Text, default="")


class CompanyCache(Base):
    __tablename__ = "company_cache"

    ticker: Mapped[str] = mapped_column(String(32), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime)
