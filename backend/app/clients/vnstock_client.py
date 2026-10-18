from __future__ import annotations

import threading
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from app.config import Settings

_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="company-vnstock")
_setup_lock = threading.Lock()
_setup_done = False

_EMPTY: dict[str, Any] = {
    "profile": {},
    "income": [],
    "balance": [],
    "cashflow": [],
    "ratio": {},
}


class CompanyLoad:
    """One ticker's company parts, already running together."""

    def __init__(self, futures: dict[str, Future[Any]]) -> None:
        self._futures = futures
        self.store_lock = threading.Lock()
        self.stored = False
        self._payload: dict[str, Any] | None = None
        self._build_lock = threading.Lock()

    def ready(self) -> bool:
        return all(item.done() for item in self._futures.values())

    def _part(self, name: str) -> Any:
        try:
            value = self._futures[name].result()
        except Exception:
            return _EMPTY[name]
        if value is None:
            return _EMPTY[name]
        return value

    def profile(self) -> Any:
        return self._part("profile")

    def statements(self) -> dict[str, Any]:
        return {
            "income": self._part("income"),
            "balance": self._part("balance"),
            "cashflow": self._part("cashflow"),
        }

    def ratios(self) -> Any:
        return self._part("ratio")

    def payload(self, ticker: str) -> dict[str, Any]:
        with self._build_lock:
            if self._payload is None:
                self._payload = {
                    "ticker": ticker,
                    "profile": self.profile(),
                    "statements": self.statements(),
                    "ratios": self.ratios(),
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            return self._payload


class VnstockClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def configured(self) -> bool:
        return True

    def _ensure_vnstock(self) -> Any:
        global _setup_done
        try:
            from vnstock import Vnstock  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("vnstock unavailable") from exc

        if self._settings.vnstock_api_key:
            with _setup_lock:
                if not _setup_done:
                    try:
                        import vnai

                        vnai.setup_api_key(self._settings.vnstock_api_key)
                    except Exception:
                        pass
                    _setup_done = True
        return Vnstock

    def _stock(self, ticker: str, vnstock_cls: Any) -> Any:
        return vnstock_cls().stock(symbol=ticker, source="VCI")

    def _profile(self, ticker: str, vnstock_cls: Any) -> Any:
        try:
            return self._stock(ticker, vnstock_cls).company.overview().to_dict(orient="records")
        except Exception:
            return {}

    def _income(self, ticker: str, vnstock_cls: Any) -> Any:
        try:
            return self._stock(ticker, vnstock_cls).finance.income_statement(period="year").to_dict(orient="records")
        except Exception:
            return []

    def _balance(self, ticker: str, vnstock_cls: Any) -> Any:
        try:
            return self._stock(ticker, vnstock_cls).finance.balance_sheet(period="year").to_dict(orient="records")
        except Exception:
            return []

    def _cashflow(self, ticker: str, vnstock_cls: Any) -> Any:
        try:
            return self._stock(ticker, vnstock_cls).finance.cash_flow(period="year").to_dict(orient="records")
        except Exception:
            return []

    def _ratio(self, ticker: str, vnstock_cls: Any) -> Any:
        try:
            return self._stock(ticker, vnstock_cls).finance.ratio(period="year").to_dict(orient="records")
        except Exception:
            return {}

    def start(self, ticker: str) -> CompanyLoad:
        vnstock_cls = self._ensure_vnstock()
        futures = {
            "profile": _EXECUTOR.submit(self._profile, ticker, vnstock_cls),
            "income": _EXECUTOR.submit(self._income, ticker, vnstock_cls),
            "balance": _EXECUTOR.submit(self._balance, ticker, vnstock_cls),
            "cashflow": _EXECUTOR.submit(self._cashflow, ticker, vnstock_cls),
            "ratio": _EXECUTOR.submit(self._ratio, ticker, vnstock_cls),
        }
        return CompanyLoad(futures)

    def fetch(self, ticker: str) -> dict[str, Any]:
        return self.start(ticker).payload(ticker)
