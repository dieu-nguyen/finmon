# 0006. Named patterns are their own scan kind

Status: accepted
Date: 2026-10-04

## Context

Look-alike scores the last 90 closes against a reference ticker with Pearson. Double bottom, double top, head and shoulders, and inverse head and shoulders are rules on one ticker's own swings. A reference correlation does not detect them.

## Decision

Named patterns are a separate scan kind (`named`). The saved scan stores the pattern name. The method reads that ticker's daily high, low, and close, marks swing highs and lows, and tests the last swings against that pattern's rule. It does not call Pearson and it has no reference ticker. Hits use the same run and hit tables. The method registry stays the extension point. The first build is those four patterns. A hit is forming or confirmed. The price band, swing width, score floor, and cap stay open.

The first four look back 90 sessions for the swings of the current pattern. That window is not a search of every stretch inside it. Freshness is separate: the last 10 trading sessions, about two calendar weeks. Forming: the swings are in place, price has not left the neckline, and the pattern is still inside those 10 sessions. Confirmed: a close has broken the neckline, and that break falls within the last 10 trading sessions. A pattern from the previous week still matches. A pattern that ended about a month ago, including one that sits only from T-60 to T-30, does not. Older bars in the 90 may be read while building the current pattern. They are not their own match. Missing the day the pattern formed does not drop it. The next run reads the stored daily bars after backfill.

The same match rule, including that 10-session freshness, runs in two directions. The market scan is one saved pattern across many tickers. A check from one ticker tests that ticker against the four patterns. The two views use the same rule, so they do not disagree.

## Consequences

Look-alike stays the last 90 closes, min-max, Pearson, floor 0.85, top 20, reference excluded. The named-pattern 90 is a lookback for the current pattern, not a second Pearson window. Freshness of the last swing or the confirming close is 10 trading sessions. Triangles, flags, and cup and handle are later names on this same kind. The one-ticker check is accepted and not built. Build spec: `docs/pattern-compare.md`. The named-pattern method is not built yet.
