from app.models import PriceAlert
from app.jobs.evaluate_alerts import evaluate_alerts
from app.config import Settings


class OkSender:
    def send(self, text: str) -> bool:
        return True


def test_company_failure_does_not_break_bars(client, db, monkeypatch):
    from app.clients import vnstock_client

    def boom(self, ticker: str):
        raise RuntimeError("down")

    monkeypatch.setattr(vnstock_client.VnstockClient, "fetch", boom)
    from datetime import date

    from app.models import DailyBar, Symbol

    db.add(Symbol(ticker="VCB", name="Vietcombank", board="HOSE", type="stock", listed=True))
    db.add(
        DailyBar(
            ticker="VCB",
            date=date(2026, 9, 2),
            open=1,
            high=1,
            low=1,
            close=1,
            volume=1,
            value=0,
            source="dnse",
        )
    )
    db.commit()
    assert client.get("/api/symbols/VCB/bars").status_code == 200
    fail = client.get("/api/symbols/VCB/company")
    assert fail.status_code == 503
    assert fail.json()["detail"]["error"] == "unavailable"


def test_evaluate_marks_fired(db):
    db.add(
        PriceAlert(ticker="VCB", op="gte", price=100, mode="once", enabled=True)
    )
    from app.models import QuoteSnapshot

    db.add(QuoteSnapshot(ticker="VCB", last=100, source="dnse"))
    db.commit()
    n = evaluate_alerts(db, Settings(), sender=OkSender())
    assert n == 1
    row = db.query(PriceAlert).one()
    assert row.last_fired_at is not None
