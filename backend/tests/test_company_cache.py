from datetime import datetime, timedelta, timezone

from app.clients.vnstock_client import VnstockClient
from app.models import CompanyCache


def test_company_cache_skips_a_second_fetch_inside_24h(client, db, monkeypatch):
    calls: list[str] = []

    def fetch(self, ticker: str):
        calls.append(ticker)
        return {"ticker": ticker, "name": "Vietcombank"}

    monkeypatch.setattr(VnstockClient, "fetch", fetch)
    first = client.get("/api/symbols/vcb/company")
    assert first.status_code == 200
    assert first.json()["name"] == "Vietcombank"
    assert calls == ["VCB"]
    second = client.get("/api/symbols/VCB/company")
    assert second.json() == first.json()
    assert calls == ["VCB"]
    row = db.get(CompanyCache, "VCB")
    assert row is not None


def test_company_cache_refreshes_after_24h(client, db, monkeypatch):
    stale = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=25)
    db.add(CompanyCache(ticker="VCB", payload={"ticker": "VCB", "name": "old"}, fetched_at=stale))
    db.commit()
    calls: list[str] = []

    def fetch(self, ticker: str):
        calls.append(ticker)
        return {"ticker": ticker, "name": "new"}

    monkeypatch.setattr(VnstockClient, "fetch", fetch)
    body = client.get("/api/symbols/VCB/company")
    assert body.status_code == 200
    assert body.json()["name"] == "new"
    assert calls == ["VCB"]
