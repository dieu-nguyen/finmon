# 0006. Named patterns are their own scan kind

Status: accepted
Date: 2026-10-04

## Context

Look-alike scores the last 90 closes against a reference ticker with Pearson. Double bottom, double top, head and shoulders, and inverse head and shoulders are rules on one ticker's own swings. A reference correlation does not detect them.

## Decision

Named patterns are a separate scan kind (`named`). The saved scan stores the pattern name. The method reads that ticker's daily high, low, and close, marks swing highs and lows, and tests the last swings against that pattern's rule. It does not call Pearson and it has no reference ticker. Hits use the same run and hit tables. The method registry stays the extension point. The first build is those four patterns. A hit is forming or confirmed. The price band, swing width, score floor, and cap stay open.

## Consequences

Look-alike stays 90 closes, min-max, Pearson, floor 0.85, top 20, reference excluded. Triangles, flags, and cup and handle are later names on this same kind. Build spec: `docs/pattern-compare.md`. The named-pattern method is not built yet.
