from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import IngestWatermark
from app.schemas import HealthResponse

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    settings = get_settings()
    marks = db.scalars(select(IngestWatermark)).all()
    payload = [
        {
            "source": m.source,
            "job": m.job,
            "as_of": m.as_of.isoformat() if m.as_of else None,
            "status": m.status,
            "message": m.message,
        }
        for m in marks
    ]
    as_of = None
    statuses = [m.status for m in marks]
    if marks:
        as_of = max((m.as_of for m in marks if m.as_of), default=None)
    chip = "ok"
    if not settings.dnse_api_key or not settings.dnse_api_secret:
        chip = "unconfigured"
    elif any(s == "error" for s in statuses):
        chip = "error"
    elif as_of is not None:
        age = datetime.now(timezone.utc).replace(tzinfo=None) - as_of
        if age > timedelta(days=1):
            chip = "stale"
    elif not marks:
        chip = "unconfigured" if chip != "ok" else "ok"
    return HealthResponse(
        status=chip,
        as_of=as_of,
        watermarks=payload,
        dnse_configured=bool(settings.dnse_api_key and settings.dnse_api_secret),
        telegram_configured=bool(settings.telegram_bot_token and settings.telegram_chat_id),
        vnstock_configured=bool(settings.vnstock_api_key),
    )
