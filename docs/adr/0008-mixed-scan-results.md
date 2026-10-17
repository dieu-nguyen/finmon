# 0008. Named scan results are one combined list

Status: accepted
Date: 2026-10-11

## Context

Named scans already store a market run and a one-ticker run on `scan_run` and `scan_hit`. Both screens read those stored runs. Taking the newest ok run that covered a ticker made that run supply every pattern for the ticker. A later scan of one pattern dropped the other patterns, even though that run never checked them.

## Decision

Named results are one combined list. Both screens read it. For each symbol and pattern, the latest ok named run that covered that pair is the result. A run covers a pair when `request.patterns` includes that pattern and the run covered that symbol. A hit on that run is shown when its last swing, or the confirming close if later, falls within the last 10 of that symbol's own daily bars. If that run stored no hit for the pair, the pair is absent. An older hit does not remain. A run that did not select the pattern does not change the pair. A failed run covers nothing. Look-alike stays separate: the latest ok run for that look-alike pattern only.

A market run with scope `all` covers the tickers that run compared. New runs store that list on `scan_run.request` as `compared`. An older scope `all` run that did not store it covers the eligible universe as of that run's `as_of`, using the scanner's eligibility rule, plus any ticker that run already has a hit for. A market run with scope `subset`, and a ticker run, cover only `request.tickers`. A pattern counts only when it is in `request.patterns`.

## Consequences

The Scans page and the symbol Scan tab read this same list. Summary charts it with no filter. Matches pages it, 20 rows, newest run id first, then score, then ticker. The symbol Scan tab lists the pairs for that symbol. An empty combined list is an empty state. Build spec: `docs/pattern-compare.md`.
