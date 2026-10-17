# 0011. The market page reads the latest two bars by index

Status: accepted
Date: 2026-10-17

## Context

Each market row needs the newest close and the close before it. A window over each ticker's history reads far more than those two bars.

## Decision

The market page loads the latest two daily bars with a backward index lookup of 2 rows per ticker on `uq_daily_bar_ticker_date`, not a window over each ticker's history.

The one-page rule stays `docs/adr/0002-market-list-page.md`. This decision is only the bar read.

## Consequences

The page query stays a fixed set for the rows on screen. Build spec: `docs/market-list.md`.
