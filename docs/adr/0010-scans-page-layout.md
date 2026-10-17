# 0010. Scans opens with one summary and one section per scan

Status: accepted
Date: 2026-10-17

## Context

Named results are already one combined list (`docs/adr/0008-mixed-scan-results.md`). The Scans page still had to show that list, the look-alike hits, and the control that starts each scan, without a second section for the control.

## Decision

Scans opens with one summary band, two panels. The left panel is named-pattern forming and confirmed counts for the full current list. The right panel is the latest look-alike summary: match count and score spread. Match search does not change the summary.

Each scan type is one section. Search and 20-row pages are the body, newest run first. The scan control is one row inside the section, not its own section. Look-alike uses that same shape.

Each match row shows the run finish time in Asia/Ho_Chi_Minh.

## Consequences

The summary stays the full current list while the tables page. Build spec: `docs/pattern-compare.md`.
