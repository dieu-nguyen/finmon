from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.models import IngestWatermark
from app.routers import meta


def _settings(**kwargs) -> Settings:
    values = {
        "dnse_api_key": "k",
        "dnse_api_secret": "s",
        "telegram_bot_token": "",
        "telegram_chat_id": "",
        "vnstock_api_key": "",
        "database_url": "mysql+pymysql://finmon:finmon@127.0.0.1:3306/finmon_test",
    }
    values.update(kwargs)
    return Settings(**values)


def test_health_unconfigured_without_dnse(client, monkeypatch):
    monkeypatch.setattr(meta, "get_settings", lambda: _settings(dnse_api_key="", dnse_api_secret=""))
    body = client.get("/api/health").json()
    assert body["status"] == "unconfigured"
    assert body["dnse_configured"] is False


def test_health_error_watermark_wins(client, db, monkeypatch):
    monkeypatch.setattr(meta, "get_settings", lambda: _settings())
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(IngestWatermark(source="dnse", job="backfill", as_of=now, status="error", message="down"))
    db.commit()
    body = client.get("/api/health").json()
    assert body["status"] == "error"
    assert body["watermarks"][0]["status"] == "error"


def test_health_stale_when_watermark_is_old(client, db, monkeypatch):
    monkeypatch.setattr(meta, "get_settings", lambda: _settings())
    old = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    db.add(IngestWatermark(source="dnse", job="backfill", as_of=old, status="ok", message=""))
    db.commit()
    body = client.get("/api/health").json()
    assert body["status"] == "stale"


def test_health_ok_when_dnse_is_fresh(client, db, monkeypatch):
    monkeypatch.setattr(meta, "get_settings", lambda: _settings(telegram_bot_token="t", telegram_chat_id="1"))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(IngestWatermark(source="dnse", job="backfill", as_of=now, status="ok", message=""))
    db.commit()
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["dnse_configured"] is True
    assert body["telegram_configured"] is True
    assert body["as_of"] is not None
