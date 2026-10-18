from datetime import date

from app.models import DailyBar, Symbol


def _bar(day: date, open_: int, high: int, low: int, close: int, volume: int, value: int) -> DailyBar:
    return DailyBar(
        ticker="VCB",
        date=day,
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
        value=value,
        source="dnse",
    )


def test_week_and_month_aggregation(client, db):
    db.add(Symbol(ticker="VCB", name="Vietcombank", board="HOSE", type="stock", listed=True))
    db.add_all(
        [
            _bar(date(2026, 9, 29), 5, 7, 4, 6, 3, 30),
            _bar(date(2026, 9, 30), 6, 9, 5, 8, 4, 40),
            _bar(date(2026, 10, 12), 10, 12, 9, 11, 100, 1000),
            _bar(date(2026, 10, 13), 11, 15, 8, 14, 40, 400),
            _bar(date(2026, 10, 16), 14, 16, 13, 15, 25, 250),
            _bar(date(2026, 10, 19), 15, 18, 14, 17, 10, 100),
        ]
    )
    db.commit()
    window = {"from": "2026-09-01", "to": "2026-10-31"}
    week = client.get("/api/symbols/VCB/bars", params={**window, "interval": "week"})
    month = client.get("/api/symbols/VCB/bars", params={**window, "interval": "month"})
    assert week.status_code == 200
    assert month.status_code == 200
    assert week.json() == [
        {"date": "2026-09-30", "open": 5, "high": 9, "low": 4, "close": 8, "volume": 7, "value": 70},
        {"date": "2026-10-16", "open": 10, "high": 16, "low": 8, "close": 15, "volume": 165, "value": 1650},
        {"date": "2026-10-19", "open": 15, "high": 18, "low": 14, "close": 17, "volume": 10, "value": 100},
    ]
    assert month.json() == [
        {"date": "2026-09-30", "open": 5, "high": 9, "low": 4, "close": 8, "volume": 7, "value": 70},
        {"date": "2026-10-19", "open": 10, "high": 18, "low": 8, "close": 17, "volume": 175, "value": 1750},
    ]
    daily = client.get("/api/symbols/VCB/bars", params=window)
    assert len(daily.json()) == 6
    ind = client.get("/api/symbols/VCB/indicators", params={"names": "sma:20", **window, "interval": "week"})
    assert ind.status_code == 200
    assert ind.json()["dates"] == [row["date"] for row in week.json()]


def test_fifteen_months_is_wider_than_twelve(client, db):
    db.add(Symbol(ticker="VCB", name="Vietcombank", board="HOSE", type="stock", listed=True))
    for day in (date(2025, 7, 18), date(2025, 7, 19), date(2025, 10, 19), date(2026, 10, 16), date(2026, 10, 19)):
        db.add(_bar(day, 1, 1, 1, 1, 1, 1))
    db.commit()
    year = client.get("/api/symbols/VCB/bars", params={"months": 12, "interval": "day"})
    wider = client.get("/api/symbols/VCB/bars", params={"months": 15, "interval": "day"})
    assert year.status_code == 200
    assert wider.status_code == 200
    year_dates = [row["date"] for row in year.json()]
    wider_dates = [row["date"] for row in wider.json()]
    assert year_dates == ["2025-10-19", "2026-10-16", "2026-10-19"]
    assert wider_dates == ["2025-07-19", "2025-10-19", "2026-10-16", "2026-10-19"]
    assert wider_dates[0] < year_dates[0]
    assert len(wider_dates) > len(year_dates)
    short = client.get("/api/symbols/VCB/bars", params={"months": 120, "interval": "day"})
    assert [row["date"] for row in short.json()] == [
        "2025-07-18",
        "2025-07-19",
        "2025-10-19",
        "2026-10-16",
        "2026-10-19",
    ]
