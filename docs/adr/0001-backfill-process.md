# 0001. History backfill is its own process

Status: accepted
Date: 2026-09-28

## Context

Daily history has to catch up when the app was stopped, and it has to replace the session candle after the close. A 16:30 job inside the API misses that slot whenever the API is down, and it does not replay the miss.

## Decision

History backfill is its own process, separate from the API. The API keeps the 30-minute watchlist poll and the quote candle. The API does not run a 16:30 history job. Official bars are `source=dnse`. Session candles are `source=quote` until the after-close pass replaces them.

## Consequences

The chart can show a forming candle during the session and the exchange bar after that pass. Price alerts still evaluate on the 30-minute poll only. Build spec: `docs/backfill-workflow.md`.
