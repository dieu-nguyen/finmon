from datetime import date

import httpx

from app.clients.dnse import DnseClient
from app.config import Settings
from app.jobs.ingest import ingest_instruments_and_bars, ingest_watchlist_quotes
from app.models import DailyBar, QuoteSnapshot, Symbol, WatchlistItem
from tests.conftest import load_fixture


def test_ingest_mocked(db):
    settings = Settings(
        dnse_api_key="k",
        dnse_api_secret="s",
        database_url="mysql+pymysql://finmon:finmon@127.0.0.1:3306/finmon",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/instruments"):
            return httpx.Response(200, json=load_fixture("dnse_instruments.json"))
        if path.endswith("/ohlc"):
            return httpx.Response(200, json=load_fixture("dnse_ohlc.json"))
        if path.endswith("/trades/latest"):
            return httpx.Response(200, json={"trades": [{"matchPrice": 92.6, "boardId": "G1"}]})
        if path.endswith("/quotes/latest"):
            if request.url.params.get("boardId") in {"HOSE", "HNX", "UPCOM"}:
                return httpx.Response(404, json={"errorCode": 404, "message": "not found boardId"})
            return httpx.Response(200, json=load_fixture("dnse_quote.json"))
        if path.endswith("/secdef"):
            return httpx.Response(200, json=load_fixture("dnse_quote.json"))
        return httpx.Response(404, json={"error": path})

    transport = httpx.MockTransport(handler)
    client = DnseClient(settings, transport=transport)
    db.add(WatchlistItem(ticker="VCB", position=0))
    db.commit()
    ingest_instruments_and_bars(db, settings, client, force=True)
    ingest_watchlist_quotes(db, settings, client, force=True)
    assert db.get(Symbol, "VCB") is not None
    bars = db.query(DailyBar).filter(DailyBar.ticker == "VCB").all()
    assert len(bars) == 3
    snap = db.get(QuoteSnapshot, "VCB")
    assert snap is not None
    assert snap.last == 92600


def test_symbols_api_seeded(client, db):
    db.add(Symbol(ticker="VCB", name="Vietcombank", board="HOSE", type="stock", listed=True))
    db.add(
        DailyBar(
            ticker="VCB",
            date=date(2026, 9, 1),
            open=90000,
            high=91000,
            low=89000,
            close=90500,
            volume=1000,
            value=0,
            source="dnse",
        )
    )
    db.add(
        DailyBar(
            ticker="VCB",
            date=date(2026, 9, 2),
            open=90500,
            high=92000,
            low=90000,
            close=91000,
            volume=1100,
            value=0,
            source="dnse",
        )
    )
    db.commit()
    resp = client.get("/api/symbols")
    assert resp.status_code == 200
    row = resp.json()[0]
    assert row["ticker"] == "VCB"
    assert row["last"] == 91000
    pin = client.post("/api/watchlist/VCB")
    assert pin.status_code == 200
    assert client.get("/api/watchlist").json() == ["VCB"]
    bars = client.get("/api/symbols/VCB/bars")
    assert len(bars.json()) == 2
    health = client.get("/api/health")
    assert health.status_code == 200
    assert "dnse_configured" in health.json()
