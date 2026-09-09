import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_db
from app.main import create_app

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def engine():
    settings = get_settings()
    eng = create_engine(settings.database_url, pool_pre_ping=True)
    with eng.connect() as conn:
        conn.execute(text("SELECT 1"))
    return eng


@pytest.fixture()
def db(engine):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db, engine):
    import os

    os.environ["FINMON_TESTING"] = "1"
    app = create_app()

    def _get_db():
        yield db

    app.dependency_overrides[get_db] = _get_db
    from fastapi.testclient import TestClient

    with TestClient(app) as tc:
        yield tc


def load_fixture(name: str):
    return json.loads((FIX / name).read_text())
