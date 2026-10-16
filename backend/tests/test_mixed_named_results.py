from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.clients.telegram import TelegramSender
from app.models import DailyBar, PatternDef, ScanHit, ScanRun
from tests.test_named_patterns import _double_bottom, _ohlc, _series, _window
from tests.test_pattern_compare import AS_OF, _symbol


def _quiet(monkeypatch) -> None:
    monkeypatch.setattr(TelegramSender, "send", lambda self, text: True)


def _hit_fields(row: dict) -> dict:
    return {
        "pattern": row["pattern"],
        "score": row["score"],
        "state": row["state"],
        "run_id": row["run_id"],
        "swings": row["swings"],
    }


def test_market_hits_stay_when_a_ticker_run_adds_another_name(client, db, monkeypatch):
    _quiet(monkeypatch)
    pattern = _double_bottom(74, 82, 89)
    flat = _window(_series())
    for ticker, name in (("ACV", "Airports"), ("XMD", "XMD"), ("VHM", "Vinhomes")):
        db.add(_symbol(ticker, name=name))
    db.add_all(_ohlc("ACV", pattern))
    db.add_all(_ohlc("XMD", pattern))
    db.add_all(_ohlc("VHM", flat))
    db.commit()

    market = client.post("/api/named-scans", json={"patterns": ["double_bottom"], "scope": "all"})
    assert market.status_code == 200
    body = market.json()
    assert [hit["ticker"] for hit in body["hits"]] == ["ACV", "XMD"]
    market_run = db.scalars(select(ScanRun).where(ScanRun.status == "ok")).one()
    assert market_run.request["compared"] == ["ACV", "VHM", "XMD"]
    acv = next(hit for hit in body["hits"] if hit["ticker"] == "ACV")
    symbol = client.get("/api/symbols/ACV/named-patterns").json()
    assert symbol["matches"]
    assert _hit_fields(symbol["matches"][0]) == _hit_fields(acv)
    assert client.get("/api/symbols/VHM/named-patterns").json()["matches"] == []

    for row in list(db.scalars(select(DailyBar).where(DailyBar.ticker == "VHM")).all()):
        db.delete(row)
    db.commit()
    db.add_all(_ohlc("VHM", pattern))
    db.commit()
    added = client.post("/api/symbols/VHM/named-patterns", json={"patterns": ["double_bottom"]})
    assert added.status_code == 200
    mixed = client.get("/api/named-scans").json()["hits"]
    assert [hit["ticker"] for hit in mixed] == ["ACV", "VHM", "XMD"]
    by_ticker = {hit["ticker"]: hit for hit in mixed}
    assert by_ticker["VHM"]["run_id"] != by_ticker["ACV"]["run_id"]
    assert by_ticker["XMD"]["run_id"] == by_ticker["ACV"]["run_id"]
    assert client.get("/api/symbols/VHM/named-patterns").json()["matches"][0]["run_id"] == by_ticker["VHM"]["run_id"]

    for row in db.scalars(select(DailyBar).where(DailyBar.ticker == "ACV")).all():
        row.open = row.high = row.low = row.close = 105
    db.commit()
    cleared = client.post("/api/symbols/ACV/named-patterns", json={"patterns": ["double_bottom"]})
    assert cleared.status_code == 200
    assert cleared.json()["matches"] == []
    left = client.get("/api/named-scans").json()["hits"]
    assert [hit["ticker"] for hit in left] == ["VHM", "XMD"]
    assert client.get("/api/symbols/ACV/named-patterns").json()["matches"] == []
    assert db.scalars(select(ScanHit).where(ScanHit.ticker == "ACV", ScanHit.run_id == market_run.id)).all()
    kept = {hit["ticker"]: hit["run_id"] for hit in left}
    assert kept["VHM"] == by_ticker["VHM"]["run_id"]
    assert kept["XMD"] == by_ticker["XMD"]["run_id"]

    def boom(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.jobs.pattern_scan.detect", boom)
    failed = client.post("/api/symbols/XMD/named-patterns", json={"patterns": ["double_bottom"]})
    assert failed.status_code == 500
    after = client.get("/api/named-scans").json()["hits"]
    assert [hit["ticker"] for hit in after] == ["VHM", "XMD"]
    assert {hit["ticker"]: hit["run_id"] for hit in after}["XMD"] == kept["XMD"]
    bad = db.scalars(select(ScanRun).where(ScanRun.status == "failed")).one()
    assert db.scalars(select(ScanHit).where(ScanHit.run_id == bad.id)).all() == []


def _bars(ticker: str, days: list[date]) -> list[DailyBar]:
    return [
        DailyBar(
            ticker=ticker,
            date=day,
            open=100,
            high=110,
            low=90,
            close=100,
            volume=1,
            value=0,
            source="dnse",
        )
        for day in days
    ]


def _swings(day: date, confirmed: date | None = None) -> dict:
    payload = {
        "pattern": "double_bottom",
        "points": [{"role": "low", "date": day.isoformat(), "price": 90}],
        "neckline": [],
    }
    if confirmed is not None:
        payload["confirmed_on"] = confirmed.isoformat()
    return payload


def _store(db, pattern: PatternDef, request: dict, hits: list[tuple[str, float, dict]]) -> ScanRun:
    now = datetime(2026, 10, 1, 8, 0)
    run = ScanRun(
        pattern_id=pattern.id,
        started_at=now,
        finished_at=now,
        status="ok",
        eligible_count=len(hits),
        compared_count=len(request.get("compared") or request.get("tickers") or []),
        as_of=AS_OF,
        reference_compared=False,
        request=request,
    )
    db.add(run)
    db.flush()
    for ticker, score, swings in hits:
        db.add(
            ScanHit(
                run_id=run.id,
                pattern_id=pattern.id,
                ticker=ticker,
                score=score,
                window_start=AS_OF,
                window_end=AS_OF,
                swings=swings,
                state="confirmed" if "confirmed_on" in swings else "forming",
            )
        )
    db.commit()
    return run


def test_freshness_hides_a_stored_hit_more_than_ten_sessions_behind(client, db):
    days = [date(2026, 1, 1) + timedelta(days=i) for i in range(30)]
    newest = days[-1]
    pattern = PatternDef(name="Named patterns", kind="named", spec={"manual": True}, schedule="manual", enabled=False)
    db.add(pattern)
    for ticker in ("NEAR", "FAR", "LATE", "GONE"):
        db.add(_symbol(ticker))
        db.add_all(_bars(ticker, days))
    db.commit()
    run = _store(
        db,
        pattern,
        {
            "mode": "market",
            "patterns": ["double_bottom"],
            "scope": "all",
            "tickers": [],
            "compared": ["FAR", "GONE", "LATE", "NEAR"],
        },
        [
            ("NEAR", 0.9, _swings(days[19])),
            ("FAR", 0.8, _swings(days[18])),
            ("LATE", 0.95, _swings(days[0], days[25])),
            ("GONE", 0.7, _swings(days[0], days[18])),
        ],
    )
    listed = client.get("/api/named-scans").json()["hits"]
    assert [hit["ticker"] for hit in listed] == ["LATE", "NEAR"]
    assert all(hit["run_id"] == run.id for hit in listed)
    near = next(hit for hit in listed if hit["ticker"] == "NEAR")
    symbol = client.get("/api/symbols/NEAR/named-patterns").json()["matches"][0]
    assert symbol["run_id"] == near["run_id"]
    assert symbol["score"] == near["score"]
    assert symbol["pattern"] == near["pattern"]
    assert client.get("/api/symbols/FAR/named-patterns").json()["matches"] == []
    stored = {hit.ticker for hit in db.scalars(select(ScanHit).where(ScanHit.run_id == run.id)).all()}
    assert stored == {"NEAR", "FAR", "LATE", "GONE"}
    assert newest > days[18]


def test_old_market_run_without_compared_covers_only_the_eligible_universe(client, db):
    pattern_window = _double_bottom(74, 82, 89)
    pattern = PatternDef(name="Named patterns", kind="named", spec={"manual": True}, schedule="manual", enabled=False)
    db.add(pattern)
    db.add(_symbol("ACV", name="Airports"))
    db.add(_symbol("XMD"))
    db.add(_symbol("SHORT"))
    db.add(_symbol("BOND", typ="bond", board="HCX"))
    db.add_all(_ohlc("ACV", pattern_window))
    db.add_all(_ohlc("XMD", pattern_window))
    db.add_all(_ohlc("SHORT", _window(_series(40))))
    db.add_all(_bars("BOND", [AS_OF]))
    db.commit()
    short = _store(
        db,
        pattern,
        {"mode": "ticker", "patterns": ["double_bottom"], "scope": "ticker", "tickers": ["SHORT"]},
        [("SHORT", 0.9, _swings(AS_OF))],
    )
    _store(
        db,
        pattern,
        {"mode": "ticker", "patterns": ["double_bottom"], "scope": "ticker", "tickers": ["XMD"]},
        [("XMD", 0.99, _swings(AS_OF))],
    )
    market = _store(
        db,
        pattern,
        {"mode": "market", "patterns": ["double_bottom"], "scope": "all", "tickers": []},
        [("ACV", 0.8, _swings(AS_OF)), ("BOND", 0.7, _swings(AS_OF))],
    )
    assert "compared" not in market.request
    now = datetime(2026, 10, 2, 8, 0)
    db.add(
        ScanRun(
            pattern_id=pattern.id,
            started_at=now,
            finished_at=now,
            status="failed",
            eligible_count=0,
            compared_count=0,
            as_of=AS_OF,
            reference_compared=False,
            request={
                "mode": "market",
                "patterns": ["double_bottom"],
                "scope": "all",
                "tickers": [],
                "compared": ["ACV", "BOND", "SHORT", "XMD"],
            },
        )
    )
    db.commit()
    listed = client.get("/api/named-scans").json()["hits"]
    assert [hit["ticker"] for hit in listed] == ["SHORT", "ACV", "BOND"]
    by_ticker = {hit["ticker"]: hit for hit in listed}
    assert by_ticker["SHORT"]["run_id"] == short.id
    assert by_ticker["ACV"]["run_id"] == market.id
    assert by_ticker["BOND"]["run_id"] == market.id
    assert db.scalars(select(ScanHit).where(ScanHit.ticker == "XMD")).all()
    assert client.get("/api/symbols/XMD/named-patterns").json()["matches"] == []
    assert client.get("/api/symbols/ACV/named-patterns").json()["matches"][0]["run_id"] == market.id
