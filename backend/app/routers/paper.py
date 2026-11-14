from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.paper import place_order, reset_account, snapshot
from app.schemas import PaperAccountOut, PaperOrderIn

router = APIRouter(prefix="/api")


@router.get("/paper", response_model=PaperAccountOut)
def get_paper(db: Session = Depends(get_db)) -> PaperAccountOut:
    out = snapshot(db)
    db.commit()
    return out


@router.post("/paper/orders", response_model=PaperAccountOut)
def create_order(body: PaperOrderIn, db: Session = Depends(get_db)) -> PaperAccountOut:
    return place_order(db, body)


@router.post("/paper/reset", response_model=PaperAccountOut)
def reset_paper(db: Session = Depends(get_db)) -> PaperAccountOut:
    return reset_account(db)
