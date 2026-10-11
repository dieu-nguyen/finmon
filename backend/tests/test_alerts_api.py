from app.models import PriceAlert


def test_alert_crud_and_validation(client, db):
    created = client.post("/api/alerts", json={"ticker": "vcb", "op": "gte", "price": 91000, "mode": "once"})
    assert created.status_code == 200
    body = created.json()
    assert body["ticker"] == "VCB"
    assert body["op"] == "gte"
    assert body["price"] == 91000
    assert body["mode"] == "once"
    assert body["enabled"] is True
    assert body["last_fired_at"] is None
    assert db.get(PriceAlert, body["id"]) is not None

    listed = client.get("/api/alerts")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [body["id"]]

    deleted = client.delete(f"/api/alerts/{body['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "ok"}
    assert client.get("/api/alerts").json() == []
    assert client.delete(f"/api/alerts/{body['id']}").status_code == 404


def test_alert_rejects_unknown_op_and_mode(client):
    bad_op = client.post("/api/alerts", json={"ticker": "VCB", "op": "eq", "price": 1, "mode": "once"})
    assert bad_op.status_code == 422
    bad_mode = client.post("/api/alerts", json={"ticker": "VCB", "op": "gte", "price": 1, "mode": "daily"})
    assert bad_mode.status_code == 422
