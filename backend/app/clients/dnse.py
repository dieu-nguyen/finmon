from __future__ import annotations

import base64
import hashlib
import hmac
import time
import urllib.parse
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

import httpx

from app.config import Settings


def _rfc2822_now() -> str:
    return datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S %z")


def sign_headers(method: str, path: str, api_key: str, api_secret: str) -> dict[str, str]:
    date_value = _rfc2822_now()
    nonce = uuid.uuid4().hex
    date_header = "date"
    signed_headers = f"(request-target) {date_header}"
    sig_string = "\n".join(
        [
            f"(request-target): {method.lower()} {path}",
            f"{date_header}: {date_value}",
            f"nonce: {nonce}",
        ]
    )
    raw_sig = hmac.new(api_secret.encode(), sig_string.encode(), hashlib.sha256).digest()
    sig = urllib.parse.quote(base64.b64encode(raw_sig).decode(), safe="")
    sig_header = (
        f'Signature keyId="{api_key}",algorithm="hmac-sha256",'
        f'headers="{signed_headers}",signature="{sig}",nonce="{nonce}"'
    )
    return {
        "x-api-key": api_key,
        date_header: date_value,
        "X-Signature": sig_header,
        "Accept": "application/json",
        "User-Agent": "finmon",
    }


@dataclass(frozen=True)
class Instrument:
    ticker: str
    name: str
    board: str
    type: str
    listed: bool = True


@dataclass(frozen=True)
class OhlcvBar:
    ticker: str
    date: date
    open: int
    high: int
    low: int
    close: int
    volume: int
    value: int = 0


@dataclass(frozen=True)
class Quote:
    ticker: str
    last: int
    ref: int | None = None
    ceiling: int | None = None
    floor: int | None = None
    time: datetime | None = None
    board: str = ""


def _pick(d: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
        lk = k.lower()
        for ek, ev in d.items():
            if ek.lower() == lk and ev is not None:
                return ev
    return None


def to_dong(value: Any, *, is_index: bool = False) -> int:
    if value is None:
        return 0
    x = float(value)
    if is_index:
        return int(round(x * 100))
    if 0 < abs(x) < 10_000:
        return int(round(x * 1000))
    return int(round(x))


def classify_type(raw: dict[str, Any]) -> str:
    blob = " ".join(str(v) for v in raw.values()).lower()
    if "etf" in blob or "chứng chỉ quỹ" in blob or "ccq" in blob:
        return "etf"
    if "index" in blob or "chỉ số" in blob:
        return "index"
    return "stock"


def board_from(raw: dict[str, Any]) -> str:
    board = _pick(raw, "board", "boardId", "board_id", "market", "marketId", "exchange")
    if board is None:
        return ""
    s = str(board).upper()
    if "HOSE" in s or s in {"HSX", "STO"}:
        return "HOSE"
    if "HNX" in s or s in {"HNX", "STX"}:
        return "HNX"
    if "UPCOM" in s or "UPC" in s:
        return "UPCOM"
    return s[:16]


def parse_instruments(payload: Any) -> list[Instrument]:
    items: list[Any]
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("data") or payload.get("instruments") or payload.get("items") or []
        if isinstance(payload.get("content"), list):
            items = payload["content"]
    else:
        items = []
    out: list[Instrument] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        ticker = _pick(raw, "symbol", "ticker", "code")
        if not ticker:
            continue
        name = str(_pick(raw, "name", "organName", "symbolName", "fullName") or ticker)
        typ = classify_type(raw)
        listed = _pick(raw, "listed", "isListed", "trading")
        out.append(
            Instrument(
                ticker=str(ticker).upper(),
                name=name,
                board=board_from(raw),
                type=typ,
                listed=True if listed is None else bool(listed),
            )
        )
    return out


def _unix_to_date(ts: Any) -> date:
    if ts is None:
        raise ValueError("missing time")
    if isinstance(ts, str) and "-" in ts:
        return date.fromisoformat(ts[:10])
    n = float(ts)
    if n > 1e12:
        n /= 1000.0
    return datetime.fromtimestamp(n, tz=timezone.utc).date()


def parse_ohlc(payload: Any, ticker: str, *, is_index: bool = False) -> list[OhlcvBar]:
    if isinstance(payload, dict) and "data" in payload and not _looks_tv(payload):
        payload = payload["data"]
    bars: list[OhlcvBar] = []
    if _looks_tv(payload):
        t = payload.get("t") or payload.get("time") or []
        o = payload.get("o") or payload.get("open") or []
        h = payload.get("h") or payload.get("high") or []
        l = payload.get("l") or payload.get("low") or []
        c = payload.get("c") or payload.get("close") or []
        v = payload.get("v") or payload.get("volume") or []
        va = payload.get("value") or [0] * len(t)
        for i, ts in enumerate(t):
            bars.append(
                OhlcvBar(
                    ticker=ticker,
                    date=_unix_to_date(ts),
                    open=to_dong(o[i], is_index=is_index),
                    high=to_dong(h[i], is_index=is_index),
                    low=to_dong(l[i], is_index=is_index),
                    close=to_dong(c[i], is_index=is_index),
                    volume=int(float(v[i] if i < len(v) else 0) or 0),
                    value=int(float(va[i] if i < len(va) else 0) or 0),
                )
            )
        return bars
    rows = payload if isinstance(payload, list) else []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        d = _pick(raw, "date", "time", "t", "tradingDate")
        bars.append(
            OhlcvBar(
                ticker=ticker,
                date=_unix_to_date(d),
                open=to_dong(_pick(raw, "open", "o"), is_index=is_index),
                high=to_dong(_pick(raw, "high", "h"), is_index=is_index),
                low=to_dong(_pick(raw, "low", "l"), is_index=is_index),
                close=to_dong(_pick(raw, "close", "c"), is_index=is_index),
                volume=int(float(_pick(raw, "volume", "v") or 0)),
                value=int(float(_pick(raw, "value") or 0)),
            )
        )
    return bars


def _looks_tv(payload: Any) -> bool:
    return isinstance(payload, dict) and (
        "t" in payload or ("open" in payload and isinstance(payload.get("open"), list))
    )


def parse_quote(payload: Any, ticker: str, *, is_index: bool = False) -> Quote:
    raw = payload
    if isinstance(payload, dict):
        for key in ("data", "quotes", "quote"):
            inner = payload.get(key)
            if isinstance(inner, list) and inner:
                raw = inner[0]
                break
            if isinstance(inner, dict):
                raw = inner
                break
        if isinstance(payload.get("trades"), list) and payload["trades"]:
            raw = payload["trades"][0]
    if isinstance(raw, list) and raw:
        raw = raw[0]
    if not isinstance(raw, dict):
        raw = {}
    last = _pick(
        raw,
        "last",
        "lastPrice",
        "matchPrice",
        "price",
        "close",
        "closePrice",
    )
    return Quote(
        ticker=ticker,
        last=to_dong(last or 0, is_index=is_index),
        ref=to_dong(_pick(raw, "ref", "reference", "refPrice", "basicPrice"), is_index=is_index)
        if _pick(raw, "ref", "reference", "refPrice", "basicPrice") is not None
        else None,
        ceiling=to_dong(_pick(raw, "ceiling", "ceilingPrice"), is_index=is_index)
        if _pick(raw, "ceiling", "ceilingPrice") is not None
        else None,
        floor=to_dong(_pick(raw, "floor", "floorPrice"), is_index=is_index)
        if _pick(raw, "floor", "floorPrice") is not None
        else None,
        board=board_from(raw),
    )


class DnseClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        self._settings = settings
        self._client = httpx.Client(
            base_url=settings.dnse_base_url.rstrip("/"),
            timeout=30.0,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def configured(self) -> bool:
        return bool(self._settings.dnse_api_key and self._settings.dnse_api_secret)

    def _request(self, method: str, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        headers = sign_headers(method, path, self._settings.dnse_api_key, self._settings.dnse_api_secret)
        for attempt in range(4):
            resp = self._client.request(method, path, headers=headers, params=params)
            if resp.status_code != 429:
                resp.raise_for_status()
                return resp
            reset = resp.headers.get("X-RateLimit-Reset")
            sleep_s = 1.0
            if reset:
                try:
                    sleep_s = max(1.0, float(reset) - time.time())
                except ValueError:
                    sleep_s = float(resp.headers.get("Retry-After") or 1)
            if attempt == 3:
                resp.raise_for_status()
            time.sleep(min(sleep_s, 30))
            headers = sign_headers(method, path, self._settings.dnse_api_key, self._settings.dnse_api_secret)
        raise RuntimeError("unreachable")

    def list_instruments(self) -> list[Instrument]:
        items: list[Instrument] = []
        page = 1
        while True:
            resp = self._request("GET", "/instruments", params={"limit": 500, "page": page})
            batch = parse_instruments(resp.json())
            if not batch:
                break
            items.extend(batch)
            if len(batch) < 500:
                break
            page += 1
            if page > 50:
                break
        return items

    def ohlc(
        self,
        symbol: str,
        from_ts: int,
        to_ts: int,
        *,
        market_type: str = "stock",
        resolution: str = "1D",
    ) -> list[OhlcvBar]:
        resp = self._request(
            "GET",
            "/price/ohlc",
            params={
                "symbol": symbol,
                "type": market_type,
                "resolution": resolution,
                "from": from_ts,
                "to": to_ts,
            },
        )
        return parse_ohlc(resp.json(), symbol, is_index=market_type == "index")

    def latest_quote(self, symbol: str, board_id: str | None = None) -> Quote:
        params = {"boardId": board_id} if board_id else None
        resp = self._request("GET", f"/price/{symbol}/quotes/latest", params=params)
        quote = parse_quote(resp.json(), symbol)
        try:
            sec = self._request(
                "GET",
                f"/price/{symbol}/secdef",
                params=params,
            )
            extra = parse_quote(sec.json(), symbol)
            quote = Quote(
                ticker=symbol,
                last=quote.last or extra.last,
                ref=extra.ref if extra.ref is not None else quote.ref,
                ceiling=extra.ceiling if extra.ceiling is not None else quote.ceiling,
                floor=extra.floor if extra.floor is not None else quote.floor,
                time=quote.time,
                board=quote.board or extra.board or (board_id or ""),
            )
        except httpx.HTTPError:
            pass
        return quote
