# 0008. Named scan results are one combined list

Status: accepted
Date: 2026-10-11

## Context

Named scans already store a market run and a one-ticker run on `scan_run` and `scan_hit`. The Scans page read the newest ok market run. The symbol Scan tab read the newest ok one-ticker run for that symbol. A hit from one mode did not appear on the other screen.

## Decision

Named results are one combined list. Both screens read it. For each ticker, the newest ok named run that covered that ticker wins. A hit more than 10 trading sessions behind that ticker's newest daily bar stays stored and is hidden. Look-alike stays separate: the latest ok run for that look-alike pattern only.

A market run with scope `all` covers the tickers that run compared. New runs store that list on `scan_run.request` as `compared`. An older scope `all` run that did not store it covers the eligible universe as of that run's `as_of`, using the scanner's eligibility rule, plus any ticker that run already has a hit for. A market run with scope `subset`, and a ticker run, cover only `request.tickers`.

That winning run supplies the ticker's hits. If it has no hit for the ticker, the ticker is absent. A newer scan of one ticker does not remove another. A failed run covers no ticker and does not erase the previous ok result.

The 10-session hide uses the last swing date, or the confirming close date when that is later. Sessions are counted on that ticker's own bars. Detection rules for a new scan do not change.

## Consequences

The Scans named section lists every ticker still in the combined list, with the run id, sorted by score descending, then ticker. The symbol Scan tab lists the same rows for that ticker. An empty combined list is an empty state. Build spec: `docs/pattern-compare.md`.
