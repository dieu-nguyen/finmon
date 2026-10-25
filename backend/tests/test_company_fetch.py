import threading
from concurrent.futures import Future

import pytest
from sqlalchemy.orm import sessionmaker

from app.clients.vnstock_client import CompanyLoad, VnstockClient
from app.config import Settings
from app.models import CompanyCache
from app.routers import company as company_router


@pytest.fixture(autouse=True)
def _clear_company_loads():
    company_router._loads.clear()
    yield
    company_router._loads.clear()


def _patch_parts(monkeypatch, **methods):
    monkeypatch.setattr(VnstockClient, "_ensure_vnstock", lambda self: object)
    for name, fn in methods.items():
        monkeypatch.setattr(VnstockClient, name, fn)


def test_company_parts_run_together(monkeypatch):
    entered: list[str] = []
    barrier = threading.Barrier(5)

    def gate(value):
        def _run(self, ticker, vnstock_cls):
            entered.append(ticker)
            barrier.wait(2)
            return value

        return _run

    _patch_parts(
        monkeypatch,
        _profile=gate([{"organ_name": "Vietcombank"}]),
        _income=gate([{"item_id": "net_sales", "2024": 1}]),
        _balance=gate([{"item_id": "total_assets", "2024": 2}]),
        _cashflow=gate([{"item_id": "cash", "2024": 3}]),
        _ratio=gate([{"pe_ratio": 10}]),
    )

    payload = VnstockClient(Settings()).fetch("VCB")

    assert entered == ["VCB", "VCB", "VCB", "VCB", "VCB"]
    assert payload["profile"][0]["organ_name"] == "Vietcombank"
    assert payload["statements"]["income"][0]["item_id"] == "net_sales"
    assert payload["statements"]["balance"][0]["item_id"] == "total_assets"
    assert payload["statements"]["cashflow"][0]["2024"] == 3
    assert payload["ratios"][0]["pe_ratio"] == 10
    assert payload["fetched_at"]


def test_one_failed_part_keeps_the_others(monkeypatch):
    def boom(self, ticker, vnstock_cls):
        raise RuntimeError("income down")

    _patch_parts(
        monkeypatch,
        _profile=lambda self, ticker, vnstock_cls: [{"organ_name": "Vietcombank"}],
        _income=boom,
        _balance=lambda self, ticker, vnstock_cls: [{"item_id": "total_assets"}],
        _cashflow=lambda self, ticker, vnstock_cls: [],
        _ratio=lambda self, ticker, vnstock_cls: [{"roe": 0.2}],
    )

    payload = VnstockClient(Settings()).fetch("VCB")

    assert payload["profile"][0]["organ_name"] == "Vietcombank"
    assert payload["statements"]["income"] == []
    assert payload["statements"]["balance"][0]["item_id"] == "total_assets"
    assert payload["ratios"][0]["roe"] == 0.2


def test_profile_returns_before_statements_and_caches_once(db, engine, monkeypatch):
    release = threading.Event()
    income_started = threading.Event()
    calls: list[str] = []

    def start(self, ticker):
        calls.append(ticker)
        profile: Future = Future()
        profile.set_result([{"organ_name": "Vietcombank"}])

        def income():
            income_started.set()
            if not release.wait(3):
                raise TimeoutError("statements")
            return [{"item_id": "net_sales", "2024": 9}]

        balance: Future = Future()
        balance.set_result([])
        cashflow: Future = Future()
        cashflow.set_result([])
        ratio: Future = Future()
        ratio.set_result([])
        return CompanyLoad(
            {
                "profile": profile,
                "income": company_router_executor().submit(income),
                "balance": balance,
                "cashflow": cashflow,
                "ratio": ratio,
            }
        )

    monkeypatch.setattr(VnstockClient, "start", start)
    Session = sessionmaker(bind=engine)
    results: dict[str, dict] = {}

    def run(name, fn):
        session = Session()
        try:
            results[name] = fn("vcb", session)
        finally:
            session.close()

    profile_thread = threading.Thread(target=run, args=("profile", company_router.company_profile))
    statements_thread = threading.Thread(target=run, args=("statements", company_router.company_statements))
    profile_thread.start()
    statements_thread.start()

    assert income_started.wait(2)
    profile_thread.join(2)
    assert results["profile"]["profile"][0]["organ_name"] == "Vietcombank"
    assert "statements" not in results
    assert calls == ["VCB"]

    release.set()
    statements_thread.join(3)
    assert results["statements"]["statements"]["income"][0]["2024"] == 9
    assert calls == ["VCB"]

    session = Session()
    try:
        cached = company_router.company("VCB", session)
    finally:
        session.close()
    assert cached["profile"][0]["organ_name"] == "Vietcombank"
    assert cached["statements"]["income"][0]["item_id"] == "net_sales"
    assert calls == ["VCB"]
    row = db.get(CompanyCache, "VCB")
    db.refresh(row)
    assert row is not None
    assert row.payload["ratios"] == []


def company_router_executor():
    from app.clients import vnstock_client

    return vnstock_client._EXECUTOR


def test_fresh_cache_skips_vnstock(client, db, monkeypatch):
    from datetime import datetime, timezone

    db.add(
        CompanyCache(
            ticker="VCB",
            payload={
                "ticker": "VCB",
                "profile": [{"organ_name": "Vietcombank"}],
                "statements": {"income": [{"item_id": "net_sales", "2024": 1}], "balance": [], "cashflow": []},
                "ratios": [],
                "fetched_at": "cached",
            },
            fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
    db.commit()

    def boom(self, ticker):
        raise AssertionError("vnstock")

    monkeypatch.setattr(VnstockClient, "start", boom)
    profile = client.get("/api/symbols/VCB/company/profile")
    statements = client.get("/api/symbols/VCB/company/statements")
    full = client.get("/api/symbols/VCB/company")
    assert profile.status_code == 200
    assert profile.json()["profile"][0]["organ_name"] == "Vietcombank"
    assert "statements" not in profile.json()
    assert statements.status_code == 200
    assert statements.json()["statements"]["income"][0]["item_id"] == "net_sales"
    assert "profile" not in statements.json()
    assert full.status_code == 200
    assert full.json()["profile"][0]["organ_name"] == "Vietcombank"
