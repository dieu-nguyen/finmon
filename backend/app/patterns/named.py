"""Named patterns on one ticker's own swings.

The caller passes the last LOOKBACK sessions. Freshness is the last
FRESH_SESSIONS bars of that window. This module does not call Pearson.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.patterns.lookalike import Hit, MethodResult
from app.patterns.registry import register
from app.patterns.windows import Window

LOOKBACK = 90
FRESH_SESSIONS = 10
SWING_BARS = 5
PAIR_TOLERANCE = 0.03
HEAD_PROMINENCE = 0.03
# Head component reaches 1 when the head clears the shoulder by twice the minimum.
HEAD_SCORE_SPAN = HEAD_PROMINENCE
SCORE_FLOOR = 0.70
HIT_CAP = 20

PATTERNS = (
    "double_bottom",
    "double_top",
    "head_and_shoulders",
    "inverse_head_and_shoulders",
)

PATTERN_LABELS = {
    "double_bottom": "Double bottom",
    "double_top": "Double top",
    "head_and_shoulders": "Head and shoulders",
    "inverse_head_and_shoulders": "Inverse head and shoulders",
}


@dataclass(frozen=True)
class Swing:
    index: int
    kind: str
    price: float
    when: date


@dataclass(frozen=True)
class NamedHit:
    pattern: str
    score: float
    state: str
    window_start: date
    window_end: date
    swings: dict
    last_index: int


def swing_indexes(values: list[float], *, kind: str, side: int = SWING_BARS) -> list[int]:
    """Strict extreme versus `side` bars on the left.

    A high is strictly the highest high. A low is strictly the lowest low.
    Near the right edge the right side uses only the bars that exist, including
    none. A swing still needs a full left side, so the first `side` bars are not swings.
    """
    higher = kind == "high"
    n = len(values)
    found: list[int] = []
    for i in range(side, n):
        right = min(side, n - 1 - i)
        price = values[i]
        neighbors = list(range(i - side, i)) + list(range(i + 1, i + 1 + right))
        if higher and any(values[j] >= price for j in neighbors):
            continue
        if not higher and any(values[j] <= price for j in neighbors):
            continue
        found.append(i)
    return found


def find_swings(window: Window) -> list[Swing] | None:
    highs = window.highs
    lows = window.lows
    dates = window.dates
    n = len(window.closes)
    if n == 0 or len(highs) != n or len(lows) != n or len(dates) != n:
        return None
    points = [Swing(i, "high", highs[i], dates[i]) for i in swing_indexes(highs, kind="high")]
    points.extend(Swing(i, "low", lows[i], dates[i]) for i in swing_indexes(lows, kind="low"))
    points.sort(key=lambda swing: (swing.index, 0 if swing.kind == "high" else 1))
    return points


def pair_gap(left: float, right: float) -> float | None:
    higher = left if left > right else right
    if higher <= 0:
        return None
    return abs(left - right) / higher


def pair_evenness(left: float, right: float) -> float | None:
    gap = pair_gap(left, right)
    if gap is None or gap > PAIR_TOLERANCE:
        return None
    return 1.0 - gap / PAIR_TOLERANCE


def head_clarity(prominence: float) -> float | None:
    if prominence < HEAD_PROMINENCE:
        return None
    return min(1.0, (prominence - HEAD_PROMINENCE) / HEAD_SCORE_SPAN)


def _fresh_from(n: int) -> int:
    return max(0, n - FRESH_SESSIONS)


def _outcome(n: int, last_index: int, break_index: int | None) -> str | None:
    fresh = _fresh_from(n)
    if break_index is not None:
        if break_index >= fresh:
            return "confirmed"
        return None
    if last_index >= fresh:
        return "forming"
    return None


def _line(i: int, i1: int, p1: float, i2: int, p2: float) -> float:
    if i2 == i1:
        return p2
    return p1 + (p2 - p1) * ((i - i1) / (i2 - i1))


def _cross_level(closes: list[float], start: int, level: float, *, above: bool) -> int | None:
    for i in range(start, len(closes)):
        if above and closes[i] > level:
            return i
        if not above and closes[i] < level:
            return i
    return None


def _cross_line(closes: list[float], start: int, i1: int, p1: float, i2: int, p2: float, *, above: bool) -> int | None:
    for i in range(start, len(closes)):
        level = _line(i, i1, p1, i2, p2)
        if above and closes[i] > level:
            return i
        if not above and closes[i] < level:
            return i
    return None


def _iso(day: date) -> str:
    return day.isoformat()


def _payload(
    pattern: str,
    roles: list[str],
    group: tuple[Swing, ...],
    neck_from: Swing,
    neck_to: date,
    neck_price: float,
    confirmed_on: date | None = None,
) -> dict:
    payload = {
        "pattern": pattern,
        "points": [{"role": role, "date": _iso(swing.when), "price": swing.price} for role, swing in zip(roles, group)],
        "neckline": [
            {"date": _iso(neck_from.when), "price": neck_from.price},
            {"date": _iso(neck_to), "price": neck_price},
        ],
    }
    if confirmed_on is not None:
        payload["confirmed_on"] = _iso(confirmed_on)
    return payload


def _hit(
    pattern: str,
    score: float,
    state: str,
    window: Window,
    roles: list[str],
    group: tuple[Swing, ...],
    neck_from: Swing,
    neck_price: float,
    last_index: int,
    confirmed_on: date | None = None,
) -> NamedHit:
    return NamedHit(
        pattern=pattern,
        score=score,
        state=state,
        window_start=group[0].when,
        window_end=window.window_end,
        swings=_payload(
            pattern,
            roles,
            group,
            neck_from,
            window.window_end,
            neck_price,
            confirmed_on if state == "confirmed" else None,
        ),
        last_index=last_index,
    )


def _sequences(swings: list[Swing], kinds: tuple[str, ...]):
    width = len(kinds)
    for i in range(len(swings) - width + 1):
        group = tuple(swings[i : i + width])
        if tuple(item.kind for item in group) != kinds:
            continue
        if any(group[pos].index >= group[pos + 1].index for pos in range(width - 1)):
            continue
        yield group


def _best(candidates: list[NamedHit]) -> NamedHit | None:
    if not candidates:
        return None
    candidates.sort(key=lambda hit: (-hit.score, -hit.last_index))
    best = candidates[0]
    if best.score < SCORE_FLOOR:
        return None
    return best


def _double_bottom(window: Window, swings: list[Swing]) -> list[NamedHit]:
    closes = window.closes
    n = len(closes)
    found: list[NamedHit] = []
    for left, peak, right in _sequences(swings, ("low", "high", "low")):
        if peak.price <= left.price or peak.price <= right.price:
            continue
        even = pair_evenness(left.price, right.price)
        if even is None:
            continue
        break_at = _cross_level(closes, right.index, peak.price, above=True)
        state = _outcome(n, right.index, break_at)
        if state is None:
            continue
        confirmed_on = window.dates[break_at] if state == "confirmed" and break_at is not None else None
        found.append(
            _hit(
                "double_bottom",
                even,
                state,
                window,
                ["low", "peak", "low"],
                (left, peak, right),
                peak,
                peak.price,
                right.index,
                confirmed_on,
            )
        )
    return found


def _double_top(window: Window, swings: list[Swing]) -> list[NamedHit]:
    closes = window.closes
    n = len(closes)
    found: list[NamedHit] = []
    for left, trough, right in _sequences(swings, ("high", "low", "high")):
        if trough.price >= left.price or trough.price >= right.price:
            continue
        even = pair_evenness(left.price, right.price)
        if even is None:
            continue
        break_at = _cross_level(closes, right.index, trough.price, above=False)
        state = _outcome(n, right.index, break_at)
        if state is None:
            continue
        confirmed_on = window.dates[break_at] if state == "confirmed" and break_at is not None else None
        found.append(
            _hit(
                "double_top",
                even,
                state,
                window,
                ["high", "trough", "high"],
                (left, trough, right),
                trough,
                trough.price,
                right.index,
                confirmed_on,
            )
        )
    return found


def _shoulders(window: Window, swings: list[Swing], *, inverse: bool) -> list[NamedHit]:
    closes = window.closes
    n = len(closes)
    pattern = "inverse_head_and_shoulders" if inverse else "head_and_shoulders"
    kinds = ("low", "high", "low", "high", "low") if inverse else ("high", "low", "high", "low", "high")
    roles = ["shoulder", "peak", "head", "peak", "shoulder"] if inverse else ["shoulder", "trough", "head", "trough", "shoulder"]
    found: list[NamedHit] = []
    for left, mid1, head, mid2, right in _sequences(swings, kinds):
        even = pair_evenness(left.price, right.price)
        if even is None:
            continue
        if inverse:
            base = left.price if left.price < right.price else right.price
            if base <= 0 or head.price >= base:
                continue
            prominence = (base - head.price) / base
            peaks_ok = (
                mid1.price > left.price
                and mid1.price > right.price
                and mid1.price > head.price
                and mid2.price > left.price
                and mid2.price > right.price
                and mid2.price > head.price
            )
            above = True
        else:
            base = left.price if left.price > right.price else right.price
            if base <= 0 or head.price <= base:
                continue
            prominence = (head.price - base) / base
            peaks_ok = (
                mid1.price < left.price
                and mid1.price < right.price
                and mid1.price < head.price
                and mid2.price < left.price
                and mid2.price < right.price
                and mid2.price < head.price
            )
            above = False
        if not peaks_ok:
            continue
        clarity = head_clarity(prominence)
        if clarity is None:
            continue
        break_at = _cross_line(closes, right.index, mid1.index, mid1.price, mid2.index, mid2.price, above=above)
        state = _outcome(n, right.index, break_at)
        if state is None:
            continue
        neck_price = _line(n - 1, mid1.index, mid1.price, mid2.index, mid2.price)
        score = (even + clarity) / 2
        confirmed_on = window.dates[break_at] if state == "confirmed" and break_at is not None else None
        found.append(
            _hit(pattern, score, state, window, roles, (left, mid1, head, mid2, right), mid1, neck_price, right.index, confirmed_on)
        )
    return found


def detect(window: Window, pattern: str) -> NamedHit | None:
    if pattern not in PATTERNS:
        raise ValueError(pattern)
    swings = find_swings(window)
    if not swings:
        return None
    if pattern == "double_bottom":
        candidates = _double_bottom(window, swings)
    elif pattern == "double_top":
        candidates = _double_top(window, swings)
    elif pattern == "head_and_shoulders":
        candidates = _shoulders(window, swings, inverse=False)
    else:
        candidates = _shoulders(window, swings, inverse=True)
    return _best(candidates)


def match_all(window: Window) -> list[NamedHit]:
    found: list[NamedHit] = []
    for pattern in PATTERNS:
        hit = detect(window, pattern)
        if hit is not None:
            found.append(hit)
    return found


def _as_row(ticker: str, hit: NamedHit) -> Hit:
    return Hit(
        ticker=ticker,
        score=hit.score,
        window_start=hit.window_start,
        window_end=hit.window_end,
        state=hit.state,
        swings=hit.swings,
        pattern=hit.pattern,
    )


@register("named")
def score_named(spec: dict, windows: dict[str, Window]) -> MethodResult:
    pattern = str(spec.get("pattern") or "")
    if pattern not in PATTERNS:
        raise ValueError(pattern)
    ranked: list[tuple[float, str, NamedHit]] = []
    for ticker in sorted(windows):
        hit = detect(windows[ticker], pattern)
        if hit is None:
            continue
        ranked.append((hit.score, ticker, hit))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    hits = [_as_row(ticker, hit) for _score, ticker, hit in ranked[:HIT_CAP]]
    return MethodResult(hits=hits, compared_count=len(windows), reference_compared=True)
