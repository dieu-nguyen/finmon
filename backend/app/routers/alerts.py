from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PriceAlert
from app.schemas import AlertIn, AlertOut

router = APIRouter(prefix="/api")


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(db: Session = Depends(get_db)) -> list[PriceAlert]:
    return list(db.scalars(select(PriceAlert).order_by(PriceAlert.id.desc())).all())


@router.post("/alerts", response_model=AlertOut)
def create_alert(body: AlertIn, db: Session = Depends(get_db)) -> PriceAlert:
    row = PriceAlert(
        ticker=body.ticker.upper(),
        op=body.op,
        price=body.price,
        mode=body.mode,
        enabled=body.enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.get(PriceAlert, alert_id)
    if row is None:
        raise HTTPException(404, "not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}
