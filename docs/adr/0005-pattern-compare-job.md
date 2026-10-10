# 0005. Pattern compare runs after the official bar

Status: accepted
Date: 2026-09-28

The automatic-after-backfill schedule in this decision is superseded by `docs/adr/0007-manual-pattern-scans.md`. The method below still stands: 90 closes, min-max, Pearson, reference excluded, top 20, floor 0.85, one Telegram message, and a failed run keeps the previous hits. Both scan kinds now run only when the user triggers them.

## Context

Scoring thousands of names when the page opens, or on the 30-minute poll, would walk the catalog in the request. A `source=quote` bar is sampled last prices, not the exchange OHLC.

## Decision

Pattern compare runs as a job after the backfill pass that includes the official daily bar. It does not run when the page opens and not on the 30-minute poll. First method is look-alike: 90 closes, min-max, Pearson, reference excluded, top 20, floor 0.85. A hit opens a side-by-side chart. A successful run sends one Telegram message. The engine is a method registry (`lookalike` now; `rule` and `shape` reserved) with one hit table. A failed run keeps the previous hits and sends no hit-list message.

## Consequences

Scans opens a short stored list. Price-alert Telegram stays on last-price rules. Rules, shapes, and a weekly schedule are reserved. Build spec: `docs/pattern-compare.md`.
