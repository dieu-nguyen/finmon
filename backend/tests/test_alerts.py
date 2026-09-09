from datetime import datetime
from zoneinfo import ZoneInfo

from app.alerts import AlertRule, LastPrice, evaluate_rules, should_fire

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
NOW = datetime(2026, 9, 8, 10, 0, tzinfo=ICT)


class FakeSender:
    def __init__(self, ok: bool = True) -> None:
        self.ok = ok
        self.messages: list[str] = []

    def send(self, text: str) -> bool:
        self.messages.append(text)
        return self.ok


def _rule(**kwargs) -> AlertRule:
    base = dict(
        id=1,
        ticker="VCB",
        op="gte",
        price=100,
        mode="once",
        enabled=True,
        last_fired_at=None,
        board="HOSE",
    )
    base.update(kwargs)
    return AlertRule(**base)


def test_fires_at_level():
    assert should_fire(_rule(), 100, NOW, False) is True
    assert should_fire(_rule(), 99, NOW, False) is False


def test_lte():
    assert should_fire(_rule(op="lte", price=100), 100, NOW, False) is True
    assert should_fire(_rule(op="lte", price=100), 101, NOW, False) is False


def test_once_does_not_double():
    assert should_fire(_rule(last_fired_at=NOW.replace(tzinfo=None)), 200, NOW, False) is False


def test_repeat_once_per_day_per_ticker():
    sender = FakeSender()
    rules = [
        _rule(id=1, mode="repeat"),
        _rule(id=2, mode="repeat", price=90),
    ]
    prices = {"VCB": LastPrice("VCB", 100, "HOSE")}
    fired = evaluate_rules(rules, prices, NOW, sender)
    assert fired == [1]
    assert len(sender.messages) == 1


def test_telegram_failure_does_not_mark_fired():
    sender = FakeSender(ok=False)
    fired = evaluate_rules([_rule()], {"VCB": LastPrice("VCB", 100, "HOSE")}, NOW, sender)
    assert fired == []
