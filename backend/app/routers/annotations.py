from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ChartNote, Drawing, PageNote, PageNoteRevision
from app.schemas import ChartNoteIn, DrawingIn, PageNoteIn

router = APIRouter(prefix="/api")


@router.get("/symbols/{ticker}/drawings")
def get_drawings(ticker: str, db: Session = Depends(get_db)) -> list[dict]:
    ticker = ticker.upper()
    rows = db.scalars(select(Drawing).where(Drawing.ticker == ticker)).all()
    return [{"id": r.id, "tool": r.tool, "points": r.points, "style": r.style} for r in rows]


@router.put("/symbols/{ticker}/drawings")
def put_drawings(ticker: str, body: list[DrawingIn], db: Session = Depends(get_db)) -> list[dict]:
    ticker = ticker.upper()
    db.execute(delete(Drawing).where(Drawing.ticker == ticker))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for item in body:
        db.add(
            Drawing(
                ticker=ticker,
                tool=item.tool,
                points=item.points,
                style=item.style,
                created_at=now,
            )
        )
    db.commit()
    return get_drawings(ticker, db)


@router.get("/symbols/{ticker}/chart-notes")
def get_chart_notes(ticker: str, db: Session = Depends(get_db)) -> list[dict]:
    ticker = ticker.upper()
    rows = db.scalars(select(ChartNote).where(ChartNote.ticker == ticker)).all()
    return [
        {"id": r.id, "date": r.date.isoformat(), "price": r.price, "text": r.text}
        for r in rows
    ]


@router.put("/symbols/{ticker}/chart-notes")
def put_chart_notes(ticker: str, body: list[ChartNoteIn], db: Session = Depends(get_db)) -> list[dict]:
    ticker = ticker.upper()
    db.execute(delete(ChartNote).where(ChartNote.ticker == ticker))
    for item in body:
        db.add(ChartNote(ticker=ticker, date=item.date, price=item.price, text=item.text))
    db.commit()
    return get_chart_notes(ticker, db)


@router.get("/symbols/{ticker}/page-note")
def get_page_note(ticker: str, db: Session = Depends(get_db)) -> dict:
    ticker = ticker.upper()
    row = db.get(PageNote, ticker)
    if row is None:
        return {"ticker": ticker, "body": "", "updated_at": None}
    return {"ticker": ticker, "body": row.body, "updated_at": row.updated_at.isoformat()}


@router.put("/symbols/{ticker}/page-note")
def put_page_note(ticker: str, body: PageNoteIn, db: Session = Depends(get_db)) -> dict:
    ticker = ticker.upper()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = db.get(PageNote, ticker)
    if row is None:
        row = PageNote(ticker=ticker, body=body.body, updated_at=now)
        db.add(row)
    else:
        row.body = body.body
        row.updated_at = now
    db.add(PageNoteRevision(ticker=ticker, body=body.body, created_at=now))
    db.commit()
    return get_page_note(ticker, db)
