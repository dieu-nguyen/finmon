from app.indicators import atr, bollinger, ema, macd, rsi, sma, volume_ma

CLOSES = [float(100 + i) for i in range(90)]
HIGHS = [c + 2 for c in CLOSES]
LOWS = [c - 2 for c in CLOSES]
VOLS = [float(1000 + i) for i in range(90)]


def test_sma_20_golden():
    out = sma(CLOSES, 20)
    assert out[19] == 109.5
    assert abs(out[-1] - 179.5) < 1e-6
    assert out[18] is None


def test_ema_seeded_sma():
    out = ema(CLOSES, 5)
    assert abs(out[4] - 102.0) < 1e-6
    k = 2 / 6
    expected = 105 * k + out[4] * (1 - k)
    assert abs(out[5] - expected) < 1e-6


def test_rsi_known_window():
    values = [44, 44.3, 44.1, 43.9, 44.5, 45, 45.2, 45.6, 45.3, 45.8, 46, 46.2, 46.1, 46.5, 46.8, 47.0]
    out = rsi(values, 14)
    assert out[14] is not None
    assert 0 < out[14] < 100


def test_macd_bollinger_atr_volume():
    m = macd(CLOSES)
    assert m["macd"][-1] is not None
    b = bollinger(CLOSES, 20, 2)
    assert b["mid"][-1] is not None
    assert b["upper"][-1] > b["mid"][-1] > b["lower"][-1]
    a = atr(HIGHS, LOWS, CLOSES, 14)
    assert a[-1] is not None
    v = volume_ma(VOLS, 20)
    assert abs(v[-1] - sum(VOLS[-20:]) / 20) < 1e-6
