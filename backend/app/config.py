from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "mysql+pymysql://finmon:finmon@127.0.0.1:3306/finmon"
    frontend_origin: str = "http://localhost:5173"
    timezone: str = "Asia/Ho_Chi_Minh"

    dnse_api_key: str = ""
    dnse_api_secret: str = ""
    dnse_base_url: str = "https://openapi.dnse.com.vn"

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    vnstock_api_key: str = ""
    preferred_ticker: str = "VCB"

    ingest_limit: int | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
