from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol


class Sender(Protocol):
    def send(self, text: str) -> bool: ...


@dataclass(frozen=True)
class AlertRule:
    id: int
    ticker: str
    op: str
    price: int
    mode: str
    enabled: bool
    last_fired_at: datetime | None
    board: str = ""


@dataclass(frozen=True)
class LastPrice:
    ticker: str
    last: int
    board: str = ""


def condition_met(last: int, op: str, level: int) -> bool:
    if op == "gte":
        return last >= level
    if op == "lte":
        return last <= level
    return False


def should_fire(rule: AlertRule, last: int, now_ict: datetime, already_fired_ticker_today: bool) -> bool:
    if not rule.enabled:
        return False
    if not condition_met(last, rule.op, rule.price):
        return False
    if rule.mode == "once" and rule.last_fired_at is not None:
        return False
    if rule.mode == "repeat":
        if already_fired_ticker_today:
            return False
        if rule.last_fired_at is not None:
            fired_day = rule.last_fired_at.date()
            if fired_day == now_ict.date():
                return False
    return True


def format_message(rule: AlertRule, last: int, at: datetime) -> str:
    time_s = at.strftime("%Y-%m-%d %H:%M")
    return (
        f"{rule.ticker} {rule.board or '-'} last={last} {rule.op} {rule.price} at {time_s} ICT"
    )


def evaluate_rules(
    rules: list[AlertRule],
    prices: dict[str, LastPrice],
    now_ict: datetime,
    sender: Sender,
) -> list[int]:
    fired_ids: list[int] = []
    fired_tickers_today: set[str] = set()
    for rule in rules:
        px = prices.get(rule.ticker)
        if px is None:
            continue
        already = rule.ticker in fired_tickers_today
        if not should_fire(rule, px.last, now_ict, already):
            continue
        msg = format_message(
            AlertRule(**{**rule.__dict__, "board": px.board or rule.board}),
            px.last,
            now_ict,
        )
        ok = sender.send(msg)
        if ok:
            fired_ids.append(rule.id)
            fired_tickers_today.add(rule.ticker)
    return fired_ids
