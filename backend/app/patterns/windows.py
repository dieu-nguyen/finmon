from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Window:
    closes: list[float]
    window_start: date
    window_end: date
