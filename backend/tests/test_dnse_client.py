from app.clients.dnse import DnseClient, classify_type, parse_instruments, parse_ohlc, parse_quote, to_dong
from tests.conftest import load_fixture


def test_parse_instruments():
    items = parse_instruments(load_fixture("dnse_instruments.json"))
    by = {i.ticker: i for i in items}
    assert by["VCB"].board == "HOSE"
    assert by["VCB"].type == "stock"
    assert by["E1VFVN30"].type == "etf"
    assert by["VNINDEX"].type == "index"


def test_futures_classify_before_index_and_vnindex_stays_index():
    assert classify_type({"symbol": "41I1G3000", "name": "HĐTL chỉ số VN30", "board": "DVX"}) == "futures"
    assert classify_type({"symbol": "41I1G3000", "name": "VN30 future", "board": "HNX"}) == "futures"
    assert classify_type({"symbol": "VN30F2305", "name": "VN30F2305", "board": "HNX"}) == "futures"
    assert classify_type({"symbol": "F1", "name": "Hợp đồng tương lai VN30", "board": "HNX"}) == "futures"
    assert classify_type({"symbol": "VNINDEX", "name": "VNINDEX", "securityGroupId": "INDEX"}) == "index"
    assert classify_type({"symbol": "VN30", "name": "Chỉ số VN30", "board": "HOSE"}) == "index"
    parsed = parse_instruments([{"symbol": "41I1G3000", "name": "HĐTL chỉ số VN30", "board": "DVX"}])
    assert parsed[0].type == "futures"


def test_covered_warrant_classifies_without_overriding_a_named_stock():
    assert classify_type({"symbol": "CACB2206", "name": "Chứng quyền ACB", "board": "HOSE"}) == "warrant"
    assert classify_type({"symbol": "CACB2206", "name": "", "board": "HOSE"}) == "warrant"
    assert classify_type({"symbol": "CACB2206", "board": "HOSE"}) == "warrant"
    assert classify_type({"symbol": "CACB2206", "name": "Ngân hàng ABC", "board": "HOSE"}) == "stock"


def test_hcx_or_trai_phieu_classifies_as_bond():
    assert classify_type({"symbol": "BAB122030", "name": "BAB122030", "board": "HCX"}) == "bond"
    assert classify_type({"symbol": "BOND1", "name": "Trái phiếu doanh nghiệp", "board": "HOSE"}) == "bond"
    parsed = parse_instruments([{"symbol": "BAB122030", "name": "BAB122030", "board": "HCX"}])
    assert parsed[0].type == "bond"
    assert parsed[0].board == "HCX"
    assert classify_type({"symbol": "E1", "name": "ETF trái phiếu", "board": "HCX"}) == "etf"


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


def test_parse_quote_from_trades_match_price():
    q = parse_quote(
        {
            "trades": [
                {"boardId": "G4", "matchPrice": 72.1},
                {"boardId": "G1", "matchPrice": 72},
            ]
        },
        "VHM",
    )
    assert q.last == 72_000
    assert q.board == "G1"


def test_parse_quote_quotes_without_last_is_zero():
    q = parse_quote(
        {"quotes": [{"boardId": "G1", "bid": [{"price": 72, "quantity": 1}]}]},
        "VHM",
    )
    assert q.last == 0


def test_to_dong_index_uses_cents():
    assert to_dong(1280.55, is_index=True) == 128055


def test_latest_quote_ignores_hose_board_id():
    import httpx

    from app.config import Settings

    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if request.url.path.endswith("/trades/latest"):
            return httpx.Response(200, json={"trades": [{"matchPrice": 72, "boardId": "G1"}]})
        if request.url.path.endswith("/quotes/latest"):
            if request.url.params.get("boardId"):
                return httpx.Response(404, json={"message": "not found boardId"})
            return httpx.Response(200, json={"quotes": [{"boardId": "G1"}]})
        if request.url.path.endswith("/secdef"):
            return httpx.Response(
                200,
                json=[{"basicPrice": 72, "ceilingPrice": 77, "floorPrice": 67, "boardId": "T4"}],
            )
        return httpx.Response(404)

    client = DnseClient(
        Settings(dnse_api_key="k", dnse_api_secret="s"),
        transport=httpx.MockTransport(handler),
    )
    q = client.latest_quote("VHM", board_id="HOSE")
    assert q.last == 72_000
    assert q.ref == 72_000
    assert q.ceiling == 77_000
    assert all("boardId=HOSE" not in u for u in seen)
