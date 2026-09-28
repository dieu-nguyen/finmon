from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select, text

from app.clients.dnse import DnseClient
from app.clients.telegram import TelegramSender
from app.config import Settings
from app.jobs.backfill import EXIT_FATAL, EXIT_LOCK, allows_official_bar, run_once
from app.jobs.pattern_scan import format_scan_message, load_windows, run_pattern_scan
from app.models import AlertDelivery, DailyBar, PatternDef, ScanHit, ScanRun, Symbol
from app.patterns import MethodResult, score_lookalike
from app.patterns.lookalike import _minmax, pearson
from app.patterns.windows import Window
from tests.test_backfill import Feed, ICT, _settings

ROOT = Path(__file__).resolve().parents[1]
AS_OF = date(2026, 9, 28)


def _symbol(ticker: str, *, typ: str = "stock", board: str = "HOSE", listed: bool = True, name: str | None = None) -> Symbol:
    return Symbol(ticker=ticker, name=name or ticker, board=board, type=typ, listed=listed)


def _bars(ticker: str, closes: list[float], *, as_of: date = AS_OF, newest_source: str = "dnse") -> list[DailyBar]:
    start = as_of - timedelta(days=len(closes) - 1)
    rows = []
    for i, close in enumerate(closes):
        day = start + timedelta(days=i)
        px = int(close)
        rows.append(
            DailyBar(
                ticker=ticker,
                date=day,
                open=px,
                high=px,
                low=px,
                close=px,
                volume=1,
                value=0,
                source=newest_source if day == as_of else "dnse",
            )
        )
    return rows


def _rising(n: int = 90) -> list[float]:
    return [float(i + 1) for i in range(n)]


def test_identical_series_score_about_one_and_reference_is_excluded():
    up = _rising()
    down = list(reversed(up))
    flat = [5.0] * 90
    start = date(2026, 1, 1)
    end = date(2026, 4, 1)

    def window(closes: list[float]) -> Window:
        return Window(closes=closes, window_start=start, window_end=end)

    result = score_lookalike(
        {"reference": "REF", "min_score": 0.85, "top_k": 20},
        {"REF": window(up), "TWIN": window(up), "REV": window(down), "FLAT": window(flat)},
    )
    tickers = [hit.ticker for hit in result.hits]
    assert "REF" not in tickers
    assert "FLAT" not in tickers
    assert "REV" not in tickers
    assert tickers == ["TWIN"]
    assert result.hits[0].score == pytest.approx(1.0)
    assert result.compared_count == 2
    assert pearson(_minmax(up), _minmax(down)) < 0.85


def test_flat_candidate_is_skipped():
    up = _rising()
    start = date(2026, 1, 1)
    end = date(2026, 4, 1)
    result = score_lookalike(
        {"reference": "REF", "min_score": 0.85, "top_k": 20},
        {
            "REF": Window(up, start, end),
            "FLAT": Window([8.0] * 90, start, end),
        },
    )
    assert result.hits == []
    assert result.compared_count == 0
    assert result.reference_compared is True


def test_universe_skips_bonds_indexes_and_quote_bars(db):
    up = _rising()
    db.add_all(
        [
            _symbol("ETF1", typ="etf"),
            _symbol("BOND1", typ="bond", board="HCX"),
            _symbol("VNINDEX", typ="index"),
            _symbol("QUOTED"),
            _symbol("SHORT"),
        ]
    )
    db.add_all(_bars("ETF1", up))
    db.add_all(_bars("BOND1", up))
    db.add_all(_bars("VNINDEX", up))
    db.add_all(_bars("QUOTED", up, newest_source="quote"))
    db.add_all(_bars("SHORT", up[:40]))
    db.commit()
    windows, eligible = load_windows(db, AS_OF)
    assert eligible == 1
    assert set(windows) == {"ETF1"}
    assert windows["ETF1"].window_end == AS_OF
    assert len(windows["ETF1"].closes) == 90


def test_failed_run_leaves_previous_hits(client, db, monkeypatch):
    up = _rising()
    db.add_all([_symbol("REF", name="Reference"), _symbol("TWIN", name="Twin")])
    db.add_all(_bars("REF", up))
    db.add_all(_bars("TWIN", up))
    db.commit()
    created = client.post(
        "/api/patterns",
        json={"name": "Like REF", "reference": "REF", "min_score": 0.85, "top_k": 20, "enabled": True},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["kind"] == "lookalike"
    assert body["schedule"] == "daily"
    assert db.scalars(select(ScanRun)).all() == []
    sent: list[str] = []
    monkeypatch.setattr(TelegramSender, "send", lambda self, text: sent.append(text) or True)
    run_pattern_scan(db, AS_OF, Settings(telegram_bot_token="t", telegram_chat_id="c"))
    hits = client.get(f"/api/patterns/{body['id']}/hits").json()
    assert [row["ticker"] for row in hits["hits"]] == ["TWIN"]
    assert hits["hits"][0]["name"] == "Twin"
    assert hits["reference_compared"] is True
    assert "REF" not in [row["ticker"] for row in hits["hits"]]
    assert len(sent) == 1
    assert "Like REF" in sent[0]
    assert "TWIN" in sent[0]
    assert db.scalars(select(AlertDelivery)).all() == []

    def boom(_spec, _windows):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.jobs.pattern_scan.method_for", lambda _kind: boom)
    run_pattern_scan(db, AS_OF, Settings(telegram_bot_token="t", telegram_chat_id="c"))
    again = client.get(f"/api/patterns/{body['id']}/hits").json()
    assert [row["ticker"] for row in again["hits"]] == ["TWIN"]
    assert again["as_of"] == AS_OF.isoformat()
    failed = db.scalars(select(ScanRun).where(ScanRun.status == "failed")).all()
    assert len(failed) == 1
    assert db.scalars(select(ScanHit).where(ScanHit.run_id == failed[0].id)).all() == []
    assert len(sent) == 1


def test_kind_lookalike_is_dispatched_through_the_registry(db, monkeypatch):
    seen: list[str] = []

    def fake(_spec, _windows):
        return MethodResult(hits=[], compared_count=1, reference_compared=True)

    def resolve(kind: str):
        seen.append(kind)
        return fake

    monkeypatch.setattr("app.jobs.pattern_scan.method_for", resolve)
    db.add(PatternDef(name="Daily", kind="lookalike", spec={"reference": "REF", "min_score": 0.85, "top_k": 20}, schedule="daily", enabled=True))
    db.add(PatternDef(name="Weekly", kind="lookalike", spec={"reference": "REF", "min_score": 0.85, "top_k": 20}, schedule="weekly", enabled=True))
    db.add(PatternDef(name="Off", kind="lookalike", spec={"reference": "REF", "min_score": 0.85, "top_k": 20}, schedule="daily", enabled=False))
    db.commit()
    run_pattern_scan(db, AS_OF, Settings())
    assert seen == ["lookalike"]
    source = (ROOT / "app/jobs/pattern_scan.py").read_text()
    assert "pearson" not in source
    assert "DnseClient" not in source
    main = (ROOT / "app/main.py").read_text()
    assert "pattern_scan" not in main
    assert "run_pattern_scan" not in main


def test_telegram_lines_for_empty_and_uncompared_reference(db, monkeypatch):
    up = _rising()
    down = list(reversed(up))
    db.add_all([_symbol("REF"), _symbol("REV")])
    db.add_all(_bars("REF", up))
    db.add_all(_bars("REV", down))
    db.add(
        PatternDef(
            name="No match",
            kind="lookalike",
            spec={"reference": "REF", "min_score": 0.85, "top_k": 20},
            schedule="daily",
            enabled=True,
        )
    )
    db.add(
        PatternDef(
            name="Missing ref",
            kind="lookalike",
            spec={"reference": "GONE", "min_score": 0.85, "top_k": 20},
            schedule="daily",
            enabled=True,
        )
    )
    db.commit()
    sent: list[str] = []
    monkeypatch.setattr(TelegramSender, "send", lambda self, text: sent.append(text) or True)
    run_pattern_scan(db, AS_OF, Settings(telegram_bot_token="t", telegram_chat_id="c"))
    assert len(sent) == 2
    assert "\n" not in sent[0]
    assert "nothing cleared the floor" in sent[0]
    assert "No match" in sent[0] and "REF" in sent[0] and AS_OF.isoformat() in sent[0]
    assert "\n" not in sent[1]
    assert "was not compared" in sent[1]
    assert "Missing ref" in sent[1] and "GONE" in sent[1]


def test_telegram_failure_keeps_ok_run(db, monkeypatch):
    up = _rising()
    db.add_all([_symbol("REF"), _symbol("TWIN")])
    db.add_all(_bars("REF", up))
    db.add_all(_bars("TWIN", up))
    db.add(
        PatternDef(
            name="Like REF",
            kind="lookalike",
            spec={"reference": "REF", "min_score": 0.85, "top_k": 20},
            schedule="daily",
            enabled=True,
        )
    )
    db.commit()

    def explode(self, text):
        raise RuntimeError("telegram down")

    monkeypatch.setattr(TelegramSender, "send", explode)
    run_pattern_scan(db, AS_OF, Settings(telegram_bot_token="t", telegram_chat_id="c"))
    run = db.scalar(select(ScanRun))
    assert run is not None
    assert run.status == "ok"
    assert db.scalars(select(ScanHit).where(ScanHit.run_id == run.id)).all()


def test_messages_are_one_line_when_nothing_matches():
    result = MethodResult(hits=[], compared_count=3, reference_compared=True)
    text = format_scan_message("Name", "REF", AS_OF, result)
    assert text.count("\n") == 0
    skipped = format_scan_message("Name", "REF", AS_OF, MethodResult([], 0, False))
    assert skipped.count("\n") == 0
    assert "was not compared" in skipped


def test_weekday_before_close_does_not_scan(db, monkeypatch):
    seen: list[date] = []
    monkeypatch.setattr("app.jobs.backfill.run_pattern_scan", lambda *_a, **_k: seen.append(AS_OF))
    feed = Feed(["VCB"])
    feed.bars["VCB"] = [date(2026, 9, 25)]
    now = datetime(2026, 9, 28, 10, 0, tzinfo=ICT)
    assert allows_official_bar(now) is False
    assert run_once(db, _settings(), feed.client(), now=now) == 0
    assert seen == []


def test_after_close_and_weekend_scan(db, monkeypatch):
    seen: list[date] = []
    monkeypatch.setattr("app.jobs.backfill.run_pattern_scan", lambda _db, as_of, _settings: seen.append(as_of))
    feed = Feed(["VCB"])
    feed.bars["VCB"] = [date(2026, 9, 25), date(2026, 9, 28)]
    assert run_once(db, _settings(), feed.client(), now=datetime(2026, 9, 28, 16, 30, tzinfo=ICT)) == 0
    assert seen == [date(2026, 9, 28)]
    weekend = datetime(2026, 9, 26, 12, 0, tzinfo=ICT)
    assert allows_official_bar(weekend) is True
    assert run_once(db, _settings(), feed.client(), now=weekend) == 0
    assert seen[-1] == date(2026, 9, 25)


def test_early_exits_do_not_scan(db, engine, monkeypatch):
    seen: list[int] = []
    monkeypatch.setattr("app.jobs.backfill.run_pattern_scan", lambda *_a, **_k: seen.append(1))
    assert run_once(db, Settings(dnse_api_key="", dnse_api_secret=""), now=datetime(2026, 9, 28, 16, 30, tzinfo=ICT)) == EXIT_FATAL
    other = engine.connect()
    other.execute(text("SELECT GET_LOCK('finmon_backfill', 0)"))
    other.commit()
    try:
        assert run_once(db, _settings(), now=datetime(2026, 9, 28, 16, 30, tzinfo=ICT)) == EXIT_LOCK
    finally:
        other.execute(text("SELECT RELEASE_LOCK('finmon_backfill')"))
        other.close()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "no"})

    client = DnseClient(_settings(), transport=httpx.MockTransport(handler))
    assert run_once(db, _settings(), client, now=datetime(2026, 9, 28, 16, 30, tzinfo=ICT)) == EXIT_FATAL
    assert seen == []
