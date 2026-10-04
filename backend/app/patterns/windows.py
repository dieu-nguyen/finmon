from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class Window:
    closes: list[float]
    window_start: date
    window_end: date
    highs: list[float] = field(default_factory=list)
    lows: list[float] = field(default_factory=list)
    dates: list[date] = field(default_factory=list)
