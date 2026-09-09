from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import SessionLocal
from app.jobs.evaluate_alerts import evaluate_alerts
from app.jobs.ingest import ingest_instruments_and_bars, ingest_watchlist_quotes
from app.routers import alerts, annotations, bars, company, meta, symbols, watchlist


def _run_eod() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        ingest_instruments_and_bars(db, settings)
        evaluate_alerts(db, settings)
    finally:
        db.close()


def _run_quotes() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        ingest_watchlist_quotes(db, settings)
        evaluate_alerts(db, settings)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import os

    scheduler = None
    if os.environ.get("FINMON_TESTING") != "1":
        scheduler = BackgroundScheduler(timezone="Asia/Ho_Chi_Minh")
        scheduler.add_job(_run_eod, CronTrigger(hour=16, minute=30, day_of_week="mon-fri", timezone="Asia/Ho_Chi_Minh"))
        scheduler.add_job(
            _run_quotes,
            CronTrigger(minute="0,30", hour="9-14", day_of_week="mon-fri", timezone="Asia/Ho_Chi_Minh"),
        )
        scheduler.add_job(_run_quotes, CronTrigger(hour=15, minute=0, day_of_week="mon-fri", timezone="Asia/Ho_Chi_Minh"))
        scheduler.start()
    yield
    if scheduler is not None:
        scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="finmon", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin, "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(meta.router)
    app.include_router(symbols.router)
    app.include_router(bars.router)
    app.include_router(watchlist.router)
    app.include_router(annotations.router)
    app.include_router(alerts.router)
    app.include_router(company.router)
    return app


app = create_app()
