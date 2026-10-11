from datetime import date, timedelta

from app.models import DailyBar, Symbol


def _seed(db, ticker: str = "VCB", days: int = 40):
    db.add(Symbol(ticker=ticker, name=ticker, board="HOSE", type="stock", listed=True))
    start = date(2026, 8, 1)
    for i in range(days):
        px = 1000 + i
        db.add(
            DailyBar(
                ticker=ticker,
                date=start + timedelta(days=i),
                open=px,
                high=px,
                low=px,
                close=px,
                volume=10,
                value=0,
                source="dnse",
            )
        )
    db.commit()


def test_indicators_404_without_bars(client):
    resp = client.get("/api/symbols/VCB/indicators", params={"names": "sma:20"})
    assert resp.status_code == 404


def test_indicators_skip_unknown_names_and_return_requested_series(client, db):
    _seed(db)
    resp = client.get(
        "/api/symbols/vcb/indicators",
        params={"names": "sma:20,unknown:3,rsi:14", "from": "2026-08-20", "to": "2026-09-09"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "dates" in body
    assert "sma:20" in body
    assert "rsi:14" in body
    assert "unknown:3" not in body
    assert len(body["sma:20"]) == len(body["dates"])
    assert len(body["rsi:14"]) == len(body["dates"])
