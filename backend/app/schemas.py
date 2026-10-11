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
    kind: Literal["lookalike", "named"] = "lookalike"
    reference: str = ""
    min_score: float = 0.85
    top_k: int = 20
    pattern: str = ""
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
    state: str | None = None
    swings: dict[str, Any] | None = None
    pattern: str | None = None
    run_id: int | None = None


class HitsOut(BaseModel):
    pattern_id: int
    name: str
    kind: str = "lookalike"
    pattern: str | None = None
    reference: str = ""
    as_of: date | None = None
    reference_compared: bool | None = None
    hits: list[HitOut] = Field(default_factory=list)


class NamedMatchOut(BaseModel):
    pattern: str
    state: str
    score: float
    window_start: date
    window_end: date
    swings: dict[str, Any]
    run_id: int | None = None


class NamedCheckOut(BaseModel):
    ticker: str
    as_of: date | None = None
    patterns: list[str] = Field(default_factory=list)
    matches: list[NamedMatchOut] = Field(default_factory=list)


class CatalogItem(BaseModel):
    id: str
    label: str


class NamedTickerIn(BaseModel):
    patterns: list[str] = Field(default_factory=list)


class NamedMarketIn(BaseModel):
    patterns: list[str] = Field(default_factory=list)
    scope: Literal["all", "subset"] = "all"
    tickers: list[str] = Field(default_factory=list)


class NamedMarketOut(BaseModel):
    as_of: date | None = None
    patterns: list[str] = Field(default_factory=list)
    scope: Literal["all", "subset"] = "all"
    tickers: list[str] = Field(default_factory=list)
    hits: list[HitOut] = Field(default_factory=list)
