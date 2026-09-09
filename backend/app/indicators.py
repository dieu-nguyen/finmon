from __future__ import annotations

import math


def sma(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0:
        return out
    acc = 0.0
    for i, v in enumerate(values):
        acc += v
        if i >= period:
            acc -= values[i - period]
        if i >= period - 1:
            out[i] = acc / period
    return out


def ema(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0 or not values:
        return out
    k = 2.0 / (period + 1)
    prev: float | None = None
    acc = 0.0
    for i, v in enumerate(values):
        if i < period - 1:
            acc += v
            continue
        if i == period - 1:
            acc += v
            prev = acc / period
            out[i] = prev
            continue
        assert prev is not None
        prev = v * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(values: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period + 1:
        return out
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        delta = values[i] - values[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses -= delta
    avg_gain = gains / period
    avg_loss = losses / period
    out[period] = 100.0 if avg_loss == 0 else 100 - (100 / (1 + avg_gain / avg_loss))
    for i in range(period + 1, len(values)):
        delta = values[i] - values[i - 1]
        gain = max(delta, 0.0)
        loss = max(-delta, 0.0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        out[i] = 100.0 if avg_loss == 0 else 100 - (100 / (1 + avg_gain / avg_loss))
    return out


def macd(
    values: list[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> dict[str, list[float | None]]:
    fast_ema = ema(values, fast)
    slow_ema = ema(values, slow)
    line: list[float | None] = [None] * len(values)
    for i, (f, s) in enumerate(zip(fast_ema, slow_ema)):
        if f is None or s is None:
            continue
        line[i] = f - s
    compact = [x for x in line if x is not None]
    sig_compact = ema(compact, signal)
    signal_line: list[float | None] = [None] * len(values)
    hist: list[float | None] = [None] * len(values)
    si = 0
    for i, lv in enumerate(line):
        if lv is None:
            continue
        sv = sig_compact[si]
        si += 1
        signal_line[i] = sv
        if sv is not None:
            hist[i] = lv - sv
    return {"macd": line, "signal": signal_line, "hist": hist}


def bollinger(
    values: list[float], period: int = 20, n_std: float = 2.0
) -> dict[str, list[float | None]]:
    mid = sma(values, period)
    upper: list[float | None] = [None] * len(values)
    lower: list[float | None] = [None] * len(values)
    for i, m in enumerate(mid):
        if m is None:
            continue
        window = values[i - period + 1 : i + 1]
        mean = m
        var = sum((x - mean) ** 2 for x in window) / period
        std = math.sqrt(var)
        upper[i] = mean + n_std * std
        lower[i] = mean - n_std * std
    return {"mid": mid, "upper": upper, "lower": lower}


def atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> list[float | None]:
    n = len(closes)
    out: list[float | None] = [None] * n
    if n == 0:
        return out
    trs: list[float] = []
    for i in range(n):
        if i == 0:
            trs.append(highs[i] - lows[i])
        else:
            trs.append(
                max(
                    highs[i] - lows[i],
                    abs(highs[i] - closes[i - 1]),
                    abs(lows[i] - closes[i - 1]),
                )
            )
    acc = 0.0
    prev = 0.0
    for i, tr in enumerate(trs):
        if i < period:
            acc += tr
            if i == period - 1:
                prev = acc / period
                out[i] = prev
            continue
        prev = (prev * (period - 1) + tr) / period
        out[i] = prev
    return out


def volume_ma(volumes: list[float], period: int = 20) -> list[float | None]:
    return sma(volumes, period)
