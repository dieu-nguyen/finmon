from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select

from app.clients.telegram import TelegramSender
from app.config import Settings
from app.jobs.pattern_scan import format_named_message, load_windows, run_pattern_scan
from app.models import DailyBar, PatternDef, ScanHit, ScanRun, Symbol
from app.patterns import method_for
from app.patterns.lookalike import MethodResult
from app.patterns.named import (
    FRESH_SESSIONS,
    HEAD_PROMINENCE,
    HIT_CAP,
    LOOKBACK,
    PAIR_TOLERANCE,
    PATTERNS,
    SCORE_FLOOR,
    SWING_BARS,
    detect,
    match_all,
    score_named,
)
from app.patterns.windows import Window
from tests.test_pattern_compare import AS_OF, _symbol

ROOT = Path(__file__).resolve().parents[1]


def _series(n: int = LOOKBACK) -> dict[str, list[float]]:
    return {"highs": [110.0] * n, "lows": [100.0] * n, "closes": [105.0] * n}


def _bar(series: dict[str, list[float]], index: int, high: float, low: float, close: float) -> None:
    series["highs"][index] = high
    series["lows"][index] = low
    series["closes"][index] = close


def _window(series: dict[str, list[float]], as_of: date = AS_OF) -> Window:
    n = len(series["closes"])
    dates = [as_of - timedelta(days=n - 1 - i) for i in range(n)]
    return Window(
        closes=list(series["closes"]),
        window_start=dates[0],
        window_end=dates[-1],
        highs=list(series["highs"]),
        lows=list(series["lows"]),
        dates=dates,
    )


def _double_bottom(left: int, peak: int, right: int) -> Window:
    series = _series()
    _bar(series, left, 96, 90, 92)
    _bar(series, peak, 130, 120, 125)
    _bar(series, right, 96, 90, 92)
    return _window(series)


def _head_and_shoulders(*, head_high: float) -> Window:
    series = _series()
    _bar(series, 62, 120, 112, 118)
    _bar(series, 68, 96, 90, 92)
    _bar(series, 74, head_high, head_high - 10, head_high - 4)
    _bar(series, 80, 96, 90, 92)
    _bar(series, 86, 120, 112, 118)
    return _window(series)


def _ohlc(ticker: str, window: Window) -> list[DailyBar]:
    rows = []
    for i, day in enumerate(window.dates):
        close = int(window.closes[i])
        rows.append(
            DailyBar(
                ticker=ticker,
                date=day,
                open=close,
                high=int(window.highs[i]),
                low=int(window.lows[i]),
                close=close,
                volume=1,
                value=0,
                source="dnse",
            )
        )
    return rows


def test_constants_are_the_locked_named_pattern_defaults():
    assert LOOKBACK == 90
    assert FRESH_SESSIONS == 10
    assert SWING_BARS == 5
    assert PAIR_TOLERANCE == 0.03
    assert HEAD_PROMINENCE == 0.03
    assert SCORE_FLOOR == 0.70
    assert HIT_CAP == 20
    assert PATTERNS == (
        "double_bottom",
        "double_top",
        "head_and_shoulders",
        "inverse_head_and_shoulders",
    )


def test_double_bottom_at_the_right_edge_matches_and_an_old_one_does_not():
    fresh = _double_bottom(74, 82, 89)
    hit = detect(fresh, "double_bottom")
    assert hit is not None
    assert hit.state == "forming"
    assert hit.score == 1
    assert hit.swings["points"][-1]["date"] == fresh.dates[89].isoformat()
    assert "confirmed_on" not in hit.swings
    assert hit.swings["points"][-1]["price"] == 90
    assert hit.window_end == fresh.window_end
    assert hit.swings["neckline"][0]["price"] == 130
    assert hit.swings["neckline"][1]["date"] == fresh.window_end.isoformat()

    stale = _double_bottom(44, 52, 59)
    assert detect(stale, "double_bottom") is None
    assert match_all(stale) == []


def test_previous_week_still_matches_when_the_run_is_later():
    window = _double_bottom(70, 78, 84)
    hit = detect(window, "double_bottom")
    assert hit is not None
    assert hit.state == "forming"
    assert hit.swings["points"][-1]["date"] != window.window_end.isoformat()
    assert window.dates[84] >= window.dates[-FRESH_SESSIONS]


def test_head_and_shoulders_needs_a_clear_head():
    clear = _head_and_shoulders(head_high=140)
    hit = detect(clear, "head_and_shoulders")
    assert hit is not None
    assert hit.state == "forming"
    assert hit.score == 1
    assert [point["role"] for point in hit.swings["points"]] == ["shoulder", "trough", "head", "trough", "shoulder"]

    flat = _head_and_shoulders(head_high=120)
    assert detect(flat, "head_and_shoulders") is None


def test_confirmed_break_inside_ten_sessions_matches():
    series = _series()
    _bar(series, 60, 96, 90, 92)
    _bar(series, 68, 130, 120, 125)
    _bar(series, 76, 96, 90, 92)
    _bar(series, 85, 150, 140, 148)
    hit = detect(_window(series), "double_bottom")
    assert hit is not None
    assert hit.state == "confirmed"
    window = _window(series)
    assert hit.swings["points"][-1]["date"] == window.dates[76].isoformat()
    assert hit.swings["confirmed_on"] == window.dates[85].isoformat()


def test_one_ticker_and_market_detector_agree():
    window = _double_bottom(74, 82, 89)
    direct = detect(window, "double_bottom")
    checked = next(hit for hit in match_all(window) if hit.pattern == "double_bottom")
    market = score_named({"pattern": "double_bottom"}, {"VHM": window})
    assert direct is not None
    assert market.compared_count == 1
    assert len(market.hits) == 1
    row = market.hits[0]
    assert row.ticker == "VHM"
    assert row.pattern == "double_bottom"
    assert row.score == direct.score == checked.score
    assert row.state == direct.state == checked.state
    assert row.swings == direct.swings == checked.swings
    assert row.window_start == direct.window_start
    assert "reference" not in (row.swings or {})


def test_market_scan_keeps_twenty_highest_scores():
    window = _double_bottom(74, 82, 89)
    windows = {f"T{i:02d}": window for i in range(HIT_CAP + 1)}
    result = score_named({"pattern": "double_bottom"}, windows)
    assert [hit.ticker for hit in result.hits] == [f"T{i:02d}" for i in range(HIT_CAP)]
    assert result.compared_count == HIT_CAP + 1


def test_named_method_is_registered_and_does_not_call_pearson():
    assert method_for("named") is score_named
    source = (ROOT / "app/patterns/named.py").read_text()
    assert "pearson" not in source
    assert "numpy" not in source
    assert "pandas" not in source
    job = (ROOT / "app/jobs/pattern_scan.py").read_text()
    assert "pearson" not in job


def test_named_message_has_no_reference_ticker():
    empty = format_named_message("Bottoms", AS_OF, MethodResult(hits=[], compared_count=3, reference_compared=True))
    assert empty.count("\n") == 0
    assert "Bottoms" in empty and AS_OF.isoformat() in empty
    assert "nothing cleared the floor" in empty
    assert "Reference" not in empty
    window = _double_bottom(74, 82, 89)
    result = score_named({"pattern": "double_bottom"}, {"VHM": window})
    text = format_named_message("Bottoms", AS_OF, result)
    assert "Reference" not in text
    assert "VHM" in text and "forming" in text


def test_universe_skips_bond_index_hcx_and_futures(db):
    window = _double_bottom(74, 82, 89)
    db.add_all(
        [
            _symbol("KEEP"),
            _symbol("BOND1", typ="bond", board="HCX"),
            _symbol("VNINDEX", typ="index"),
            _symbol("FUT1", typ="futures", board="HNX"),
            _symbol("DVX1", typ="stock", board="DVX"),
        ]
    )
    for ticker in ("KEEP", "BOND1", "VNINDEX", "FUT1", "DVX1"):
        db.add_all(_ohlc(ticker, window))
    db.commit()
    windows, eligible = load_windows(db, AS_OF)
    assert eligible == 1
    assert set(windows) == {"KEEP"}


def test_backfill_scan_does_not_run_named_patterns(db, monkeypatch):
    window = _double_bottom(74, 82, 89)
    db.add(_symbol("VHM", name="Vinhomes"))
    db.add_all(_ohlc("VHM", window))
    db.add(PatternDef(name="Bottoms", kind="named", spec={"pattern": "double_bottom"}, schedule="daily", enabled=True))
    db.add(PatternDef(name="Like VHM", kind="lookalike", spec={"reference": "VHM", "min_score": 0.85, "top_k": 20}, schedule="daily", enabled=True))
    db.commit()
    named_calls: list[dict] = []

    def spy(spec, windows):
        named_calls.append(spec)
        return score_named(spec, windows)

    monkeypatch.setattr("app.jobs.pattern_scan.score_named", spy)
    monkeypatch.setattr(TelegramSender, "send", lambda self, text: True)
    run_pattern_scan(db, AS_OF, Settings(telegram_bot_token="t", telegram_chat_id="c"))
    assert named_calls == []
    runs = list(db.scalars(select(ScanRun)).all())
    defs = {row.id: row for row in db.scalars(select(PatternDef)).all()}
    assert any(defs[row.pattern_id].kind == "lookalike" for row in runs)
    assert not any(defs[row.pattern_id].name == "Bottoms" for row in runs)
    job = (ROOT / "app/jobs/pattern_scan.py").read_text()
    assert 'PatternDef.kind == "lookalike"' in job
    quotes = (ROOT / "app/main.py").read_text().split("def _run_quotes", 1)[1].split("\ndef ", 1)[0]
    assert "named" not in quotes
    assert "pattern_scan" not in quotes


def test_symbol_get_does_not_scan(client, db, monkeypatch):
    window = _double_bottom(74, 82, 89)
    db.add(_symbol("VHM"))
    db.add_all(_ohlc("VHM", window))
    db.commit()

    def boom(*_args, **_kwargs):
        raise AssertionError("detect")

    monkeypatch.setattr("app.patterns.named.detect", boom)
    monkeypatch.setattr("app.jobs.pattern_scan.detect", boom)
    resp = client.get("/api/symbols/VHM/named-patterns")
    assert resp.status_code == 200
    body = resp.json()
    assert body["matches"] == []
    assert body["patterns"] == []
    assert body["as_of"] is None
    assert db.scalars(select(ScanRun)).all() == []


def test_triggered_ticker_scan_is_stored_and_reread_without_detect(client, db, monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(TelegramSender, "send", lambda self, text: sent.append(text) or True)
    window = _double_bottom(74, 82, 89)
    db.add(_symbol("VHM", name="Vinhomes"))
    db.add_all(_ohlc("VHM", window))
    db.commit()
    first = client.post("/api/symbols/VHM/named-patterns", json={"patterns": ["double_bottom", "double_bottom"]})
    assert first.status_code == 200
    body = first.json()
    assert body["patterns"] == ["double_bottom"]
    assert len(body["matches"]) == 1
    match = body["matches"][0]
    assert match["pattern"] == "double_bottom"
    assert match["state"] == "forming"
    assert match["score"] == 1
    assert match["swings"]["points"][0]["date"]
    assert sent == []
    run = db.scalars(select(ScanRun)).one()
    assert run.status == "ok"
    assert run.request["mode"] == "ticker"
    assert run.request["patterns"] == ["double_bottom"]
    assert run.request["tickers"] == ["VHM"]
    stored = db.scalars(select(ScanHit)).one()
    assert stored.state == "forming"
    assert stored.swings["pattern"] == "double_bottom"
    for row in list(db.scalars(select(DailyBar)).all()):
        db.delete(row)
    db.commit()

    def boom(*_args, **_kwargs):
        raise AssertionError("detect")

    monkeypatch.setattr("app.patterns.named.detect", boom)
    monkeypatch.setattr("app.jobs.pattern_scan.detect", boom)
    again = client.get("/api/symbols/VHM/named-patterns")
    assert again.status_code == 200
    reread = again.json()["matches"][0]
    assert reread["score"] == match["score"]
    assert reread["state"] == match["state"]
    assert reread["swings"] == match["swings"]
    assert sent == []


def test_market_subset_does_not_walk_other_tickers(client, db, monkeypatch):
    window = _double_bottom(74, 82, 89)
    db.add(_symbol("VHM", name="Vinhomes"))
    db.add(_symbol("FPT", name="FPT"))
    db.add_all(_ohlc("VHM", window))
    db.add_all(_ohlc("FPT", window))
    db.commit()
    seen: list[list[str]] = []
    from app.jobs.pattern_scan import _fetch_windows

    def spy(session, as_of, tickers):
        seen.append(list(tickers))
        return _fetch_windows(session, as_of, tickers)

    monkeypatch.setattr("app.jobs.pattern_scan._fetch_windows", spy)
    sent: list[str] = []
    monkeypatch.setattr(TelegramSender, "send", lambda self, text: sent.append(text) or True)
    scored: list[str] = []

    def spy_score(spec, windows):
        scored.append(spec["pattern"])
        return score_named(spec, windows)

    monkeypatch.setattr("app.jobs.pattern_scan.score_named", spy_score)
    resp = client.post(
        "/api/named-scans",
        json={"patterns": ["double_top", "double_bottom"], "scope": "subset", "tickers": ["VHM"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["patterns"] == ["double_bottom", "double_top"]
    assert body["scope"] == "subset"
    assert body["tickers"] == ["VHM"]
    assert body["hits"]
    assert {hit["ticker"] for hit in body["hits"]} == {"VHM"}
    assert seen
    assert all("FPT" not in batch for batch in seen)
    assert all(batch == ["VHM"] for batch in seen)
    assert scored == ["double_bottom", "double_top"]
    assert len(sent) == 1
    assert "Reference" not in sent[0]
    assert "forming" in sent[0]
    assert "\n" in sent[0]
    again = client.get("/api/named-scans")
    assert again.json()["hits"][0]["ticker"] == "VHM"
    assert again.json()["tickers"] == ["VHM"]
    from app.models import AlertDelivery

    assert db.scalars(select(AlertDelivery)).all() == []


def test_failed_market_run_keeps_previous_hits_and_skips_telegram(client, db, monkeypatch):
    window = _double_bottom(74, 82, 89)
    db.add(_symbol("VHM", name="Vinhomes"))
    db.add_all(_ohlc("VHM", window))
    db.commit()
    sent: list[str] = []

    def send(self, text):
        sent.append(text)
        return True

    monkeypatch.setattr(TelegramSender, "send", send)
    ok = client.post("/api/named-scans", json={"patterns": ["double_bottom"], "scope": "all"})
    assert ok.status_code == 200
    assert ok.json()["scope"] == "all"
    assert ok.json()["tickers"] == []
    assert len(sent) == 1

    def boom(_spec, _windows):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.jobs.pattern_scan.score_named", boom)
    failed = client.post("/api/named-scans", json={"patterns": ["double_bottom"], "scope": "all"})
    assert failed.status_code == 500
    assert len(sent) == 1
    again = client.get("/api/named-scans")
    assert again.json()["hits"][0]["ticker"] == "VHM"
    bad = db.scalars(select(ScanRun).where(ScanRun.status == "failed")).all()
    assert len(bad) == 1
    assert db.scalars(select(ScanHit).where(ScanHit.run_id == bad[0].id)).all() == []


def test_failed_named_telegram_keeps_the_ok_run(client, db, monkeypatch):
    window = _double_bottom(74, 82, 89)
    db.add(_symbol("VHM"))
    db.add_all(_ohlc("VHM", window))
    db.commit()

    def boom(self, text):
        raise RuntimeError("down")

    monkeypatch.setattr(TelegramSender, "send", boom)
    resp = client.post("/api/named-scans", json={"patterns": ["double_bottom"], "scope": "subset", "tickers": ["vhm"]})
    assert resp.status_code == 200
    assert resp.json()["hits"][0]["ticker"] == "VHM"
    assert resp.json()["tickers"] == ["VHM"]
    run = db.scalars(select(ScanRun).where(ScanRun.status == "ok")).one()
    assert run.request["tickers"] == ["VHM"]


def test_empty_selection_does_not_scan(client, db):
    assert client.post("/api/named-scans", json={"patterns": [], "scope": "all"}).status_code == 400
    assert client.post("/api/named-scans", json={"patterns": ["double_bottom"], "scope": "subset", "tickers": []}).status_code == 400
    assert client.post("/api/symbols/VHM/named-patterns", json={"patterns": []}).status_code == 400
    assert client.post("/api/named-scans", json={"patterns": ["bull_flag"], "scope": "all"}).status_code == 400
    assert db.scalars(select(ScanRun)).all() == []
    catalog = client.get("/api/pattern-catalog")
    assert catalog.status_code == 200
    assert [row["id"] for row in catalog.json()] == list(PATTERNS)
    assert "bull_flag" not in [row["id"] for row in catalog.json()]


def test_api_accepts_the_four_names_and_rejects_others(client):
    for pattern in PATTERNS:
        saved = client.post("/api/patterns", json={"name": pattern, "kind": "named", "pattern": pattern, "enabled": True})
        assert saved.status_code == 200
        assert saved.json()["spec"]["pattern"] == pattern
    rejected = client.post("/api/patterns", json={"name": "Flag", "kind": "named", "pattern": "bull_flag", "enabled": True})
    assert rejected.status_code == 400
    missing = client.post("/api/patterns", json={"name": "Nope", "kind": "named", "enabled": True})
    assert missing.status_code == 400


def test_double_top_and_inverse_head_and_shoulders_match():
    series = _series()
    _bar(series, 74, 130, 120, 125)
    _bar(series, 82, 96, 90, 92)
    _bar(series, 89, 130, 120, 125)
    top = detect(_window(series), "double_top")
    assert top is not None and top.state == "forming" and top.score == 1

    inverse = _series()
    _bar(inverse, 62, 100, 90, 94)
    _bar(inverse, 68, 140, 130, 136)
    _bar(inverse, 74, 80, 70, 74)
    _bar(inverse, 80, 140, 130, 136)
    _bar(inverse, 86, 100, 90, 94)
    hit = detect(_window(inverse), "inverse_head_and_shoulders")
    assert hit is not None and hit.state == "forming" and hit.score == 1
    assert [point["role"] for point in hit.swings["points"]] == ["shoulder", "peak", "head", "peak", "shoulder"]
