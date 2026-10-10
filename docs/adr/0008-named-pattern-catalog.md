# 0008. The named-pattern catalog

Status: accepted
Date: 2026-10-10

## Context

ADR 0006 built four swing patterns on kind `named`: double bottom, double top, head and shoulders, and inverse head and shoulders. The Patterns page listed more shapes with Scan disabled. Triangles, flags, wedges, cup and handle, and the other standard structure patterns are the same kind of rule: swings on one ticker, a boundary, forming or confirmed, and the same freshness.

## Decision

Kind `named` now detects these patterns. The one-ticker check and the market scan call the same `detect` function.

- `double_bottom`, `double_top`, `head_and_shoulders`, `inverse_head_and_shoulders` (unchanged)
- `triple_top`, `triple_bottom`
- `bull_flag`, `bear_flag`, `bull_pennant`, `bear_pennant`
- `ascending_triangle`, `descending_triangle`, `symmetrical_triangle`
- `cup_and_handle`
- `rectangle`
- `rounding_bottom`, `rounding_top`
- `falling_wedge`, `rising_wedge`
- `broadening`
- `ascending_channel`, `descending_channel`

Lookback stays 90 sessions, except cup and handle. `CUP_LOOKBACK` is 180 sessions. `CUP_MIN_SPAN` is 90: the cup from the left lip to the right lip spans at least 90 sessions, so a cup that fits inside the standard lookback does not match. When a scan includes cup and handle, that run loads up to 180 sessions. Other patterns in the same run still score only their last 90. A name with fewer than 180 sessions can still be scanned; cup and handle returns no hit for it.

Freshness, the five-bar swing, the 0.70 floor, and the cap of 20 market hits per pattern are unchanged. A hit is forming or confirmed. Confirmed means a close through that pattern's boundary inside the last 10 trading sessions. A shape whose last swing, or whose confirming close, is about 30 sessions back is not a hit.

The boundary rule is in code. Flat highs or lows use the 3% pair band. A side that must rise or fall has to move at least 3% (`MIN_MOVE`). A flag needs a pole of at least 8% (`POLE_MIN`) and a short drift that retraces at most half the pole. Converging lines (triangles, wedges, pennants) end at most 75% as far apart as they started (`CONVERGE_MAX`). Parallel lines (flags, rectangle, channels) stay between 80% and 125% (`PARALLEL_LO`, `PARALLEL_HI`). A broadening formation widens to at least 125% (`DIVERGE_MIN`). A rectangle must be at least 6% tall (`RANGE_MIN`).

Scans stay manual. This catalog is not hooked to backfill or the 30-minute job. There is no candlestick detector in this change.

The Patterns page is the introduction. Each card has the shape, a schematic, and how to read forming versus confirmed. The teaching rank is a fixed 1–100. The four original patterns stay at the top of that list. Scan is enabled for every pattern this decision implements.

## Consequences

`docs/pattern-compare.md` is the build spec for the rules and for `CUP_LOOKBACK`. ADR 0006 still holds for the scan kind, the manual trigger, the swing, the freshness, the floor, and the cap. The sentence there that left triangles, flags, and cup and handle for later is superseded by this decision.
