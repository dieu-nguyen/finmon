from sqlalchemy import select

from app.models import ChartNote, Drawing, PageNote, PageNoteRevision


def test_drawings_replace_all_on_put(client, db):
    first = client.put(
        "/api/symbols/vcb/drawings",
        json=[{"tool": "horizontal", "points": [{"date": "2026-09-01", "price": 90000}], "style": {}}],
    )
    assert first.status_code == 200
    assert first.json()[0]["tool"] == "horizontal"
    second = client.put(
        "/api/symbols/VCB/drawings",
        json=[
            {"tool": "trend", "points": [{"date": "2026-09-01", "price": 90000}, {"date": "2026-09-02", "price": 91000}]},
            {"tool": "pin", "points": [{"date": "2026-09-02", "price": 91000}], "style": {"color": "#f00"}},
        ],
    )
    assert second.status_code == 200
    tools = [row["tool"] for row in second.json()]
    assert tools == ["trend", "pin"]
    assert client.get("/api/symbols/vcb/drawings").json() == second.json()
    assert db.scalars(select(Drawing)).all().__len__() == 2


def test_chart_notes_round_trip(client, db):
    empty = client.get("/api/symbols/HPG/chart-notes")
    assert empty.status_code == 200
    assert empty.json() == []
    saved = client.put(
        "/api/symbols/hpg/chart-notes",
        json=[{"date": "2026-09-02", "price": 26500, "text": "gap"}],
    )
    assert saved.status_code == 200
    assert saved.json() == [{"id": saved.json()[0]["id"], "date": "2026-09-02", "price": 26500, "text": "gap"}]
    assert client.get("/api/symbols/HPG/chart-notes").json() == saved.json()
    replaced = client.put("/api/symbols/HPG/chart-notes", json=[])
    assert replaced.json() == []
    assert db.scalars(select(ChartNote)).all() == []


def test_page_note_keeps_a_revision_for_each_save(client, db):
    missing = client.get("/api/symbols/VCB/page-note")
    assert missing.status_code == 200
    assert missing.json()["body"] == ""
    assert missing.json()["updated_at"] is None
    first = client.put("/api/symbols/vcb/page-note", json={"body": "buy the dip"})
    assert first.status_code == 200
    assert first.json()["ticker"] == "VCB"
    assert first.json()["body"] == "buy the dip"
    assert first.json()["updated_at"] is not None
    second = client.put("/api/symbols/VCB/page-note", json={"body": "take profit"})
    assert second.json()["body"] == "take profit"
    assert client.get("/api/symbols/VCB/page-note").json()["body"] == "take profit"
    assert db.get(PageNote, "VCB").body == "take profit"
    bodies = [row.body for row in db.scalars(select(PageNoteRevision).order_by(PageNoteRevision.id)).all()]
    assert bodies == ["buy the dip", "take profit"]
