# 0006. Named patterns are their own scan kind

Status: accepted
Date: 2026-10-04

## Context

Look-alike scores the last 90 closes against a reference ticker with Pearson. Double bottom, double top, head and shoulders, and inverse head and shoulders are rules on one ticker's own swings. A reference correlation does not detect them.

## Decision

Named patterns are a separate scan kind (`named`). The saved scan stores the pattern name. The method reads that ticker's daily high, low, and close, marks swing highs and lows, and tests the last swings against that pattern's rule. It does not call Pearson and it has no reference ticker. Hits use the same run and hit tables. The method registry stays the extension point. The first build is those four patterns. A hit is forming or confirmed. A swing is a strict extreme over five bars on the left and up to five on the right. Inside the last five sessions the right side uses only the bars that exist. The two bottoms, tops, or shoulders must sit within 3% (difference divided by the higher price). The head must clear the higher shoulder by at least 3%, or sit at least 3% below the lower shoulder for the inverse. The score runs from 0 to 1. The floor is 0.70. The market scan keeps at most 20 hits. The one-ticker check keeps at most one hit per pattern.

The first four look back 90 sessions for the swings of the current pattern. That window is not a search of every stretch inside it. Freshness is separate: the last 10 trading sessions, about two calendar weeks. Forming: the swings are in place, price has not left the neckline, and the pattern is still inside those 10 sessions. Confirmed: a close has broken the neckline, and that break falls within the last 10 trading sessions. A pattern from the previous week still matches. A pattern that ended about a month ago, including one that sits only from T-60 to T-30, does not. Older bars in the 90 may be read while building the current pattern. They are not their own match. Missing the day the pattern formed does not drop it. The next run reads the stored daily bars after backfill.

The same match rule, including that 10-session freshness, runs in two directions. The market scan scores the patterns you select across a ticker scope. A check from one ticker scores the patterns you select on that ticker. The two views use the same rule, so they do not disagree.

Named scans are manual. The backfill hook still runs look-alike after a pass that may include today, with the same numbers and schedule. It does not run a named scan. The 30-minute poll does not run one either. Opening a symbol does not score. You trigger a run from a searchable multi-select of the catalog. A one-ticker check scores only the selected patterns on that ticker and stores the run. A market scan scores only the selected patterns. Ticker scope defaults to every eligible name and can be a subset. Both triggered runs are stored on `scan_run` and `scan_hit`, including the patterns and the ticker scope that were requested. Reopening the page reads that stored result. A successful market run sends one Telegram message. The one-ticker check sends none.

## Consequences

Look-alike stays automatic: the last 90 closes, min-max, Pearson, floor 0.85, top 20, reference excluded, after a backfill pass that may include today. Named scans stay manual, with pattern multi-select, ticker scope, and a stored run for both the market scan and the one-ticker check. The named-pattern 90 is a lookback for the current pattern, not a second Pearson window. Freshness of the last swing or the confirming close is 10 trading sessions. The named-pattern floor is 0.70 and the market-scan cap is 20. Triangles, flags, and cup and handle are later names on this same kind. The one-ticker check is built on the same match rule. Build spec: `docs/pattern-compare.md`. The named-pattern method is built.
