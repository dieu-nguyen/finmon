from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Callable

OHLC_HOUR_PAUSE = 45_000
OHLC_DAY_PAUSE = 90_000
INSTRUMENTS_HOUR_PAUSE = 8_000
REMAINING_PAUSE = 100


class BackfillInterrupted(Exception):
    pass


def bucket_for(path: str) -> str | None:
    if "ohlc" in path:
        return "ohlc"
    if "instrument" in path:
        return "instruments"
    return None


class RateLimiter:
    """Pace DNSE calls under the backfill ceilings in the workflow doc."""

    def __init__(
        self,
        *,
        now_fn: Callable[[], datetime] | None = None,
        sleep_fn: Callable[[float], None] | None = None,
        stop_fn: Callable[[], bool] | None = None,
    ) -> None:
        self._now_fn = now_fn or (lambda: datetime.now(timezone.utc))
        self._sleep_fn = sleep_fn or __import__("time").sleep
        self._stop_fn = stop_fn or (lambda: False)
        self._events: dict[str, list[datetime]] = {"ohlc": [], "instruments": []}
        self._remaining: dict[str, int | None] = {"ohlc": None, "instruments": None}
        self._reset_at: dict[str, datetime | None] = {"ohlc": None, "instruments": None}

    def acquire(self, path: str) -> None:
        bucket = bucket_for(path)
        if bucket is None:
            return
        while True:
            delay = self._needed_delay(bucket)
            if delay <= 0:
                break
            self._sleep(delay)
        self._events[bucket].append(self._now())

    def observe(self, path: str, headers: dict[str, str]) -> None:
        bucket = bucket_for(path)
        if bucket is None:
            return
        remaining = _header_int(headers, "X-RateLimit-Remaining")
        if remaining is not None:
            self._remaining[bucket] = remaining
        reset = _header_reset(headers, self._now())
        if reset is not None:
            self._reset_at[bucket] = reset

    def sleep_for_429(self, path: str, headers: dict[str, str]) -> None:
        bucket = bucket_for(path) or "ohlc"
        reset = _header_reset(headers, self._now())
        if reset is not None:
            self._reset_at[bucket] = reset
            delay = (reset - self._now()).total_seconds()
        else:
            delay = self._window_delay(bucket, self._now())
        if delay <= 0:
            delay = 1.0
        self._sleep(delay)
        self._remaining[bucket] = None

    def _needed_delay(self, bucket: str) -> float:
        now = self._now()
        self._prune(bucket, now)
        remaining = self._remaining.get(bucket)
        if remaining is not None and remaining < REMAINING_PAUSE:
            delay = self._reset_delay(bucket, now)
            self._remaining[bucket] = None
            if delay and delay > 0:
                return delay
        hour_cap = OHLC_HOUR_PAUSE if bucket == "ohlc" else INSTRUMENTS_HOUR_PAUSE
        hour_events = [t for t in self._events[bucket] if (now - t).total_seconds() < 3600]
        if len(hour_events) >= hour_cap:
            return self._pause_delay(bucket, now, min(hour_events) + timedelta(hours=1))
        if bucket == "ohlc" and len(self._events[bucket]) >= OHLC_DAY_PAUSE:
            return self._pause_delay(bucket, now, min(self._events[bucket]) + timedelta(hours=24))
        return 0.0

    def _pause_delay(self, bucket: str, now: datetime, local_until: datetime) -> float:
        reset_delay = self._reset_delay(bucket, now)
        local_delay = (local_until - now).total_seconds()
        if reset_delay is not None and reset_delay > 0:
            return reset_delay
        return max(local_delay, 0.0)

    def _window_delay(self, bucket: str, now: datetime) -> float:
        self._prune(bucket, now)
        events = self._events.get(bucket) or []
        if not events:
            return 1.0
        return max((min(events) + timedelta(hours=1) - now).total_seconds(), 1.0)

    def _reset_delay(self, bucket: str, now: datetime) -> float | None:
        reset = self._reset_at.get(bucket)
        if reset is None:
            return None
        delay = (reset - now).total_seconds()
        if delay <= 0:
            self._reset_at[bucket] = None
            return None
        return delay

    def _prune(self, bucket: str, now: datetime) -> None:
        cutoff = now - timedelta(hours=24)
        self._events[bucket] = [t for t in self._events[bucket] if t >= cutoff]

    def _sleep(self, seconds: float) -> None:
        remaining = seconds
        while remaining > 0:
            if self._stop_fn():
                raise BackfillInterrupted()
            step = min(1.0, remaining)
            self._sleep_fn(step)
            remaining -= step

    def _now(self) -> datetime:
        now = self._now_fn()
        if now.tzinfo is None:
            return now.replace(tzinfo=timezone.utc)
        return now


def _header_int(headers: dict[str, str], name: str) -> int | None:
    for key, value in headers.items():
        if key.lower() == name.lower() and value is not None:
            try:
                return int(float(value))
            except ValueError:
                return None
    return None


def _header_reset(headers: dict[str, str], now: datetime) -> datetime | None:
    raw = None
    for key, value in headers.items():
        if key.lower() == "x-ratelimit-reset":
            raw = value
            break
    if raw is None or raw == "":
        return None
    try:
        epoch = float(raw)
    except ValueError:
        return None
    if epoch > 1e12:
        epoch /= 1000.0
    if epoch > 1_000_000_000:
        return datetime.fromtimestamp(epoch, tz=timezone.utc)
    return now + timedelta(seconds=epoch)
