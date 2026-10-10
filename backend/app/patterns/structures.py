"""Swing and boundary rules for the named patterns after the first four.

Each detector returns candidates. `named.detect` keeps the best one at or
above the score floor. A boundary is two swings and the line through them.
"""

from __future__ import annotations

from app.patterns.named import (
    CONVERGE_MAX,
    CUP_DEPTH_MAX,
    CUP_DEPTH_MIN,
    CUP_MIN_SPAN,
    DIVERGE_MIN,
    FLAG_DRIFT_MIN,
    FLAG_RETRACE_MAX,
    HANDLE_DEPTH_MAX,
    MIN_MOVE,
    PAIR_TOLERANCE,
    PARALLEL_HI,
    PARALLEL_LO,
    POLE_MAX_BARS,
    POLE_MIN,
    RANGE_MIN,
    ROUND_DEPTH_MIN,
    ROUND_NEAR,
    ROUND_NEAR_BARS,
    SWING_BARS,
    NamedHit,
    Swing,
    _cross_level,
    _cross_line,
    _line,
    _outcome,
    pair_evenness,
    pair_gap,
)
from app.patterns.windows import Window


def _iso(day) -> str:
    return day.isoformat()


def _strength(move: float, minimum: float) -> float | None:
    if move < minimum:
        return None
    return min(1.0, 0.5 + 0.5 * ((move - minimum) / minimum))


def _rise(earlier: Swing, later: Swing) -> float:
    if earlier.price <= 0:
        return 0.0
    return (later.price - earlier.price) / earlier.price


def _fall(earlier: Swing, later: Swing) -> float:
    if earlier.price <= 0:
        return 0.0
    return (earlier.price - later.price) / earlier.price


def _alternating(swings: list[Swing]) -> list[Swing]:
    out: list[Swing] = []
    for swing in swings:
        if not out or out[-1].kind != swing.kind:
            out.append(swing)
            continue
        prev = out[-1]
        if swing.kind == "high" and swing.price > prev.price:
            out[-1] = swing
        elif swing.kind == "low" and swing.price < prev.price:
            out[-1] = swing
    return out


def _gap_ratio(h1: Swing, h2: Swing, l1: Swing, l2: Swing) -> float | None:
    start = h1.index if h1.index < l1.index else l1.index
    end = h2.index if h2.index > l2.index else l2.index
    if end <= start:
        return None
    upper_start = _line(start, h1.index, h1.price, h2.index, h2.price)
    lower_start = _line(start, l1.index, l1.price, l2.index, l2.price)
    upper_end = _line(end, h1.index, h1.price, h2.index, h2.price)
    lower_end = _line(end, l1.index, l1.price, l2.index, l2.price)
    start_gap = upper_start - lower_start
    end_gap = upper_end - lower_end
    if start_gap <= 0 or end_gap <= 0:
        return None
    return end_gap / start_gap


def _neck(window: Window, a: Swing, b: Swing) -> list[tuple]:
    end = len(window.closes) - 1
    price = _line(end, a.index, a.price, b.index, b.price)
    return [(a.when, a.price), (window.window_end, price)]


def _level(window: Window, swing: Swing, price: float) -> list[tuple]:
    return [(swing.when, price), (window.window_end, price)]


def _hit(
    pattern: str,
    score: float,
    state: str,
    window: Window,
    roles: list[str],
    group: tuple[Swing, ...],
    neck: list[tuple],
    last_index: int,
) -> NamedHit:
    return NamedHit(
        pattern=pattern,
        score=score,
        state=state,
        window_start=group[0].when,
        window_end=window.window_end,
        swings={
            "pattern": pattern,
            "points": [{"role": role, "date": _iso(swing.when), "price": swing.price} for role, swing in zip(roles, group)],
            "neckline": [{"date": _iso(day), "price": price} for day, price in neck],
        },
        last_index=last_index,
    )


def _outside(closes: list[float], start: int, h1: Swing, h2: Swing, l1: Swing, l2: Swing) -> int | None:
    for i in range(start, len(closes)):
        upper = _line(i, h1.index, h1.price, h2.index, h2.price)
        lower = _line(i, l1.index, l1.price, l2.index, l2.price)
        if closes[i] > upper or closes[i] < lower:
            return i
    return None


def _four(window: Window, swings: list[Swing], pattern: str, rule) -> list[NamedHit]:
    alt = _alternating(swings)
    found: list[NamedHit] = []
    for i in range(len(alt) - 3):
        group = tuple(alt[i : i + 4])
        highs = [swing for swing in group if swing.kind == "high"]
        lows = [swing for swing in group if swing.kind == "low"]
        if len(highs) != 2 or len(lows) != 2:
            continue
        hit = rule(window, pattern, group, highs[0], highs[1], lows[0], lows[1])
        if hit is not None:
            found.append(hit)
    return found


def _bounded(
    window: Window,
    pattern: str,
    group: tuple[Swing, ...],
    h1: Swing,
    h2: Swing,
    l1: Swing,
    l2: Swing,
    *,
    parts: list[float | None],
    ratio_ok,
    break_at: int | None,
    neck: list[tuple],
) -> NamedHit | None:
    if any(part is None for part in parts):
        return None
    ratio = _gap_ratio(h1, h2, l1, l2)
    if ratio is None or not ratio_ok(ratio):
        return None
    last = group[-1]
    state = _outcome(len(window.closes), last.index, break_at)
    if state is None:
        return None
    score = sum(parts) / len(parts)
    roles = [swing.kind for swing in group]
    return _hit(pattern, score, state, window, roles, group, neck, last.index)


def _ascending(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[pair_evenness(h1.price, h2.price), _strength(_rise(l1, l2), MIN_MOVE)],
        ratio_ok=lambda ratio: ratio <= CONVERGE_MAX,
        break_at=_cross_line(window.closes, last.index + 1, h1.index, h1.price, h2.index, h2.price, above=True),
        neck=_neck(window, h1, h2) + _neck(window, l1, l2),
    )


def _descending(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[pair_evenness(l1.price, l2.price), _strength(_fall(h1, h2), MIN_MOVE)],
        ratio_ok=lambda ratio: ratio <= CONVERGE_MAX,
        break_at=_cross_line(window.closes, last.index + 1, l1.index, l1.price, l2.index, l2.price, above=False),
        neck=_neck(window, l1, l2) + _neck(window, h1, h2),
    )


def _symmetrical(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[_strength(_fall(h1, h2), MIN_MOVE), _strength(_rise(l1, l2), MIN_MOVE)],
        ratio_ok=lambda ratio: ratio <= CONVERGE_MAX,
        break_at=_outside(window.closes, last.index + 1, h1, h2, l1, l2),
        neck=_neck(window, h1, h2) + _neck(window, l1, l2),
    )


def _rising_wedge(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[_strength(_rise(h1, h2), MIN_MOVE), _strength(_rise(l1, l2), MIN_MOVE)],
        ratio_ok=lambda ratio: ratio <= CONVERGE_MAX,
        break_at=_cross_line(window.closes, last.index + 1, l1.index, l1.price, l2.index, l2.price, above=False),
        neck=_neck(window, l1, l2) + _neck(window, h1, h2),
    )


def _falling_wedge(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[_strength(_fall(h1, h2), MIN_MOVE), _strength(_fall(l1, l2), MIN_MOVE)],
        ratio_ok=lambda ratio: ratio <= CONVERGE_MAX,
        break_at=_cross_line(window.closes, last.index + 1, h1.index, h1.price, h2.index, h2.price, above=True),
        neck=_neck(window, h1, h2) + _neck(window, l1, l2),
    )


def _rectangle(window, pattern, group, h1, h2, l1, l2):
    upper = h1.price if h1.price < h2.price else h2.price
    lower = l1.price if l1.price > l2.price else l2.price
    if upper <= 0 or (upper - lower) / upper < RANGE_MIN:
        return None
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[pair_evenness(h1.price, h2.price), pair_evenness(l1.price, l2.price)],
        ratio_ok=lambda ratio: PARALLEL_LO <= ratio <= PARALLEL_HI,
        break_at=_outside(window.closes, last.index + 1, h1, h2, l1, l2),
        neck=_neck(window, h1, h2) + _neck(window, l1, l2),
    )


def _broadening(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[_strength(_rise(h1, h2), MIN_MOVE), _strength(_fall(l1, l2), MIN_MOVE)],
        ratio_ok=lambda ratio: ratio >= DIVERGE_MIN,
        break_at=_outside(window.closes, last.index + 1, h1, h2, l1, l2),
        neck=_neck(window, h1, h2) + _neck(window, l1, l2),
    )


def _ascending_channel(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[_strength(_rise(h1, h2), MIN_MOVE), _strength(_rise(l1, l2), MIN_MOVE)],
        ratio_ok=lambda ratio: PARALLEL_LO <= ratio <= PARALLEL_HI,
        break_at=_cross_line(window.closes, last.index + 1, h1.index, h1.price, h2.index, h2.price, above=True),
        neck=_neck(window, h1, h2) + _neck(window, l1, l2),
    )


def _descending_channel(window, pattern, group, h1, h2, l1, l2):
    last = group[-1]
    return _bounded(
        window,
        pattern,
        group,
        h1,
        h2,
        l1,
        l2,
        parts=[_strength(_fall(h1, h2), MIN_MOVE), _strength(_fall(l1, l2), MIN_MOVE)],
        ratio_ok=lambda ratio: PARALLEL_LO <= ratio <= PARALLEL_HI,
        break_at=_cross_line(window.closes, last.index + 1, l1.index, l1.price, l2.index, l2.price, above=False),
        neck=_neck(window, l1, l2) + _neck(window, h1, h2),
    )


_FOURS = {
    "ascending_triangle": _ascending,
    "descending_triangle": _descending,
    "symmetrical_triangle": _symmetrical,
    "rising_wedge": _rising_wedge,
    "falling_wedge": _falling_wedge,
    "rectangle": _rectangle,
    "broadening": _broadening,
    "ascending_channel": _ascending_channel,
    "descending_channel": _descending_channel,
}


def _impulse(window: Window, swings: list[Swing], *, bull: bool, pennant: bool) -> list[NamedHit]:
    kinds = ("low", "high", "low", "high", "low") if bull else ("high", "low", "high", "low", "high")
    pattern = ("bull_pennant" if pennant else "bull_flag") if bull else ("bear_pennant" if pennant else "bear_flag")
    roles = ["base", "pole", "low", "high", "low"] if bull else ["pole", "base", "high", "low", "high"]
    found: list[NamedHit] = []
    closes = window.closes
    for group in _sequences(_alternating(swings), kinds):
        if bull:
            base, top, low1, high2, low2 = group
            pole_px = top.price - base.price
            pole = pole_px / base.price if base.price > 0 else 0.0
            span = top.index - base.index
            upper_a, upper_b = top, high2
            lower_a, lower_b = low1, low2
            drift_upper = _fall(top, high2)
            drift_lower = _fall(low1, low2)
            retrace = (top.price - min(low1.price, low2.price)) / pole_px if pole_px > 0 else 1.0
            held = min(low1.price, low2.price) > base.price
        else:
            top, base, high1, low2, high2 = group
            pole_px = top.price - base.price
            pole = pole_px / top.price if top.price > 0 else 0.0
            span = base.index - top.index
            upper_a, upper_b = high1, high2
            lower_a, lower_b = base, low2
            drift_upper = _rise(high1, high2) if not pennant else _fall(high1, high2)
            drift_lower = _rise(base, low2)
            retrace = (max(high1.price, high2.price) - base.price) / pole_px if pole_px > 0 else 1.0
            held = max(high1.price, high2.price) < top.price
        if pole < POLE_MIN or span < SWING_BARS + 1 or span > POLE_MAX_BARS or not held:
            continue
        if retrace <= 0 or retrace > FLAG_RETRACE_MAX:
            continue
        if pennant:
            if bull:
                side_up = _strength(_fall(top, high2), MIN_MOVE)
                side_down = _strength(_rise(low1, low2), MIN_MOVE)
            else:
                side_up = _strength(_fall(high1, high2), MIN_MOVE)
                side_down = _strength(_rise(base, low2), MIN_MOVE)
            parts = [_strength(pole, POLE_MIN), side_up, side_down]
            ratio_ok = lambda ratio: ratio <= CONVERGE_MAX
        else:
            if min(drift_upper, drift_lower) < FLAG_DRIFT_MIN:
                continue
            parts = [_strength(pole, POLE_MIN), _strength(min(drift_upper, drift_lower), FLAG_DRIFT_MIN)]
            ratio_ok = lambda ratio: PARALLEL_LO <= ratio <= PARALLEL_HI
        ratio = _gap_ratio(upper_a, upper_b, lower_a, lower_b)
        if ratio is None or not ratio_ok(ratio) or any(part is None for part in parts):
            continue
        last = group[-1]
        if bull:
            break_at = _cross_line(closes, last.index + 1, upper_a.index, upper_a.price, upper_b.index, upper_b.price, above=True)
            neck = _neck(window, upper_a, upper_b) + _neck(window, lower_a, lower_b)
        else:
            break_at = _cross_line(closes, last.index + 1, lower_a.index, lower_a.price, lower_b.index, lower_b.price, above=False)
            neck = _neck(window, lower_a, lower_b) + _neck(window, upper_a, upper_b)
        state = _outcome(len(closes), last.index, break_at)
        if state is None:
            continue
        found.append(_hit(pattern, sum(parts) / len(parts), state, window, roles, group, neck, last.index))
    return found


def _sequences(swings: list[Swing], kinds: tuple[str, ...]):
    width = len(kinds)
    for i in range(len(swings) - width + 1):
        group = tuple(swings[i : i + width])
        if tuple(item.kind for item in group) != kinds:
            continue
        if any(group[pos].index >= group[pos + 1].index for pos in range(width - 1)):
            continue
        yield group


def _triple(window: Window, swings: list[Swing], *, top: bool) -> list[NamedHit]:
    kinds = ("high", "low", "high", "low", "high") if top else ("low", "high", "low", "high", "low")
    pattern = "triple_top" if top else "triple_bottom"
    roles = ["high", "trough", "high", "trough", "high"] if top else ["low", "peak", "low", "peak", "low"]
    found: list[NamedHit] = []
    for group in _sequences(_alternating(swings), kinds):
        peaks = (group[0], group[2], group[4])
        mids = (group[1], group[3])
        prices = [swing.price for swing in peaks]
        high = max(prices)
        low = min(prices)
        even = pair_evenness(high, low)
        if even is None or high <= 0:
            continue
        if top:
            depth = min((low - mid.price) / low for mid in mids)
            line_a, line_b = mids
            above = False
        else:
            depth = min((mid.price - high) / mid.price for mid in mids)
            line_a, line_b = mids
            above = True
        if depth < MIN_MOVE:
            continue
        last = group[-1]
        break_at = _cross_line(
            window.closes,
            last.index + 1,
            line_a.index,
            line_a.price,
            line_b.index,
            line_b.price,
            above=above,
        )
        state = _outcome(len(window.closes), last.index, break_at)
        if state is None:
            continue
        deep = _strength(depth, MIN_MOVE)
        if deep is None:
            continue
        found.append(_hit(pattern, (even + deep) / 2, state, window, roles, group, _neck(window, line_a, line_b), last.index))
    return found


def _near_count(values: list[float], index: int, *, below: float | None = None, above: float | None = None) -> int:
    start = max(0, index - 18)
    stop = min(len(values), index + 19)
    count = 0
    for i in range(start, stop):
        if below is not None and values[i] <= below:
            count += 1
        elif above is not None and values[i] >= above:
            count += 1
    return count


def _rounding(window: Window, swings: list[Swing], *, top: bool) -> list[NamedHit]:
    n = len(window.closes)
    pattern = "rounding_top" if top else "rounding_bottom"
    lo = int(n * 0.25)
    hi = int(n * 0.70)
    found: list[NamedHit] = []
    for extreme in swings:
        if extreme.kind != ("high" if top else "low"):
            continue
        if not (lo <= extreme.index <= hi):
            continue
        if top:
            lips = [swing for swing in swings if swing.kind == "low" and swing.index < extreme.index - 10]
            if not lips:
                continue
            lip = min(lips, key=lambda swing: (swing.price, -swing.index))
            if extreme.price <= 0:
                continue
            depth_px = extreme.price - lip.price
            depth = depth_px / extreme.price
            rights = [swing for swing in swings if swing.kind == "low" and swing.index > extreme.index + 10]
            if not rights or depth_px <= 0:
                continue
            right = min(rights, key=lambda swing: (swing.price, -swing.index))
            recover = (extreme.price - right.price) / depth_px
            band = extreme.price - ROUND_NEAR * depth_px
            wide = _near_count(window.highs, extreme.index, above=band) >= ROUND_NEAR_BARS
            retest = any(
                swing.kind == "high" and swing.index > extreme.index + 5 and swing.price >= band and swing.index != extreme.index
                for swing in swings
            )
            break_at = _cross_level(window.closes, right.index + 1, lip.price, above=False)
            neck = _level(window, lip, lip.price)
            roles = ["lip", "top", "lip"]
        else:
            lips = [swing for swing in swings if swing.kind == "high" and swing.index < extreme.index - 10]
            if not lips:
                continue
            lip = max(lips, key=lambda swing: (swing.price, -swing.index))
            if lip.price <= 0:
                continue
            depth_px = lip.price - extreme.price
            depth = depth_px / lip.price
            rights = [swing for swing in swings if swing.kind == "high" and swing.index > extreme.index + 10]
            if not rights or depth_px <= 0:
                continue
            right = max(rights, key=lambda swing: (swing.price, swing.index))
            recover = (right.price - extreme.price) / depth_px
            band = extreme.price + ROUND_NEAR * depth_px
            wide = _near_count(window.lows, extreme.index, below=band) >= ROUND_NEAR_BARS
            retest = any(
                swing.kind == "low" and swing.index > extreme.index + 5 and swing.price <= band for swing in swings
            )
            break_at = _cross_level(window.closes, right.index + 1, lip.price, above=True)
            neck = _level(window, lip, lip.price)
            roles = ["lip", "bottom", "lip"]
        if depth < ROUND_DEPTH_MIN or depth > 0.60 or recover < 0.60 or not wide or retest:
            continue
        state = _outcome(n, right.index, break_at)
        if state is None:
            continue
        score = _strength(depth, ROUND_DEPTH_MIN)
        if score is None:
            continue
        group = (lip, extreme, right)
        found.append(_hit(pattern, score, state, window, roles, group, neck, right.index))
    return found


def _cup_and_handle(window: Window, swings: list[Swing]) -> list[NamedHit]:
    n = len(window.closes)
    if n <= CUP_MIN_SPAN:
        return []
    found: list[NamedHit] = []
    for bottom in swings:
        if bottom.kind != "low" or not (int(n * 0.25) <= bottom.index <= int(n * 0.80)):
            continue
        before = [swing for swing in swings if swing.kind == "high" and swing.index < bottom.index - 15]
        after = [swing for swing in swings if swing.kind == "high" and swing.index > bottom.index + 15]
        if not before or not after:
            continue
        left = max(before, key=lambda swing: (swing.price, -swing.index))
        for right in after:
            if right.index - left.index < CUP_MIN_SPAN:
                continue
            gap = pair_gap(left.price, right.price)
            if gap is None or gap > PAIR_TOLERANCE or left.price <= 0:
                continue
            depth_px = left.price - bottom.price
            depth = depth_px / left.price
            if depth < CUP_DEPTH_MIN or depth > CUP_DEPTH_MAX:
                continue
            handles = [swing for swing in swings if swing.kind == "low" and swing.index > right.index + SWING_BARS]
            if not handles:
                continue
            handle = min(handles, key=lambda swing: (swing.price, -swing.index))
            drop = right.price - handle.price
            if drop <= 0 or drop > HANDLE_DEPTH_MAX * depth_px:
                continue
            if handle.price < bottom.price + 0.5 * depth_px:
                continue
            band = bottom.price + ROUND_NEAR * depth_px
            if _near_count(window.lows, bottom.index, below=band) < ROUND_NEAR_BARS:
                continue
            if any(
                swing.kind == "low"
                and swing.index < right.index
                and swing.index != bottom.index
                and abs(swing.index - bottom.index) > 8
                and swing.price <= band
                for swing in swings
            ):
                continue
            lip = left.price if left.price > right.price else right.price
            break_at = _cross_level(window.closes, handle.index + 1, lip, above=True)
            state = _outcome(n, handle.index, break_at)
            if state is None:
                continue
            even = pair_evenness(left.price, right.price)
            deep = _strength(depth, CUP_DEPTH_MIN)
            if even is None or deep is None:
                continue
            group = (left, bottom, right, handle)
            found.append(
                _hit(
                    "cup_and_handle",
                    (even + deep) / 2,
                    state,
                    window,
                    ["lip", "bottom", "lip", "handle"],
                    group,
                    _level(window, left, lip),
                    handle.index,
                )
            )
    return found


def detect_structure(pattern: str, window: Window, swings: list[Swing]) -> list[NamedHit]:
    if pattern in _FOURS:
        return _four(window, swings, pattern, _FOURS[pattern])
    if pattern == "bull_flag":
        return _impulse(window, swings, bull=True, pennant=False)
    if pattern == "bear_flag":
        return _impulse(window, swings, bull=False, pennant=False)
    if pattern == "bull_pennant":
        return _impulse(window, swings, bull=True, pennant=True)
    if pattern == "bear_pennant":
        return _impulse(window, swings, bull=False, pennant=True)
    if pattern == "triple_top":
        return _triple(window, swings, top=True)
    if pattern == "triple_bottom":
        return _triple(window, swings, top=False)
    if pattern == "rounding_bottom":
        return _rounding(window, swings, top=False)
    if pattern == "rounding_top":
        return _rounding(window, swings, top=True)
    if pattern == "cup_and_handle":
        return _cup_and_handle(window, swings)
    raise ValueError(pattern)
