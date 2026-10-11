from sqlalchemy import select

from app.models import Symbol, WatchlistItem


def test_pin_is_idempotent_and_unpin_is_404_when_missing(client, db):
    db.add(Symbol(ticker="VCB", name="Vietcombank", board="HOSE", type="stock", listed=True))
    db.commit()
    first = client.post("/api/watchlist/vcb")
    assert first.status_code == 200
    assert first.json()["ticker"] == "VCB"
    assert first.json()["watchlist"] is True
    assert first.json()["name"] == "Vietcombank"
    second = client.post("/api/watchlist/VCB")
    assert second.status_code == 200
    assert client.get("/api/watchlist").json() == ["VCB"]
    assert len(db.scalars(select(WatchlistItem)).all()) == 1

    gone = client.delete("/api/watchlist/VCB")
    assert gone.status_code == 200
    assert gone.json() == {"status": "ok"}
    assert client.delete("/api/watchlist/VCB").status_code == 404


def test_pin_unknown_ticker_still_returns_a_row(client):
    row = client.post("/api/watchlist/ZZZ")
    assert row.status_code == 200
    assert row.json()["ticker"] == "ZZZ"
    assert row.json()["name"] == "ZZZ"
    assert row.json()["watchlist"] is True
    assert client.get("/api/watchlist").json() == ["ZZZ"]
