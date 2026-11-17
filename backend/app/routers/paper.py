from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.paper import place_order, reset_account, snapshot
from app.schemas import PaperAccountOut, PaperOrderIn

router = APIRouter(prefix="/api")


@router.get("/paper", response_model=PaperAccountOut)
def get_paper(
    db: Session = Depends(get_db),
    ticker: str | None = None,
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    result: Literal["all", "win", "lose"] = "all",
) -> PaperAccountOut:
    out = snapshot(db, ticker=ticker, from_=from_, to=to, result=result)
    db.commit()
    return out


@router.post("/paper/orders", response_model=PaperAccountOut)
def create_order(body: PaperOrderIn, db: Session = Depends(get_db)) -> PaperAccountOut:
    return place_order(db, body)


@router.post("/paper/reset", response_model=PaperAccountOut)
def reset_paper(db: Session = Depends(get_db)) -> PaperAccountOut:
    return reset_account(db)
