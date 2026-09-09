from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import Settings

ICT = timezone(timedelta(hours=7))


class VnstockClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def configured(self) -> bool:
        return True

    def fetch(self, ticker: str) -> dict[str, Any]:
        try:
            from vnstock import Vnstock  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("vnstock unavailable") from exc

        stock = Vnstock().stock(symbol=ticker, source="VCI")
        profile: Any = {}
        statements: dict[str, Any] = {}
        ratios: Any = {}
        try:
            profile = stock.company.overview().to_dict(orient="records")
        except Exception:
            profile = {}
        try:
            statements["income"] = stock.finance.income_statement(period="year").to_dict(orient="records")
            statements["balance"] = stock.finance.balance_sheet(period="year").to_dict(orient="records")
            statements["cashflow"] = stock.finance.cash_flow(period="year").to_dict(orient="records")
        except Exception:
            statements = statements or {}
        try:
            ratios = stock.finance.ratio(period="year").to_dict(orient="records")
        except Exception:
            ratios = {}
        return {
            "ticker": ticker,
            "profile": profile,
            "statements": statements,
            "ratios": ratios,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
