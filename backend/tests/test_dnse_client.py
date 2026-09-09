from app.clients.dnse import parse_instruments, parse_ohlc, parse_quote, to_dong
from tests.conftest import load_fixture


def test_parse_instruments():
    items = parse_instruments(load_fixture("dnse_instruments.json"))
    by = {i.ticker: i for i in items}
    assert by["VCB"].board == "HOSE"
    assert by["VCB"].type == "stock"
    assert by["E1VFVN30"].type == "etf"
    assert by["VNINDEX"].type == "index"


def test_parse_ohlc_dong():
    bars = parse_ohlc(load_fixture("dnse_ohlc.json"), "VCB")
    assert len(bars) == 3
    assert bars[0].open == 90_000
    assert bars[-1].close == 92_500
    assert bars[0].volume == 1000


def test_parse_quote_dong():
    q = parse_quote(load_fixture("dnse_quote.json"), "VCB")
    assert q.last == 92_600
    assert q.ceiling == 98_400
    assert q.floor == 85_600


def test_to_dong_index_uses_cents():
    assert to_dong(1280.55, is_index=True) == 128055
