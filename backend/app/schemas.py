from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    as_of: datetime | None = None
    watermarks: list[dict[str, Any]] = Field(default_factory=list)
    dnse_configured: bool
    telegram_configured: bool
    vnstock_configured: bool


class SymbolRow(BaseModel):
    ticker: str
    name: str
    board: str
    type: str
    listed: bool
    last: int | None = None
    change: float | None = None
    volume: int | None = None
    watchlist: bool = False


class SymbolPage(BaseModel):
    items: list[SymbolRow]
    total: int
    limit: int
    offset: int


class BarOut(BaseModel):
    date: date
    open: int
    high: int
    low: int
    close: int
    volume: int
    value: int = 0


class QuoteOut(BaseModel):
    ticker: str
    last: int
    ref: int | None = None
    ceiling: int | None = None
    floor: int | None = None
    time: datetime | None = None


class DrawingIn(BaseModel):
    tool: str
    points: list[dict[str, Any]]
    style: dict[str, Any] = Field(default_factory=dict)


class ChartNoteIn(BaseModel):
    date: date
    price: int
    text: str = ""


class PageNoteIn(BaseModel):
    body: str


class AlertIn(BaseModel):
    ticker: str
    op: Literal["gte", "lte"]
    price: int
    mode: Literal["once", "repeat"] = "once"
    enabled: bool = True


class AlertOut(BaseModel):
    id: int
    ticker: str
    op: str
    price: int
    mode: str
    enabled: bool
    last_fired_at: datetime | None = None


class PatternIn(BaseModel):
    name: str
    reference: str
    min_score: float = 0.85
    top_k: int = 20
    enabled: bool = True


class PatternOut(BaseModel):
    id: int
    name: str
    kind: str
    schedule: str
    enabled: bool
    spec: dict[str, Any]


class HitOut(BaseModel):
    ticker: str
    name: str
    score: float
    window_start: date
    window_end: date


class HitsOut(BaseModel):
    pattern_id: int
    name: str
    reference: str
    as_of: date | None = None
    reference_compared: bool | None = None
    hits: list[HitOut] = Field(default_factory=list)
