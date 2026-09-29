from datetime import date, timedelta

from sqlalchemy import event

from app.models import DailyBar, QuoteSnapshot, Symbol, WatchlistItem


def _symbol(ticker: str, *, name: str | None = None, board: str = "HOSE", typ: str = "stock") -> Symbol:
    return Symbol(ticker=ticker, name=name if name is not None else ticker, board=board, type=typ, listed=True)


def _bar(ticker: str, day: date, close: int, *, volume: int = 1) -> DailyBar:
    return DailyBar(
        ticker=ticker,
        date=day,
        open=close,
        high=close,
        low=close,
        close=close,
        volume=volume,
        value=0,
        source="dnse",
    )


def test_page_of_50_next_page_does_not_repeat(client, db):
    for i in range(60):
        db.add(_symbol(f"S{i:03d}"))
    db.commit()
    first = client.get("/api/symbols", params={"limit": 50, "offset": 0})
    second = client.get("/api/symbols", params={"limit": 50, "offset": 50})
    assert first.status_code == 200
    body = first.json()
    assert body["limit"] == 50
    assert body["total"] == 60
    assert len(body["items"]) == 50
    page2 = second.json()["items"]
    assert len(page2) == 10
    assert {row["ticker"] for row in body["items"]}.isdisjoint({row["ticker"] for row in page2})


def test_type_stock_excludes_etf_and_index(client, db):
    db.add(_symbol("VCB"))
    db.add(_symbol("E1VFVN30", typ="etf"))
    db.add(_symbol("VNINDEX", typ="index"))
    db.commit()
    body = client.get("/api/symbols").json()
    tickers = {row["ticker"] for row in body["items"]}
    assert tickers == {"VCB"}
    assert body["total"] == 1


def test_board_upcom_includes_stored_upx(client, db):
    db.add(_symbol("UPX1", board="UPX"))
    db.add(_symbol("UPC1", board="UPCOM"))
    db.add(_symbol("VCB", board="HOSE"))
    db.commit()
    body = client.get("/api/symbols", params={"board": "UPCOM"}).json()
    assert {row["ticker"] for row in body["items"]} == {"UPX1", "UPC1"}
    assert next(row for row in body["items"] if row["ticker"] == "UPX1")["board"] == "UPX"


def test_q_vhm_ranks_exact_ticker_before_name(client, db):
    db.add(_symbol("VHM", name="Vinhomes"))
    db.add(_symbol("VHMZ", name="Other"))
    db.add(_symbol("ZZZ", name="holds VHM letters"))
    db.add(_symbol("AAA", name="unrelated"))
    db.add(_symbol("FUEVFVND", typ="etf", name="VHM fund"))
    db.commit()
    body = client.get("/api/symbols", params={"q": "VHM"}).json()
    tickers = [row["ticker"] for row in body["items"]]
    assert tickers == ["VHM", "VHMZ", "ZZZ"]
    assert body["total"] == 3
    assert "AAA" not in tickers


def test_watchlist_does_not_price_unpinned_catalog(client, db, engine):
    db.add(_symbol("PIN"))
    db.add(_symbol("OTHER"))
    db.add(_bar("PIN", date(2026, 9, 2), 10, volume=5))
    db.add(_bar("OTHER", date(2026, 9, 2), 99, volume=9))
    db.add(WatchlistItem(ticker="PIN", position=0))
    db.commit()
    statements: list[tuple[str, object]] = []

    def before(_conn, _cursor, statement, parameters, _context, _executemany):
        statements.append((statement, parameters))

    event.listen(engine, "before_cursor_execute", before)
    try:
        body = client.get("/api/symbols", params={"watchlist": "true"}).json()
    finally:
        event.remove(engine, "before_cursor_execute", before)
    assert [row["ticker"] for row in body["items"]] == ["PIN"]
    assert body["items"][0]["last"] == 10
    priced = "\n".join(
        f"{statement} {parameters}"
        for statement, parameters in statements
        if "daily_bar" in statement.lower() or "quote_snapshot" in statement.lower()
    )
    assert "PIN" in priced
    assert "OTHER" not in priced


def test_wider_search_returns_etf_outside_stock_board(client, db):
    db.add(_symbol("E1VFVN30", name="VN30 ETF", board="HOSE", typ="etf"))
    db.commit()
    narrow = client.get("/api/symbols", params={"type": "stock", "board": "HNX", "q": "E1VFVN30"}).json()
    assert narrow["items"] == []
    wide = client.get("/api/symbols", params={"type": "all", "q": "E1VFVN30"}).json()
    assert len(wide["items"]) == 1
    assert wide["items"][0]["ticker"] == "E1VFVN30"
    assert wide["items"][0]["type"] == "etf"


def test_get_symbol_is_one_row(client, db):
    db.add(_symbol("VHM", name="Vinhomes"))
    db.add(QuoteSnapshot(ticker="VHM", last=50000, source="dnse"))
    db.add(_bar("VHM", date(2026, 9, 1), 49000))
    db.commit()
    resp = client.get("/api/symbols/VHM")
    assert resp.status_code == 200
    row = resp.json()
    assert row["ticker"] == "VHM"
    assert row["last"] == 50000
    assert isinstance(row, dict)
    missing = client.get("/api/symbols/NOPE")
    assert missing.status_code == 404


def test_indicator_series_length_matches_bars(client, db):
    start = date(2026, 1, 1)
    for i in range(80):
        db.add(_bar("VCB", start + timedelta(days=i), 1000 + i))
    db.commit()
    window = {"from": "2026-02-01", "to": "2026-03-01"}
    bars = client.get("/api/symbols/VCB/bars", params=window)
    ind = client.get("/api/symbols/VCB/indicators", params={"names": "sma:20,macd", **window})
    assert bars.status_code == 200
    assert ind.status_code == 200
    candle_count = len(bars.json())
    payload = ind.json()
    assert len(payload["dates"]) == candle_count
    assert len(payload["sma:20"]) == candle_count
    assert len(payload["macd"]["macd"]) == candle_count
    assert len(payload["macd"]["signal"]) == candle_count
    assert len(payload["macd"]["hist"]) == candle_count
    assert candle_count > 0
