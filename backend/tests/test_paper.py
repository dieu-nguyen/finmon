from datetime import date

from app.models import DailyBar, QuoteSnapshot, Symbol


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
