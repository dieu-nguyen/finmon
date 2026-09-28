# 0003. Indicators are calculated when the chart asks

Status: accepted
Date: 2026-09-28

## Context

Indicator series were computed on every stored bar, so they did not line up with the candles on screen. Storing a point per indicator per day would copy the price history again.

## Decision

Indicators are calculated when the chart asks, on the same date window as the candles. They are not stored. A later whole-catalog rule scan may compute indicators inside the job and store matches only, not every indicator point.

## Consequences

The chart and the indicator read share `from` and `to`. The chart today shows SMA 20. sma, ema, rsi, macd, bollinger, atr, and volume_ma exist on the API. Window alignment is specified in `docs/market-list.md`.
