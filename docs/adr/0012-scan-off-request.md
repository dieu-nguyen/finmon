# 0012. A market scan returns before scoring finishes

Status: accepted
Date: 2026-10-17

## Context

A market named scan and a look-alike scan walk the eligible names. Holding the API request until that score finishes blocks the process that also serves the page.

## Decision

A market named scan and a look-alike scan store an accepted run and return that run id immediately. Scoring continues on a background thread and writes the same `scan_run` / `scan_hit` rows.

A one-ticker scan stays on the request.

Backfill stays its own process (`docs/adr/0001-backfill-process.md`). A scan does not hold the API request.

## Consequences

The screen can show the accepted run while hits are still being written. Manual trigger stays `docs/adr/0007-manual-pattern-scans.md`. Build spec: `docs/pattern-compare.md`.
