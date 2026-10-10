import math
from datetime import date, timedelta

from app.patterns.named import (
    CUP_LOOKBACK,
    CUP_MIN_SPAN,
    LOOKBACK,
    SCORE_FLOOR,
    detect,
    find_swings,
    match_all,
    pattern_lookback,
    score_named,
)
from app.patterns.windows import Window
from tests.test_pattern_compare import AS_OF

BUMP = 2.0


def _window_from(highs, lows, closes, as_of: date = AS_OF) -> Window:
    n = len(closes)
    dates = [as_of - timedelta(days=n - 1 - i) for i in range(n)]
    return Window(closes=list(closes), window_start=dates[0], window_end=dates[-1], highs=list(highs), lows=list(lows), dates=dates)


def _anchors(points: list[tuple[int, str, float]], n: int = LOOKBACK) -> Window:
    points = sorted(points)
    closes = [float(points[0][2])] * n
    knots = [(index, float(price)) for index, _kind, price in points]
    for i in range(knots[0][0]):
        closes[i] = knots[0][1]
    for (i0, p0), (i1, p1) in zip(knots, knots[1:]):
        span = i1 - i0
        for i in range(i0, i1 + 1):
            closes[i] = p0 + (p1 - p0) * ((i - i0) / span)
    for i in range(knots[-1][0] + 1, n):
        closes[i] = knots[-1][1]
    highs = [close + 0.5 for close in closes]
    lows = [close - 0.5 for close in closes]
    for index, kind, price in points:
        price = float(price)
        if kind == "high":
            highs[index] = price + BUMP
            closes[index] = price
            lows[index] = price - 0.5
        else:
            lows[index] = price - BUMP
            closes[index] = price
            highs[index] = price + 0.5
    return _window_from(highs, lows, closes)


def _shift(points: list[tuple[int, str, float]], by: int = 30) -> list[tuple[int, str, float]]:
    return [(index - by, kind, price) for index, kind, price in points]


def _curve(n: int, price_at, bumps: list[tuple[int, str, float]]) -> Window:
    closes = [float(price_at(i)) for i in range(n)]
    highs = [close + 0.5 for close in closes]
    lows = [close - 0.5 for close in closes]
    for index, kind, price in bumps:
        price = float(price)
        if kind == "high":
            highs[index] = price + BUMP
            closes[index] = price
            lows[index] = min(lows[index], price - 0.5)
        else:
            lows[index] = price - BUMP
            closes[index] = price
            highs[index] = max(highs[index], price + 0.5)
    return _window_from(highs, lows, closes)


def _rounding_bottom(*, finish: int = 84, floor: float = 90) -> Window:
    n = LOOKBACK
    left, lip, right_lip = 18, 130.0, 118.0

    def price_at(i: int) -> float:
        if i <= left:
            return lip - 20
        if i >= finish:
            return right_lip - 3
        t = (i - left) / (finish - left)
        dome = floor + (lip - floor) * (1 - math.sin(math.pi * t))
        return dome - (lip - right_lip) * t

    return _curve(n, price_at, [(left, "high", lip), (finish, "high", right_lip), ((left + finish) // 2, "low", floor)])


def _rounding_top(*, finish: int = 84, crown: float = 140) -> Window:
    n = LOOKBACK
    left, lip, right_lip = 18, 100.0, 112.0

    def price_at(i: int) -> float:
        if i <= left:
            return lip + 20
        if i >= finish:
            return right_lip + 3
        t = (i - left) / (finish - left)
        dome = crown - (crown - lip) * (1 - math.sin(math.pi * t))
        return dome + (right_lip - lip) * t

    return _curve(n, price_at, [(left, "low", lip), (finish, "low", right_lip), ((left + finish) // 2, "high", crown)])


def _cup(*, handle_at: int = 174, floor: float = 80, n: int = CUP_LOOKBACK) -> Window:
    left, right, lip = 30, 145, 140.0

    def price_at(i: int) -> float:
        if i <= left:
            return lip - 25
        if i >= handle_at:
            return 122
        if i >= right:
            t = (i - right) / (handle_at - right)
            return lip - (lip - 122) * t
        t = (i - left) / (right - left)
        return floor + (lip - floor) * (1 - math.sin(math.pi * t))

    mid = (left + right) // 2
    return _curve(
        n,
        price_at,
        [(left, "high", lip), (mid, "low", floor), (right, "high", lip), (handle_at, "low", 120)],
    )


def _short_cup() -> Window:
    """A cup drawn entirely inside the standard 90 sessions. The span is too short."""
    n = LOOKBACK
    left, right, lip, floor, handle = 12, 58, 140.0, 80.0, 84

    def price_at(i: int) -> float:
        if i <= left:
            return lip - 25
        if i >= handle:
            return 122
        if i >= right:
            t = (i - right) / (handle - right)
            return lip - (lip - 122) * t
        t = (i - left) / (right - left)
        return floor + (lip - floor) * (1 - math.sin(math.pi * t))

    mid = (left + right) // 2
    return _curve(
        n,
        price_at,
        [(left, "high", lip), (mid, "low", floor), (right, "high", lip), (handle, "low", 120)],
    )


ASCENDING = [(64, "high", 140), (72, "low", 100), (80, "high", 140), (89, "low", 120)]
DESCENDING = [(64, "low", 100), (72, "high", 140), (80, "low", 100), (89, "high", 118)]
SYMMETRICAL = [(64, "high", 150), (72, "low", 100), (80, "high", 135), (89, "low", 115)]
RISING_WEDGE = [(64, "high", 120), (72, "low", 100), (80, "high", 145), (89, "low", 135)]
FALLING_WEDGE = [(64, "high", 160), (72, "low", 130), (80, "high", 140), (89, "low", 118)]
RECTANGLE = [(64, "high", 140), (72, "low", 100), (80, "high", 140), (89, "low", 100)]
BROADENING = [(64, "high", 120), (72, "low", 105), (80, "high", 145), (89, "low", 80)]
ASCENDING_CHANNEL = [(52, "low", 100), (66, "high", 130), (78, "low", 116), (89, "high", 146)]
DESCENDING_CHANNEL = [(52, "high", 150), (66, "low", 120), (78, "high", 134), (89, "low", 104)]
BULL_FLAG = [(48, "low", 80), (60, "high", 150), (70, "low", 130), (78, "high", 140), (89, "low", 120)]
BEAR_FLAG = [(48, "high", 160), (60, "low", 80), (70, "high", 100), (78, "low", 92), (89, "high", 112)]
BULL_PENNANT = [(48, "low", 80), (60, "high", 150), (72, "low", 120), (82, "high", 138), (89, "low", 130)]
BEAR_PENNANT = [(48, "high", 160), (60, "low", 90), (70, "high", 120), (80, "low", 105), (89, "high", 108)]
TRIPLE_TOP = [(50, "high", 140), (60, "low", 100), (70, "high", 140), (80, "low", 100), (89, "high", 140)]
TRIPLE_BOTTOM = [(50, "low", 100), (60, "high", 140), (70, "low", 100), (80, "high", 140), (89, "low", 100)]


CASES = {
    "ascending_triangle": (ASCENDING, [(64, "high", 140), (72, "low", 110), (80, "high", 140), (89, "low", 111)]),
    "descending_triangle": (DESCENDING, [(64, "low", 100), (72, "high", 130), (80, "low", 100), (89, "high", 129)]),
    "symmetrical_triangle": (SYMMETRICAL, [(64, "high", 130), (72, "low", 100), (80, "high", 130), (89, "low", 100)]),
    "rising_wedge": (RISING_WEDGE, [(64, "high", 120), (72, "low", 100), (80, "high", 121), (89, "low", 101)]),
    "falling_wedge": (FALLING_WEDGE, [(64, "high", 140), (72, "low", 110), (80, "high", 139), (89, "low", 109)]),
    "rectangle": (RECTANGLE, [(64, "high", 100), (72, "low", 100), (80, "high", 100), (89, "low", 100)]),
    "broadening": (BROADENING, [(64, "high", 120), (72, "low", 100), (80, "high", 121), (89, "low", 99)]),
    "ascending_channel": (ASCENDING_CHANNEL, [(52, "low", 100), (66, "high", 130), (78, "low", 101), (89, "high", 131)]),
    "descending_channel": (DESCENDING_CHANNEL, [(52, "high", 140), (66, "low", 110), (78, "high", 139), (89, "low", 109)]),
    "bull_flag": (BULL_FLAG, [(48, "low", 80), (60, "high", 150), (70, "low", 148), (78, "high", 149), (89, "low", 147)]),
    "bear_flag": (BEAR_FLAG, [(48, "high", 150), (60, "low", 80), (70, "high", 82), (78, "low", 81), (89, "high", 83)]),
    "bull_pennant": (BULL_PENNANT, [(48, "low", 80), (60, "high", 150), (72, "low", 140), (82, "high", 148), (89, "low", 141)]),
    "bear_pennant": (BEAR_PENNANT, [(48, "high", 160), (60, "low", 90), (70, "high", 100), (80, "low", 91), (89, "high", 99)]),
    "triple_top": (TRIPLE_TOP, [(50, "high", 140), (60, "low", 140), (70, "high", 140), (80, "low", 140), (89, "high", 140)]),
    "triple_bottom": (TRIPLE_BOTTOM, [(50, "low", 101), (60, "high", 100), (70, "low", 101), (80, "high", 100), (89, "low", 101)]),
}


def test_lookback_exception_is_only_cup_and_handle():
    assert pattern_lookback("cup_and_handle") == CUP_LOOKBACK == 180
    assert CUP_MIN_SPAN == 90
    for pattern in (
        "double_bottom",
        "ascending_triangle",
        "bull_flag",
        "rising_wedge",
        "rounding_bottom",
        "rectangle",
        "broadening",
        "ascending_channel",
    ):
        assert pattern_lookback(pattern) == LOOKBACK == 90


def test_each_new_pattern_matches_a_fresh_shape_and_rejects_a_flat_or_old_one():
    for pattern, (clear, flat) in CASES.items():
        hit = detect(_anchors(clear), pattern)
        assert hit is not None and hit.pattern == pattern and hit.state == "forming", pattern
        assert hit.score >= SCORE_FLOOR
        assert detect(_anchors(flat), pattern) is None, pattern
        aged = _anchors(_shift(clear))
        # A flag boundary keeps sloping after the shape ends. Pin the tail so
        # that slope does not drift through the hold inside the fresh sessions.
        tail = {"bull_flag": 100.0, "bear_flag": 120.0}.get(pattern)
        if tail is not None:
            last = max(index for index, _kind, _price in _shift(clear))
            for i in range(last + 1, LOOKBACK):
                aged.closes[i] = tail
                aged.highs[i] = tail + 1
                aged.lows[i] = tail - 1
        assert detect(aged, pattern) is None, pattern

    bottom = detect(_rounding_bottom(), "rounding_bottom")
    assert bottom is not None and bottom.state == "forming" and bottom.score >= SCORE_FLOOR
    assert [point["role"] for point in bottom.swings["points"]] == ["lip", "bottom", "lip"]
    assert detect(_rounding_bottom(finish=50), "rounding_bottom") is None
    assert detect(_anchors([(40, "high", 130), (55, "low", 90), (70, "high", 120)]), "rounding_bottom") is None

    top = detect(_rounding_top(), "rounding_top")
    assert top is not None and top.state == "forming" and top.score >= SCORE_FLOOR
    assert detect(_rounding_top(finish=50), "rounding_top") is None
    assert detect(_anchors([(40, "low", 100), (55, "high", 140), (70, "low", 110)]), "rounding_top") is None

    cup = detect(_cup(), "cup_and_handle")
    assert cup is not None and cup.state == "forming" and cup.score >= SCORE_FLOOR
    assert [point["role"] for point in cup.swings["points"]] == ["lip", "bottom", "lip", "handle"]
    assert cup.swings["points"][2]["date"]
    assert detect(_cup(handle_at=140), "cup_and_handle") is None
    assert detect(_cup(floor=130), "cup_and_handle") is None
    assert detect(_short_cup(), "cup_and_handle") is None


def test_new_patterns_share_the_one_ticker_and_market_detector():
    windows = {pattern: _anchors(clear) for pattern, (clear, _flat) in CASES.items()}
    windows["rounding_bottom"] = _rounding_bottom()
    windows["rounding_top"] = _rounding_top()
    windows["cup_and_handle"] = _cup()
    for pattern, window in windows.items():
        direct = detect(window, pattern)
        market = score_named({"pattern": pattern}, {"VHM": window})
        assert direct is not None
        assert len(market.hits) == 1
        row = market.hits[0]
        assert row.pattern == pattern
        assert row.score == direct.score
        assert row.state == direct.state
        assert row.swings == direct.swings
        checked = next(hit for hit in match_all(window) if hit.pattern == pattern)
        assert checked.score == direct.score and checked.swings == direct.swings


def test_ascending_triangle_confirms_on_a_close_through_the_flat_highs():
    points = [(60, "high", 140), (68, "low", 100), (76, "high", 140), (82, "low", 120)]
    window = _anchors(points)
    window.closes[86] = 160
    window.highs[86] = 162
    hit = detect(window, "ascending_triangle")
    assert hit is not None and hit.state == "confirmed"


def test_cup_shape_uses_swings_inside_the_long_window():
    window = _cup()
    swings = find_swings(window)
    assert swings
    hit = detect(window, "cup_and_handle")
    assert hit is not None
    assert hit.window_start < window.dates[-LOOKBACK]
