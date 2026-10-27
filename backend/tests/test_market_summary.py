from datetime import date, timedelta

from sqlalchemy import event, select

from app.models import DailyBar, Symbol


def _symbol(ticker: str, *, board: str = "HOSE", typ: str = "stock") -> Symbol:
    return Symbol(ticker=ticker, name=ticker, board=board, type=typ, listed=True)


def _bar(
    ticker: str,
    day: date,
    close: int,
    *,
    value: int = 0,
    source: str = "dnse",
) -> DailyBar:
    return DailyBar(
        ticker=ticker,
        date=day,
        open=close,
        high=close,
        low=close,
        close=close,
        volume=1,
        value=value,
        source=source,
    )


def _index_days(count: int, start: date = date(2024, 1, 1)) -> list[date]:
    return [start + timedelta(days=i) for i in range(count)]


def test_sessions_7_and_30_follow_vnindex_dates(client, db):
    days = _index_days(40)
    db.add(_symbol("VNINDEX", typ="index"))
    for i, day in enumerate(days):
        db.add(_bar("VNINDEX", day, 100_000 + i * 100))
    db.add(_symbol("OLD"))
    db.add(_bar("OLD", date(2020, 6, 1), 10, value=9_000_000_000_000))
    db.add(_bar("VNINDEX", days[-1] + timedelta(days=1), 999_999, source="quote"))
    db.commit()

    seven = client.get("/api/market/summary", params={"sessions": 7})
    thirty = client.get("/api/market/summary", params={"sessions": 30})
    assert seven.status_code == 200
    assert thirty.status_code == 200
    short = seven.json()
    long = thirty.json()
    assert short["sessions"] == 7
    assert long["sessions"] == 30
    assert len(short["days"]) == 7
    assert len(short["index"]["closes"]) == 7
    assert len(long["days"]) == 30
    assert len(long["index"]["closes"]) == 30
    assert short["as_of"] == days[-1].isoformat()
    assert long["as_of"] == days[-1].isoformat()
    assert short["days"][0]["date"] == days[-7].isoformat()
    assert short["days"][-1]["date"] == days[-1].isoformat()
    assert long["days"][0]["date"] == days[-30].isoformat()
    assert all(day["value"] == 0 for day in short["days"])
    omitted = client.get("/api/market/summary")
    assert omitted.status_code == 200
    assert omitted.json()["sessions"] == 7


def test_index_change_uses_point_scale(client, db):
    days = _index_days(8)
    db.add(_symbol("VNINDEX", typ="index"))
    stored = [100_000, 100_100, 100_200, 100_300, 100_400, 100_500, 101_000, 102_550]
    for day, close in zip(days, stored):
        db.add(_bar("VNINDEX", day, close))
    db.commit()

    body = client.get("/api/market/summary", params={"sessions": 7}).json()
    window = stored[-7:]
    assert body["index"]["closes"] == [close / 100 for close in window]
    assert body["index"]["close"] == 1025.50
    assert body["index"]["change"] == round((102_550 - 100_100) / 100, 2)
    assert body["index"]["change_pct"] == round((102_550 - 100_100) / 100_100 * 100, 2)
    assert body["index"]["close"] != 102_550


def test_breadth_counts_missing_bar_and_flat_close(client, db):
    days = _index_days(8)
    db.add(_symbol("VNINDEX", typ="index"))
    for day in days:
        db.add(_bar("VNINDEX", day, 120_000))
    previous, latest = days[-2], days[-1]
    db.add(_symbol("AAA"))
    db.add(_bar("AAA", previous, 10, value=100))
    db.add(_bar("AAA", latest, 12, value=100))
    db.add(_symbol("BBB"))
    db.add(_bar("BBB", previous, 10, value=200))
    db.add(_bar("BBB", latest, 8, value=200))
    db.add(_symbol("CCC"))
    db.add(_bar("CCC", previous, 10, value=300))
    db.add(_bar("CCC", latest, 10, value=300))
    db.add(_symbol("DDD"))
    db.add(_bar("DDD", previous, 10, value=400))
    db.add(_symbol("EEE"))
    db.add(_bar("EEE", latest, 10, value=50))
    db.add(_symbol("FFF", typ="index"))
    db.add(_bar("FFF", previous, 10, value=9_000))
    db.add(_bar("FFF", latest, 20, value=9_000))
    db.add(_symbol("GGG", typ="bond"))
    db.add(_bar("GGG", previous, 10, value=9_000))
    db.add(_bar("GGG", latest, 11, value=9_000))
    db.add(_symbol("HHH", typ="warrant"))
    db.add(_bar("HHH", previous, 10, value=9_000))
    db.add(_bar("HHH", latest, 11, value=9_000))
    db.add(_symbol("III", board="HNX"))
    db.add(_bar("III", previous, 10, value=9_000))
    db.add(_bar("III", latest, 11, value=9_000))
    db.add(_symbol("JJJ", typ="etf"))
    db.add(_bar("JJJ", previous, 5, value=25))
    db.add(_bar("JJJ", latest, 6, value=25))
    db.add(_symbol("KKK", typ="futures"))
    db.add(_bar("KKK", previous, 5, value=9_000))
    db.add(_bar("KKK", latest, 9, value=9_000))
    db.add(_symbol("LLL"))
    db.add(_bar("LLL", days[-3], 10, value=80))
    db.add(_bar("LLL", latest, 15, value=80))
    db.add(_symbol("MMM"))
    db.add(_bar("MMM", previous, 10, value=1))
    db.add(_bar("MMM", latest, 1, value=999_999, source="quote"))
    db.commit()

    day = client.get("/api/market/summary", params={"sessions": 7}).json()["days"][-1]
    assert day["date"] == latest.isoformat()
    assert day["up"] == 2
    assert day["down"] == 1
    assert day["flat"] == 1
    assert day["value"] == 100 + 200 + 300 + 50 + 25 + 80


def test_value_sum_and_all_zero_window(client, db):
    days = _index_days(3)
    db.add(_symbol("VNINDEX", typ="index"))
    for day in days:
        db.add(_bar("VNINDEX", day, 110_000))
    db.add(_symbol("AAA"))
    db.add(_symbol("BBB", typ="etf"))
    db.add(_bar("AAA", days[-2], 10, value=1_000))
    db.add(_bar("AAA", days[-1], 11, value=4_000))
    db.add(_bar("BBB", days[-2], 10, value=500))
    db.add(_bar("BBB", days[-1], 9, value=6_000))
    db.commit()

    body = client.get("/api/market/summary", params={"sessions": 7}).json()
    assert [day["value"] for day in body["days"]] == [0, 1_500, 10_000]
    assert len(body["days"]) == 3

    for row in db.scalars(select(DailyBar)):
        row.value = 0
    db.commit()
    empty = client.get("/api/market/summary", params={"sessions": 7}).json()
    assert len(empty["days"]) == 3
    assert [day["value"] for day in empty["days"]] == [0, 0, 0]


def test_invalid_sessions_rejected(client):
    for sessions in ("1", "14", "31", "0", "8", "foo"):
        resp = client.get("/api/market/summary", params={"sessions": sessions})
        assert resp.status_code == 400


def test_summary_query_stays_on_the_session_dates(client, db, engine):
    days = _index_days(10)
    db.add(_symbol("VNINDEX", typ="index"))
    for day in days:
        db.add(_bar("VNINDEX", day, 100_000))
    for i in range(40):
        ticker = f"H{i:03d}"
        db.add(_symbol(ticker))
        db.add(_bar(ticker, days[-1], 10 + i, value=i + 1))
        db.add(_bar(ticker, days[0], 10, value=1))
        db.add(_bar(ticker, date(2019, 1, 1), 10, value=50_000))
    db.commit()

    statements: list[str] = []

    def before(_conn, _cursor, statement, _parameters, _context, _executemany):
        if "daily_bar" in statement.lower():
            statements.append(statement.lower())

    event.listen(engine, "before_cursor_execute", before)
    try:
        resp = client.get("/api/market/summary", params={"sessions": 7})
    finally:
        event.remove(engine, "before_cursor_execute", before)

    assert resp.status_code == 200
    assert resp.json()["days"][-1]["value"] == sum(range(1, 41))
    assert statements
    assert len(statements) <= 3
    for statement in statements:
        assert " limit " in statement or "date" in statement
