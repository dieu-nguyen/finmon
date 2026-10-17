# 0008. Named scan results are one combined list

Status: accepted
Date: 2026-10-11

## Context

Named scans already store a market run and a one-ticker run on `scan_run` and `scan_hit`. Both screens read those stored runs. Taking the newest ok run that covered a ticker made that run supply every pattern for the ticker. A later scan of one pattern dropped the other patterns, even though that run never checked them.

## Decision

Named results are one combined list. Both screens read it from `scan_run` and `scan_hit` only. The page does not replay bars. For each symbol and pattern, the latest ok named run that covered that pair is the result. A run covers a pair when `request.patterns` includes that pattern and the run covered that symbol. Coverage is the stored `request.compared` list when that list is present. Otherwise a subset run or a one-ticker run covers `request.tickers`. A market run with scope `all` that has no `compared` list covers only the tickers that have hits on that run, and does not walk the eligible universe. Freshness is applied when the scan is stored. A stored hit stays in that list until a later check of that pair replaces it. If that later run stored no hit for the pair, the pair is absent. A run that did not select the pattern does not change the pair. A failed run covers nothing. Look-alike stays separate: the latest ok run for that look-alike pattern only. The Scans match list can narrow the same list by state and by a right-edge session count, default 10. That narrowing does not remove the hit from the summary or from the database, and it still does not replay the universe.

## Consequences

The Scans page and the symbol Scan tab read this same list. Summary charts it with no filter. The match list can narrow by state (all, forming, or confirmed) and by a right-edge session count, default 10. The summary is not filtered. The page still does not replay the universe: the right-edge check counts `daily_bar` dates after the hit's anchor for those hit tickers only. Matches pages the narrowed list, 20 rows, newest run id first, then score, then ticker. The symbol Scan tab lists the pairs for that symbol. An empty combined list is an empty state. Build spec: `docs/pattern-compare.md`.
