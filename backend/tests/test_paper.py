from datetime import date, datetime

from sqlalchemy import select

from app.models import DailyBar, PaperFill, QuoteSnapshot, Symbol


def _stock(db, ticker="VCB", close=91000, quote=None, symbol_type="stock"):
    db.add(Symbol(ticker=ticker, name=ticker, board="HOSE", type=symbol_type, listed=True))
    db.add(
        DailyBar(
            ticker=ticker,
            date=date(2026, 9, 2),
            open=close,
            high=close,
            low=close,
            close=close,
            volume=1000,
            value=0,
            source="dnse",
        )
    )
    if quote is not None:
        db.add(QuoteSnapshot(ticker=ticker, last=quote, source="dnse"))
    db.commit()


def test_paper_account_starts_with_cash(client):
    resp = client.get("/api/paper")
    assert resp.status_code == 200
    body = resp.json()
    assert body["starting_cash"] == 1_000_000_000
    assert body["cash"] == 1_000_000_000
    assert body["equity"] == 1_000_000_000
    assert body["market_value"] == 0
    assert body["realized_pnl"] == 0
    assert body["unrealized_pnl"] == 0
    assert body["total_pnl"] == 0
    assert body["positions"] == []
    assert body["fills"] == []


def test_buy_fills_at_last_close(client, db):
    _stock(db, close=91000)
    resp = client.post("/api/paper/orders", json={"side": "buy", "ticker": "vcb", "quantity": 100})
    assert resp.status_code == 200
    body = resp.json()
    assert body["cash"] == 1_000_000_000 - 100 * 91000
    pos = body["positions"][0]
    assert pos["ticker"] == "VCB"
    assert pos["quantity"] == 100
    assert pos["avg_cost"] == 91000
    assert pos["last"] == 91000
    assert pos["market_value"] == 9_100_000
    assert pos["unrealized_pnl"] == 0
    assert body["fills"][0]["side"] == "buy"
    assert body["fills"][0]["price"] == 91000
    assert body["fills"][0]["quantity"] == 100
    assert body["fills"][0]["realized_pnl"] == 0


def test_buy_uses_quote_last_over_close(client, db):
    _stock(db, close=91000, quote=92600)
    body = client.post("/api/paper/orders", json={"side": "buy", "ticker": "VCB", "quantity": 10}).json()
    assert body["fills"][0]["price"] == 92600
    assert body["positions"][0]["last"] == 92600


def test_unrealized_pnl_marks_to_last(client, db):
    _stock(db, close=90000)
    client.post("/api/paper/orders", json={"side": "buy", "ticker": "VCB", "quantity": 100})
    snap = db.get(QuoteSnapshot, "VCB")
    if snap is None:
        db.add(QuoteSnapshot(ticker="VCB", last=99000, source="dnse"))
    else:
        snap.last = 99000
    db.commit()
    body = client.get("/api/paper").json()
    assert body["positions"][0]["unrealized_pnl"] == 100 * 9000
    assert body["unrealized_pnl"] == 900_000
    assert body["realized_pnl"] == 0
    assert body["total_pnl"] == 900_000
    assert body["equity"] == 1_000_000_000 + 900_000


def test_sell_realizes_profit(client, db):
    _stock(db, close=90000, quote=90000)
    client.post("/api/paper/orders", json={"side": "buy", "ticker": "VCB", "quantity": 100})
    snap = db.get(QuoteSnapshot, "VCB")
    snap.last = 110000
    db.commit()
    body = client.post("/api/paper/orders", json={"side": "sell", "ticker": "VCB", "quantity": 40}).json()
    assert body["positions"][0]["quantity"] == 60
    assert body["realized_pnl"] == 40 * 20000
    assert body["unrealized_pnl"] == 60 * 20000
    assert body["total_pnl"] == 100 * 20000
    fill = body["fills"][0]
    assert fill["side"] == "sell"
    assert fill["realized_pnl"] == 800_000
    assert body["cash"] == 1_000_000_000 - 100 * 90000 + 40 * 110000


def test_sell_all_clears_position(client, db):
    _stock(db, close=90000)
    client.post("/api/paper/orders", json={"side": "buy", "ticker": "VCB", "quantity": 100})
    body = client.post("/api/paper/orders", json={"side": "sell", "ticker": "VCB", "quantity": 100}).json()
    assert body["positions"] == []
    assert body["cash"] == 1_000_000_000
    assert body["realized_pnl"] == 0
    assert body["total_pnl"] == 0


def test_insufficient_cash_is_rejected(client, db):
    _stock(db, close=90000)
    resp = client.post("/api/paper/orders", json={"side": "buy", "ticker": "VCB", "quantity": 20_000})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "insufficient cash"
    assert client.get("/api/paper").json()["cash"] == 1_000_000_000


def test_sell_without_shares_is_rejected(client, db):
    _stock(db, close=90000)
    resp = client.post("/api/paper/orders", json={"side": "sell", "ticker": "VCB", "quantity": 10})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "insufficient shares"


def test_unknown_ticker_is_not_found(client):
    resp = client.post("/api/paper/orders", json={"side": "buy", "ticker": "ZZZZ", "quantity": 10})
    assert resp.status_code == 404


def test_no_last_price_is_rejected(client, db):
    db.add(Symbol(ticker="NEW", name="New", board="HOSE", type="stock", listed=True))
    db.commit()
    resp = client.post("/api/paper/orders", json={"side": "buy", "ticker": "NEW", "quantity": 10})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "no last price"


def test_index_is_not_tradeable(client, db):
    _stock(db, ticker="VNINDEX", close=1200, symbol_type="index")
    resp = client.post("/api/paper/orders", json={"side": "buy", "ticker": "VNINDEX", "quantity": 1})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "not tradeable"


def test_reset_restores_starting_cash(client, db):
    _stock(db, close=90000)
    client.post("/api/paper/orders", json={"side": "buy", "ticker": "VCB", "quantity": 100})
    body = client.post("/api/paper/reset").json()
    assert body["cash"] == 1_000_000_000
    assert body["positions"] == []
    assert body["fills"] == []
    assert body["total_pnl"] == 0


def _stamp_last(db, when: datetime) -> None:
    fill = db.scalars(select(PaperFill).order_by(PaperFill.id.desc())).first()
    fill.created_at = when
    db.commit()


def _closed_roundtrip(client, db, ticker: str, buy: int, sell: int) -> None:
    _stock(db, ticker=ticker, close=buy, quote=buy)
    client.post("/api/paper/orders", json={"side": "buy", "ticker": ticker, "quantity": 100})
    snap = db.get(QuoteSnapshot, ticker)
    snap.last = sell
    db.commit()
    client.post("/api/paper/orders", json={"side": "sell", "ticker": ticker, "quantity": 100})


def test_fills_filter_by_ticker(client, db):
    _closed_roundtrip(client, db, "VCB", 90000, 110000)
    _closed_roundtrip(client, db, "VHM", 80000, 70000)
    body = client.get("/api/paper", params={"ticker": "vcb"}).json()
    assert [row["ticker"] for row in body["fills"]] == ["VCB", "VCB"]
    assert body["realized_pnl"] == 100 * 20000 + 100 * -10000


def test_fills_filter_win_and_lose(client, db):
    _closed_roundtrip(client, db, "VCB", 90000, 110000)
    _closed_roundtrip(client, db, "VHM", 80000, 70000)
    wins = client.get("/api/paper", params={"result": "win"}).json()["fills"]
    losses = client.get("/api/paper", params={"result": "lose"}).json()["fills"]
    assert [(row["ticker"], row["side"], row["realized_pnl"]) for row in wins] == [("VCB", "sell", 2_000_000)]
    assert [(row["ticker"], row["side"], row["realized_pnl"]) for row in losses] == [("VHM", "sell", -1_000_000)]


def test_fills_filter_by_ict_day(client, db):
    _closed_roundtrip(client, db, "VCB", 90000, 110000)
    for fill in db.scalars(select(PaperFill)).all():
        fill.created_at = datetime(2026, 10, 1, 3, 0, 0)
    db.commit()
    _closed_roundtrip(client, db, "VHM", 80000, 70000)
    _stamp_last(db, datetime(2026, 11, 14, 8, 0, 0))
    sell = db.scalars(select(PaperFill).where(PaperFill.ticker == "VHM", PaperFill.side == "buy")).first()
    sell.created_at = datetime(2026, 11, 14, 7, 0, 0)
    db.commit()
    body = client.get("/api/paper", params={"from": "2026-11-14", "to": "2026-11-14"}).json()
    assert {row["ticker"] for row in body["fills"]} == {"VHM"}
    old = client.get("/api/paper", params={"from": "2026-10-01", "to": "2026-10-01"}).json()
    assert {row["ticker"] for row in old["fills"]} == {"VCB"}
