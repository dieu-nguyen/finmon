from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.clients.dnse import DnseClient
from app.config import Settings
from app.jobs.backfill import EXIT_LOCK, next_weekday_1630, run_once, target_end
from app.jobs.ingest import apply_quote_candle, ingest_watchlist_quotes
from app.jobs.rate_limit import (
    INSTRUMENTS_HOUR_PAUSE,
    OHLC_DAY_PAUSE,
    OHLC_HOUR_PAUSE,
    RateLimiter,
)
from app.models import BarSync, DailyBar, QuoteSnapshot, Symbol, WatchlistItem

ICT = ZoneInfo("Asia/Ho_Chi_Minh")


def _settings() -> Settings:
    return Settings(dnse_api_key="k", dnse_api_secret="s")


def _ts(day: date) -> int:
    return int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp())


def _ohlc(days: list[date], *, price: float = 10.0, volume: int = 5) -> dict:
    return {
        "t": [_ts(day) for day in days],
        "o": [price] * len(days),
        "h": [price + 2] * len(days),
        "l": [price - 1] * len(days),
        "c": [price + 1] * len(days),
        "v": [volume] * len(days),
    }


def _instruments(tickers: list[str]) -> dict:
    return {
        "data": [
            {"symbol": ticker, "name": ticker, "boardId": "HOSE", "securityGroupId": "STOCK"}
            for ticker in tickers
        ]
    }


class Feed:
    def __init__(self, tickers: list[str]) -> None:
        self.tickers = tickers
        self.bars: dict[str, list[date]] = {}
        self.fail: set[str] = set()
        self.ranges: list[tuple[str, date, date]] = []
        self.instruments_payload: list[dict] | None = None
        self.status_for: dict[str, int] = {}
        self.second_bar: tuple[float, float, float, float, int] | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/instruments"):
            if self.instruments_payload is not None:
                return httpx.Response(200, json={"data": self.instruments_payload})
            return httpx.Response(200, json=_instruments(self.tickers))
        if request.url.path.endswith("/ohlc"):
            symbol = request.url.params["symbol"]
            start = datetime.fromtimestamp(int(request.url.params["from"]), timezone.utc).date()
            end = datetime.fromtimestamp(int(request.url.params["to"]), timezone.utc).date()
            self.ranges.append((symbol, start, end))
            if symbol in self.status_for:
                return httpx.Response(self.status_for[symbol], json={"error": "rejected"})
            if symbol in self.fail:
                return httpx.Response(404, json={"error": "missing"})
            days = [day for day in self.bars.get(symbol, []) if start <= day <= end]
            payload = _ohlc(days)
            if self.second_bar is not None and days:
                open_, high, low, close, volume = self.second_bar
                payload["t"].append(payload["t"][-1])
                payload["o"].append(open_)
                payload["h"].append(high)
                payload["l"].append(low)
                payload["c"].append(close)
                payload["v"].append(volume)
            return httpx.Response(200, json=payload)
        return httpx.Response(404, json={"error": request.url.path})

    def client(self) -> DnseClient:
        return DnseClient(_settings(), transport=httpx.MockTransport(self.handler))


def _bar(ticker: str, day: date, *, close: int, source: str = "dnse", open_: int | None = None) -> DailyBar:
    px = open_ if open_ is not None else close
    return DailyBar(
        ticker=ticker,
        date=day,
        open=px,
        high=close,
        low=px,
        close=close,
        volume=1,
        value=0,
        source=source,
    )


def test_duplicate_instrument_ticker_is_stored_once(db):
    feed = Feed(["VEOF", "VEOF"])
    feed.bars["VEOF"] = [date(2026, 9, 28)]
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    session = sessionmaker(bind=db.get_bind(), autoflush=False)()
    try:
        assert run_once(session, _settings(), feed.client(), now=now) == 0
        assert len(session.scalars(select(Symbol).where(Symbol.ticker == "VEOF")).all()) == 1
        assert len(session.scalars(select(BarSync).where(BarSync.ticker == "VEOF")).all()) == 1
    finally:
        session.close()


def test_target_end_rules():
    assert target_end(datetime(2026, 9, 28, 10, 0, tzinfo=ICT)) == date(2026, 9, 25)
    assert target_end(datetime(2026, 9, 28, 16, 30, tzinfo=ICT)) == date(2026, 9, 28)
    assert target_end(datetime(2026, 9, 26, 12, 0, tzinfo=ICT)) == date(2026, 9, 25)
    assert target_end(datetime(2026, 9, 27, 0, 30, tzinfo=ICT)) == date(2026, 9, 25)
    nxt = next_weekday_1630(datetime(2026, 9, 28, 10, 0, tzinfo=ICT))
    assert nxt == datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    nxt = next_weekday_1630(datetime(2026, 9, 25, 16, 30, tzinfo=ICT))
    assert nxt == datetime(2026, 9, 28, 16, 30, tzinfo=ICT)


def test_second_run_requests_only_the_forward_gap(db):
    feed = Feed(["VCB"])
    feed.bars["VCB"] = [date(2026, 9, 1), date(2026, 9, 28)]
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    sync = db.get(BarSync, "VCB")
    assert sync is not None
    assert sync.history_floor is not None
    assert sync.newest_date == date(2026, 9, 28)
    feed.ranges.clear()
    feed.bars["VCB"] = [date(2026, 9, 1), date(2026, 9, 28), date(2026, 9, 30)]
    later = datetime(2026, 9, 30, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=later) == 0
    assert feed.ranges == [("VCB", date(2026, 9, 29), date(2026, 9, 30))]


def test_failure_resumes_the_failed_ticker_only(db):
    feed = Feed(["FPT", "VCB"])
    feed.fail.add("FPT")
    feed.bars["VCB"] = [date(2026, 9, 28)]
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert db.get(BarSync, "VCB").status == "complete"
    assert db.get(BarSync, "FPT").status == "error"
    feed.fail.clear()
    feed.bars["FPT"] = [date(2026, 9, 28)]
    feed.ranges.clear()
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert [symbol for symbol, _start, _end in feed.ranges] == ["FPT", "FPT"]
    assert db.get(BarSync, "FPT").status == "complete"
    assert db.get(BarSync, "FPT").history_floor is not None


def test_empty_older_window_sets_history_floor(db):
    feed = Feed(["VCB"])
    feed.bars["VCB"] = [date(2026, 9, 28)]
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    sync = db.get(BarSync, "VCB")
    assert sync.history_floor == date(2026, 9, 28)
    assert sync.status == "complete"


def test_weekend_run_fetches_through_latest_weekday(db):
    feed = Feed(["VCB"])
    feed.bars["VCB"] = [date(2026, 9, 25)]
    db.add(_bar("VCB", date(2026, 9, 24), close=100))
    db.add(_bar("VCB", date(2026, 9, 26), close=2, source="quote", open_=1))
    db.add(
        BarSync(
            ticker="VCB",
            oldest_date=date(2026, 9, 24),
            newest_date=date(2026, 9, 24),
            history_floor=date(2026, 9, 24),
            status="complete",
            last_error="",
        )
    )
    db.commit()
    now = datetime(2026, 9, 26, 11, 0, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert feed.ranges == [("VCB", date(2026, 9, 25), date(2026, 9, 25))]
    saturday = db.scalar(select(DailyBar).where(DailyBar.ticker == "VCB", DailyBar.date == date(2026, 9, 26)))
    assert saturday.source == "quote"
    assert saturday.open == 1


def test_before_close_leaves_today_quote_bar(db):
    feed = Feed(["VCB"])
    feed.bars["VCB"] = [date(2026, 9, 25)]
    today = date(2026, 9, 28)
    db.add(_bar("VCB", date(2026, 9, 24), close=100))
    db.add(_bar("VCB", today, close=2, source="quote", open_=1))
    db.add(
        BarSync(
            ticker="VCB",
            oldest_date=date(2026, 9, 24),
            newest_date=date(2026, 9, 24),
            history_floor=date(2026, 9, 24),
            status="complete",
            last_error="",
        )
    )
    db.commit()
    now = datetime(2026, 9, 28, 10, 0, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert all(end <= date(2026, 9, 25) for _symbol, _start, end in feed.ranges)
    candle = db.scalar(select(DailyBar).where(DailyBar.ticker == "VCB", DailyBar.date == today))
    assert candle.source == "quote"
    assert candle.open == 1
    assert candle.high == 2


def test_after_close_replaces_quote_bar_with_dnse(db):
    feed = Feed(["VCB"])
    today = date(2026, 9, 28)
    feed.bars["VCB"] = [today]
    db.add(_bar("VCB", date(2026, 9, 25), close=100))
    db.add(_bar("VCB", today, close=2, source="quote", open_=1))
    db.add(
        BarSync(
            ticker="VCB",
            oldest_date=date(2026, 9, 25),
            newest_date=date(2026, 9, 25),
            history_floor=date(2026, 9, 25),
            status="complete",
            last_error="",
        )
    )
    db.commit()
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    candle = db.scalar(select(DailyBar).where(DailyBar.ticker == "VCB", DailyBar.date == today))
    assert candle.source == "dnse"
    assert candle.open == 10_000
    assert candle.high == 12_000
    assert candle.low == 9_000
    assert candle.close == 11_000
    assert candle.volume == 5


def test_second_backfill_exits_while_lock_is_held(db, engine):
    other = engine.connect()
    other.execute(text("SELECT GET_LOCK('finmon_backfill', 0)"))
    other.commit()
    try:
        code = run_once(db, _settings(), now=datetime(2026, 9, 28, 16, 30, tzinfo=ICT))
        assert code == EXIT_LOCK
    finally:
        other.execute(text("SELECT RELEASE_LOCK('finmon_backfill')"))
        other.close()


def test_quote_candle_tracks_sampled_last_and_keeps_open(db):
    today = date(2026, 9, 28)
    db.add(_bar("VCB", date(2026, 9, 25), close=90_000))
    db.commit()
    apply_quote_candle(db, "VCB", 91_000, today)
    db.commit()
    candle = db.scalar(select(DailyBar).where(DailyBar.ticker == "VCB", DailyBar.date == today))
    assert candle.source == "quote"
    assert candle.open == 90_000
    assert candle.high == 91_000
    assert candle.low == 91_000
    assert candle.close == 91_000
    assert candle.volume == 0
    apply_quote_candle(db, "VCB", 93_000, today)
    apply_quote_candle(db, "VCB", 92_000, today)
    db.commit()
    db.refresh(candle)
    assert candle.open == 90_000
    assert candle.high == 93_000
    assert candle.low == 91_000
    assert candle.close == 92_000


def test_quote_poll_does_not_change_dnse_bar(db):
    today = datetime.now(ICT).date()
    db.add(Symbol(ticker="VCB", name="Vietcombank", board="HOSE", type="stock", listed=True))
    db.add(_bar("VCB", today, close=90_000, open_=88_000))
    db.add(WatchlistItem(ticker="VCB", position=0))
    db.commit()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/trades/latest"):
            return httpx.Response(200, json={"trades": [{"matchPrice": 99, "boardId": "G1"}]})
        if request.url.path.endswith("/quotes/latest"):
            return httpx.Response(200, json={"quotes": [{"refPrice": 90, "ceilingPrice": 96, "floorPrice": 84}]})
        if request.url.path.endswith("/secdef"):
            return httpx.Response(200, json={"quotes": [{"refPrice": 90}]})
        return httpx.Response(404)

    client = DnseClient(_settings(), transport=httpx.MockTransport(handler))
    ingest_watchlist_quotes(db, _settings(), client, force=True)
    candle = db.scalar(select(DailyBar).where(DailyBar.ticker == "VCB", DailyBar.date == today))
    assert candle.source == "dnse"
    assert candle.open == 88_000
    assert candle.high == 90_000
    snap = db.get(QuoteSnapshot, "VCB")
    assert snap.last == 99_000


def test_duplicate_date_in_one_chunk_keeps_last_bar(db):
    day = date(2026, 9, 28)
    feed = Feed(["VCB"])
    feed.bars["VCB"] = [day]
    feed.second_bar = (21, 23, 20, 22, 9)
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    session = sessionmaker(bind=db.get_bind(), autoflush=False)()
    try:
        assert run_once(session, _settings(), feed.client(), now=now) == 0
        sync = session.get(BarSync, "VCB")
        assert sync is not None
        assert sync.status == "complete"
        bars = session.scalars(select(DailyBar).where(DailyBar.ticker == "VCB", DailyBar.date == day)).all()
        assert len(bars) == 1
        assert bars[0].open == 21_000
        assert bars[0].high == 23_000
        assert bars[0].low == 20_000
        assert bars[0].close == 22_000
        assert bars[0].volume == 9
        feed.ranges.clear()
        feed.bars["VCB"] = [day, date(2026, 9, 29)]
        later = datetime(2026, 9, 29, 16, 30, tzinfo=ICT)
        assert run_once(session, _settings(), feed.client(), now=later) == 0
        assert feed.ranges == [("VCB", date(2026, 9, 29), date(2026, 9, 29))]
        assert session.get(BarSync, "VCB").status == "complete"
    finally:
        session.close()


def test_bond_and_futures_are_skipped_without_ohlc(db):
    db.add(Symbol(ticker="BAB122030", name="BAB122030", board="HCX", type="bond", listed=True))
    db.add(BarSync(ticker="BAB122030", status="error", last_error="http 400"))
    db.add(Symbol(ticker="41I1G3000", name="HĐTL chỉ số VN30", board="DVX", type="index", listed=True))
    db.add(BarSync(ticker="41I1G3000", status="pending", last_error=""))
    db.add(Symbol(ticker="VN30F2305", name="VN30F2305", board="HNX", type="stock", listed=True))
    db.add(BarSync(ticker="VN30F2305", status="error", last_error="http 400"))
    db.commit()
    feed = Feed([])
    feed.instruments_payload = [
        {"symbol": "BAB122030", "name": "BAB122030", "board": "HCX"},
        {"symbol": "41I1G3000", "name": "HĐTL chỉ số VN30", "board": "DVX"},
        {"symbol": "VN30F2305", "name": "VN30F2305", "board": "HNX"},
    ]
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert db.get(BarSync, "BAB122030").status == "skipped"
    assert db.get(BarSync, "41I1G3000").status == "skipped"
    assert db.get(BarSync, "VN30F2305").status == "skipped"
    assert feed.ranges == []
    feed.ranges.clear()
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert feed.ranges == []
    assert db.get(BarSync, "BAB122030").status == "skipped"


def test_warrant_http_400_is_skipped_and_not_retried(db):
    feed = Feed([])
    feed.instruments_payload = [
        {"symbol": "CACB2206", "name": "Chứng quyền ACB", "board": "HOSE"},
    ]
    feed.status_for["CACB2206"] = 400
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    sync = db.get(BarSync, "CACB2206")
    assert sync is not None
    assert sync.status == "skipped"
    assert db.scalar(select(DailyBar).where(DailyBar.ticker == "CACB2206")) is None
    feed.ranges.clear()
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert feed.ranges == []
    assert db.get(BarSync, "CACB2206").status == "skipped"


def test_warrant_with_bars_is_stored(db):
    day = date(2026, 9, 28)
    feed = Feed([])
    feed.instruments_payload = [
        {"symbol": "CACB2206", "name": "Chứng quyền ACB", "board": "HOSE"},
    ]
    feed.bars["CACB2206"] = [day]
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    sync = db.get(BarSync, "CACB2206")
    assert sync is not None
    assert sync.status == "complete"
    bar = db.scalar(select(DailyBar).where(DailyBar.ticker == "CACB2206", DailyBar.date == day))
    assert bar is not None
    assert bar.close == 11_000
    assert db.get(Symbol, "CACB2206").type == "warrant"


def test_stock_and_etf_http_400_stay_error(db):
    feed = Feed([])
    feed.instruments_payload = [
        {"symbol": "VCB", "name": "Vietcombank", "boardId": "HOSE", "securityGroupId": "STOCK"},
        {"symbol": "VEOF", "name": "VinaCapital ETF", "boardId": "HOSE"},
    ]
    feed.status_for["VCB"] = 400
    feed.status_for["VEOF"] = 400
    now = datetime(2026, 9, 28, 16, 30, tzinfo=ICT)
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert db.get(BarSync, "VCB").status == "error"
    assert db.get(BarSync, "VEOF").status == "error"
    assert db.get(Symbol, "VCB").type == "stock"
    assert db.get(Symbol, "VEOF").type == "etf"


def test_limiter_pauses_at_ohlc_ceilings_and_remaining():
    state = {"now": datetime(2026, 9, 28, 4, 0, tzinfo=timezone.utc)}
    slept: list[float] = []

    def now() -> datetime:
        return state["now"]

    def sleep(seconds: float) -> None:
        slept.append(seconds)
        state["now"] += timedelta(seconds=seconds)

    limiter = RateLimiter(now_fn=now, sleep_fn=sleep)
    start = state["now"]
    limiter._events["ohlc"] = [start] * OHLC_HOUR_PAUSE
    limiter.acquire("/price/ohlc")
    assert sum(slept) >= 3600

    slept.clear()
    state["now"] = datetime(2026, 9, 28, 4, 0, tzinfo=timezone.utc)
    old = state["now"] - timedelta(hours=2)
    limiter._events["ohlc"] = [old] * OHLC_DAY_PAUSE
    limiter._remaining["ohlc"] = None
    limiter._reset_at["ohlc"] = None
    limiter.acquire("/price/ohlc")
    assert sum(slept) >= 22 * 3600

    slept.clear()
    state["now"] = datetime(2026, 9, 28, 4, 0, tzinfo=timezone.utc)
    limiter._events["ohlc"] = []
    reset = state["now"] + timedelta(seconds=10)
    limiter.observe("/price/ohlc", {"X-RateLimit-Remaining": "50", "X-RateLimit-Reset": str(reset.timestamp())})
    limiter.acquire("/price/ohlc")
    assert 9 <= sum(slept) <= 11

    slept.clear()
    state["now"] = datetime(2026, 9, 28, 4, 0, tzinfo=timezone.utc)
    limiter._events["instruments"] = [state["now"]] * INSTRUMENTS_HOUR_PAUSE
    limiter._remaining["instruments"] = None
    limiter._reset_at["instruments"] = None
    limiter.acquire("/instruments")
    assert sum(slept) >= 3600


def test_paced_client_waits_for_429_reset_without_30s_cap():
    state = {"now": datetime(2026, 9, 28, 4, 0, tzinfo=timezone.utc)}
    slept: list[float] = []
    calls = {"n": 0}
    reset = state["now"] + timedelta(seconds=90)

    def now() -> datetime:
        return state["now"]

    def sleep(seconds: float) -> None:
        slept.append(seconds)
        state["now"] += timedelta(seconds=seconds)

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"X-RateLimit-Reset": str(reset.timestamp())})
        return httpx.Response(200, json={"data": []})

    limiter = RateLimiter(now_fn=now, sleep_fn=sleep)
    client = DnseClient(_settings(), transport=httpx.MockTransport(handler), limiter=limiter)
    assert client.list_instruments() == []
    assert calls["n"] == 2
    assert sum(slept) >= 90
    assert max(slept) <= 1.0
