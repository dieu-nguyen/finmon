from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from app.patterns.registry import register
from app.patterns.windows import Window


@dataclass(frozen=True)
class Hit:
    ticker: str
    score: float
    window_start: date
    window_end: date


@dataclass(frozen=True)
class MethodResult:
    hits: list[Hit]
    compared_count: int
    reference_compared: bool


def _minmax(closes: list[float]) -> list[float] | None:
    if not closes:
        return None
    lo = min(closes)
    hi = max(closes)
    if hi == lo:
        return None
    span = hi - lo
    return [(value - lo) / span for value in closes]


def pearson(left: list[float], right: list[float]) -> float | None:
    n = len(left)
    if n == 0 or n != len(right):
        return None
    mean_left = sum(left) / n
    mean_right = sum(right) / n
    num = 0.0
    var_left = 0.0
    var_right = 0.0
    for a, b in zip(left, right):
        da = a - mean_left
        db = b - mean_right
        num += da * db
        var_left += da * da
        var_right += db * db
    if var_left == 0 or var_right == 0:
        return None
    return num / math.sqrt(var_left * var_right)


@register("lookalike")
def score_lookalike(spec: dict, windows: dict[str, Window]) -> MethodResult:
    reference = str(spec.get("reference") or "").upper()
    min_score = float(spec.get("min_score", 0.85))
    top_k = int(spec.get("top_k", 20))
    ref = windows.get(reference)
    ref_norm = _minmax(ref.closes) if ref is not None else None
    if ref is None or ref_norm is None:
        return MethodResult(hits=[], compared_count=0, reference_compared=False)

    compared = 0
    ranked: list[tuple[float, str, Window]] = []
    for ticker in sorted(windows):
        if ticker == reference:
            continue
        window = windows[ticker]
        norm = _minmax(window.closes)
        if norm is None or len(norm) != len(ref_norm):
            continue
        compared += 1
        score = pearson(ref_norm, norm)
        if score is None or score < min_score:
            continue
        ranked.append((score, ticker, window))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    hits = [
        Hit(ticker=ticker, score=score, window_start=window.window_start, window_end=window.window_end)
        for score, ticker, window in ranked[: max(top_k, 0)]
    ]
    return MethodResult(hits=hits, compared_count=compared, reference_compared=True)
