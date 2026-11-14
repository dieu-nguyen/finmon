"""Reset and seed the isolated QC database for Playwright journeys."""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db import Base
from app.models import (
    CompanyCache,
    DailyBar,
    IngestWatermark,
    PatternDef,
    QuoteSnapshot,
    ScanHit,
    ScanRun,
    Symbol,
)


AS_OF = date(2026, 9, 28)
BARS = 90


def _require_qc_database(url: str) -> str:
    name = url.rsplit("/", 1)[-1].split("?")[0]
    if "qc" not in name.lower():
        raise RuntimeError(f"Refusing to reset {name!r}. Point DATABASE_URL at a QC database such as finmon_qc.")
    return url


def _bars(ticker: str, start_close: int) -> list[DailyBar]:
    start = AS_OF - timedelta(days=BARS - 1)
    rows: list[DailyBar] = []
    for i in range(BARS):
        px = start_close + i * 50
        rows.append(
            DailyBar(
                ticker=ticker,
                date=start + timedelta(days=i),
                open=px,
                high=px + 80,
                low=px - 40,
                close=px,
                volume=1000 + i,
                value=0,
                source="dnse",
            )
        )
    return rows


def seed(db: Session) -> None:
    db.add_all(
        [
            Symbol(ticker="VCB", name="Vietcombank", board="HOSE", type="stock", listed=True),
            Symbol(ticker="HPG", name="Hoa Phat", board="HOSE", type="stock", listed=True),
            Symbol(ticker="E1VFVN30", name="VN30 ETF", board="HOSE", type="etf", listed=True),
            Symbol(ticker="VNINDEX", name="VNIndex", board="HOSE", type="index", listed=True),
        ]
    )
    db.add_all(_bars("VCB", 87000))
    db.add_all(_bars("HPG", 25000))
    db.add(QuoteSnapshot(ticker="VCB", last=91450, ref=91000, ceiling=97300, floor=84700, time=datetime(2026, 9, 28, 7, 30), source="dnse"))
    db.add(QuoteSnapshot(ticker="HPG", last=29450, ref=29000, ceiling=31000, floor=27000, time=datetime(2026, 9, 28, 7, 30), source="dnse"))
    db.add(
        IngestWatermark(
            source="dnse",
            job="backfill",
            as_of=datetime.now(timezone.utc).replace(tzinfo=None),
            status="ok",
            message="qc seed",
        )
    )
    db.add(
        CompanyCache(
            ticker="VCB",
            fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
            payload={
                "ticker": "VCB",
                "profile": [
                    {
                        "organ_name": "Ngân hàng TMCP Ngoại thương Việt Nam",
                        "organ_short_name": "Vietcombank",
                        "sector": "Banks",
                        "com_group_code": "VNINDEX",
                        "symbol": "VCB",
                    }
                ],
                "statements": {
                    "income": [{"item_id": "net_sales", "2024": 1000, "2025": 1200}],
                    "balance": [],
                    "cashflow": [],
                },
                "ratios": [],
            },
        )
    )

    lookalike = PatternDef(
        name="Rise",
        kind="lookalike",
        spec={"reference": "VCB", "min_score": 0.85, "top_k": 20},
        schedule="daily",
        enabled=True,
    )
    named = PatternDef(
        name="Named patterns",
        kind="named",
        spec={"manual": True},
        schedule="manual",
        enabled=False,
    )
    db.add_all([lookalike, named])
    db.flush()

    window_start = AS_OF - timedelta(days=BARS - 1)
    look_run = ScanRun(
        pattern_id=lookalike.id,
        started_at=datetime(2026, 9, 28, 8, 0),
        finished_at=datetime(2026, 9, 28, 8, 1),
        status="ok",
        eligible_count=2,
        compared_count=1,
        as_of=AS_OF,
        reference_compared=True,
    )
    market_run = ScanRun(
        pattern_id=named.id,
        started_at=datetime(2026, 9, 28, 8, 2),
        finished_at=datetime(2026, 9, 28, 8, 3),
        status="ok",
        eligible_count=2,
        compared_count=2,
        as_of=AS_OF,
        reference_compared=False,
        request={"mode": "market", "patterns": ["double_bottom"], "scope": "all", "tickers": []},
    )
    ticker_run = ScanRun(
        pattern_id=named.id,
        started_at=datetime(2026, 9, 28, 8, 4),
        finished_at=datetime(2026, 9, 28, 8, 5),
        status="ok",
        eligible_count=1,
        compared_count=1,
        as_of=AS_OF,
        reference_compared=False,
        request={"mode": "ticker", "patterns": ["double_bottom"], "scope": "ticker", "tickers": ["VCB"]},
    )
    db.add_all([look_run, market_run, ticker_run])
    db.flush()

    swings = {
        "pattern": "double_bottom",
        "points": [
            {"role": "low", "date": "2026-09-20", "price": 88000},
            {"role": "peak", "date": "2026-09-24", "price": 90000},
            {"role": "low", "date": "2026-09-28", "price": 88100},
        ],
        "neckline": [{"date": "2026-09-24", "price": 90000}, {"date": "2026-09-28", "price": 90000}],
    }
    db.add(
        ScanHit(
            run_id=look_run.id,
            pattern_id=lookalike.id,
            ticker="HPG",
            score=0.91,
            window_start=window_start,
            window_end=AS_OF,
            swings=None,
            state=None,
        )
    )
    db.add(
        ScanHit(
            run_id=market_run.id,
            pattern_id=named.id,
            ticker="HPG",
            score=0.88,
            window_start=date(2026, 9, 20),
            window_end=AS_OF,
            swings=swings,
            state="forming",
        )
    )
    db.add(
        ScanHit(
            run_id=ticker_run.id,
            pattern_id=named.id,
            ticker="VCB",
            score=0.86,
            window_start=date(2026, 9, 20),
            window_end=AS_OF,
            swings=swings,
            state="confirmed",
        )
    )
    db.commit()


def reset_and_seed(url: str) -> None:
    url = _require_qc_database(url)
    engine = create_engine(url, pool_pre_ping=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        seed(db)
    finally:
        db.close()
    engine.dispose()


def prepare_database(url: str) -> None:
    name = _require_qc_database(url).rsplit("/", 1)[-1].split("?")[0]
    admin_url = url.rsplit("/", 1)[0] + "/mysql"
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
    engine.dispose()


def main() -> None:
    get_settings.cache_clear()
    url = os.environ.get("DATABASE_URL") or get_settings().database_url
    prepare_database(url)
    reset_and_seed(url)
    print("QC database seeded")


if __name__ == "__main__":
    main()
