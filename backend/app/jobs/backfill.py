from __future__ import annotations

import argparse
import signal
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.clients.dnse import DnseClient, OhlcvBar
from app.config import Settings, get_settings
from app.db import SessionLocal
from app.jobs.ingest import upsert_instrument
from app.jobs.rate_limit import BackfillInterrupted, RateLimiter
from app.models import BarSync, DailyBar, Symbol

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
LOCK_NAME = "finmon_backfill"
EXIT_OK = 0
EXIT_LOCK = 2
EXIT_FATAL = 3
EXIT_INTERRUPT = 130
_MAX_WINDOWS = 80


def target_end(now: datetime) -> date:
    """Weekday before 16:30 stops at the previous session. Otherwise the latest weekday."""
    local = now.astimezone(ICT) if now.tzinfo else now.replace(tzinfo=ICT)
    if local.weekday() < 5 and (local.hour, local.minute) < (16, 30):
        day = local.date() - timedelta(days=1)
        while day.weekday() >= 5:
            day -= timedelta(days=1)
        return day
    day = local.date()
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


def next_weekday_1630(now: datetime) -> datetime:
    local = now.astimezone(ICT) if now.tzinfo else now.replace(tzinfo=ICT)
    candidate = local.replace(hour=16, minute=30, second=0, microsecond=0)
    if local.weekday() < 5 and local < candidate:
        return candidate
    day = local.date() + timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return datetime(day.year, day.month, day.day, 16, 30, tzinfo=ICT)


def _date_ts(day: date) -> int:
    return int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp())


def _range_ts(start: date, end: date) -> tuple[int, int]:
    return _date_ts(start), _date_ts(end + timedelta(days=1)) - 1


def _caught_up(sync: BarSync, target: date) -> bool:
    if sync.history_floor is None:
        return False
    if sync.newest_date is None:
        return True
    return sync.newest_date >= target


def _lock(db: Session) -> bool:
    got = db.execute(text("SELECT GET_LOCK(:name, 0)"), {"name": LOCK_NAME}).scalar()
    return int(got or 0) == 1


def _unlock(db: Session) -> None:
    db.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": LOCK_NAME})


def _bounds(db: Session, ticker: str, target: date) -> tuple[date | None, date | None]:
    """Bars after `target` are today's forming quote candle and do not advance the cursor."""
    row = db.execute(
        select(func.min(DailyBar.date), func.max(DailyBar.date)).where(
            DailyBar.ticker == ticker, DailyBar.date <= target
        )
    ).one()
    return row[0], row[1]


def _touch(sync: BarSync, db: Session, ticker: str, target: date) -> None:
    oldest, newest = _bounds(db, ticker, target)
    sync.oldest_date = oldest
    sync.newest_date = newest
    sync.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    sync.last_error = ""


def _upsert_bars(db: Session, bars: list[OhlcvBar]) -> None:
    for bar in bars:
        existing = db.scalar(select(DailyBar).where(DailyBar.ticker == bar.ticker, DailyBar.date == bar.date))
        if existing:
            existing.open = bar.open
            existing.high = bar.high
            existing.low = bar.low
            existing.close = bar.close
            existing.volume = bar.volume
            existing.value = bar.value
            existing.source = "dnse"
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


def _fetch_ohlc(
    client: DnseClient,
    ticker: str,
    market_type: str,
    start: date,
    end: date,
) -> list[OhlcvBar]:
    if start > end:
        return []
    from_ts, to_ts = _range_ts(start, end)
    bars = client.ohlc(ticker, from_ts, to_ts, market_type=market_type)
    return [bar for bar in bars if start <= bar.date <= end]


def _sync_one(
    db: Session,
    client: DnseClient,
    sync: BarSync,
    target: date,
    *,
    stop_fn,
) -> None:
    ticker = sync.ticker
    sym = db.get(Symbol, ticker)
    market_type = "index" if sym is not None and sym.type == "index" else "stock"
    sync.status = "partial"
    sync.last_error = ""
    sync.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()

    forward_done = sync.newest_date is not None and sync.newest_date >= target
    windows = 0
    while not forward_done:
        if stop_fn():
            raise BackfillInterrupted()
        windows += 1
        if windows > _MAX_WINDOWS:
            raise RuntimeError("forward walk exceeded limit")
        start = (sync.newest_date + timedelta(days=1)) if sync.newest_date else target
        if start > target:
            forward_done = True
            break
        before = sync.newest_date
        bars = _fetch_ohlc(client, ticker, market_type, start, target)
        if bars:
            _upsert_bars(db, bars)
        _touch(sync, db, ticker, target)
        db.commit()
        db.refresh(sync)
        if not bars or sync.newest_date == before:
            forward_done = True
            break
        forward_done = sync.newest_date is not None and sync.newest_date >= target

    windows = 0
    while sync.history_floor is None:
        if stop_fn():
            raise BackfillInterrupted()
        windows += 1
        if windows > _MAX_WINDOWS:
            raise RuntimeError("backward walk exceeded limit")
        if sync.oldest_date is None:
            end = target
        else:
            end = sync.oldest_date - timedelta(days=1)
        start = end - timedelta(days=364)
        if end < start:
            sync.history_floor = sync.oldest_date or start
            break
        bars = _fetch_ohlc(client, ticker, market_type, start, end)
        if not bars:
            _touch(sync, db, ticker, target)
            sync.history_floor = sync.oldest_date or start
            db.commit()
            db.refresh(sync)
            break
        _upsert_bars(db, bars)
        _touch(sync, db, ticker, target)
        db.commit()
        db.refresh(sync)

    db.refresh(sync)
    if sync.history_floor is not None and forward_done:
        sync.status = "complete"
        sync.last_error = ""
        sync.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()


def run_once(
    db: Session,
    settings: Settings,
    client: DnseClient | None = None,
    *,
    now: datetime | None = None,
    ticker: str | None = None,
    limiter: RateLimiter | None = None,
    stop_fn=None,
) -> int:
    stop_fn = stop_fn or (lambda: False)
    if not settings.dnse_api_key or not settings.dnse_api_secret:
        print("DNSE keys missing")
        return EXIT_FATAL
    if not _lock(db):
        print("a backfill is already running")
        return EXIT_LOCK
    current = ""
    try:
        if client is None:
            limiter = limiter or RateLimiter(stop_fn=stop_fn)
            client = DnseClient(settings, limiter=limiter)
        local_now = now or datetime.now(ICT)
        target = target_end(local_now)
        try:
            instruments = client.list_instruments()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (401, 403):
                print("DNSE rejected the API key")
                return EXIT_FATAL
            raise
        catalog = [i for i in instruments if i.type in {"stock", "etf", "index"} and i.listed]
        deduped: dict[str, object] = {}
        for inst in catalog:
            deduped.setdefault(inst.ticker, inst)
        catalog = list(deduped.values())
        wanted = catalog
        if ticker:
            wanted = [i for i in catalog if i.ticker == ticker.upper()]
            if not wanted:
                print(f"{ticker.upper()} is not in the DNSE instrument list")
                return EXIT_FATAL
        for inst in catalog:
            upsert_instrument(db, inst)
        db.commit()
        only = ticker.upper() if ticker else None
        for inst in wanted:
            row = db.get(BarSync, inst.ticker)
            if row is None:
                db.add(BarSync(ticker=inst.ticker, status="pending", last_error=""))
        db.commit()

        rows = list(db.scalars(select(BarSync).order_by(BarSync.ticker)).all())
        work = [row for row in rows if (only is None or row.ticker == only) and not _caught_up(row, target)]
        work.sort(key=lambda row: (0 if row.status in {"partial", "error"} else 1, row.ticker))

        for row in work:
            current = row.ticker
            if stop_fn():
                print(f"stopped at {current}")
                return EXIT_INTERRUPT
            try:
                _sync_one(db, client, row, target, stop_fn=stop_fn)
                print(row.ticker)
            except BackfillInterrupted:
                print(f"stopped at {current}")
                return EXIT_INTERRUPT
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status in (401, 403):
                    print("DNSE rejected the API key")
                    return EXIT_FATAL
                fresh = db.get(BarSync, row.ticker)
                if fresh is not None:
                    fresh.status = "error"
                    fresh.last_error = str(exc)[:500]
                    fresh.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    db.commit()
                print(f"{row.ticker} error")
            except httpx.HTTPError as exc:
                fresh = db.get(BarSync, row.ticker)
                if fresh is not None:
                    fresh.status = "error"
                    fresh.last_error = str(exc)[:500]
                    fresh.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    db.commit()
                print(f"{row.ticker} error")
            except Exception as exc:
                db.rollback()
                fresh = db.get(BarSync, current)
                if fresh is not None:
                    fresh.status = "error"
                    fresh.last_error = str(exc)[:500]
                    fresh.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    db.commit()
                print(f"{current} error")

        tracked = rows if only is None else [row for row in rows if row.ticker == only]
        db.expire_all()
        tracked = [db.get(BarSync, row.ticker) for row in tracked]
        tracked = [row for row in tracked if row is not None]
        completed = sum(1 for row in tracked if row.status == "complete")
        partial = sum(1 for row in tracked if row.status == "partial")
        errors = sum(1 for row in tracked if row.status == "error")
        print(f"completed={completed} partial={partial} error={errors}")
        return EXIT_OK
    except BackfillInterrupted:
        print(f"stopped at {current}" if current else "stopped")
        return EXIT_INTERRUPT
    except Exception as exc:
        db.rollback()
        print(str(exc))
        return EXIT_FATAL
    finally:
        _unlock(db)


def run_follow(
    db_factory,
    settings: Settings,
    *,
    ticker: str | None = None,
    now_fn=None,
    sleep_fn=None,
    stop_fn=None,
) -> int:
    now_fn = now_fn or (lambda: datetime.now(ICT))
    sleep_fn = sleep_fn or __import__("time").sleep
    stop_fn = stop_fn or (lambda: False)
    while True:
        db = db_factory()
        try:
            code = run_once(db, settings, now=now_fn(), ticker=ticker, stop_fn=stop_fn)
        finally:
            db.close()
        if stop_fn():
            return EXIT_INTERRUPT
        if code in (EXIT_FATAL, EXIT_INTERRUPT):
            return code
        nxt = next_weekday_1630(now_fn())
        print(f"next backfill at {nxt.isoformat()}")
        while now_fn() < nxt:
            if stop_fn():
                return EXIT_INTERRUPT
            sleep_fn(1.0)
        if stop_fn():
            return EXIT_INTERRUPT


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.jobs.backfill")
    parser.add_argument("--follow", action="store_true")
    parser.add_argument("--ticker", default=None)
    args = parser.parse_args(argv)
    settings = get_settings()
    if not settings.dnse_api_key or not settings.dnse_api_secret:
        print("DNSE keys missing")
        return EXIT_FATAL
    stopped = {"value": False}

    def stop_fn() -> bool:
        return stopped["value"]

    def _handle(_signum, _frame) -> None:
        stopped["value"] = True
        print("stopping after the current chunk")

    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)
    if args.follow:
        return run_follow(SessionLocal, settings, ticker=args.ticker, stop_fn=stop_fn)
    db = SessionLocal()
    try:
        return run_once(db, settings, ticker=args.ticker, stop_fn=stop_fn)
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
