# 0010. Each scan section opens with its summary

Status: accepted
Date: 2026-10-17

## Context

Named results are already one combined list (`docs/adr/0008-mixed-scan-results.md`). The Scans page still had to show that list, the look-alike hits, and the control that starts each scan, without a second section for the control.

## Decision

Named patterns is one section. Look-alike is its own section. Each section opens with its summary chart, then the scan action on one row, then the hit list. There is no shared summary band.

The named chart is forming and confirmed counts for hits whose anchor is within that section's Right edge session count. The control defaults to 10 and is shared with the named match list. Pattern, ticker, and state narrow the match list only. The look-alike chart uses that section's own Right edge control, also default 10, and that same count narrows the look-alike hit list. Look-alike has no forming or confirmed filter.

Search and 20-row pages are the body, newest run first. The scan control is one row inside the section, not its own section.

Each named match row shows the run finish time in Asia/Ho_Chi_Minh.

## Consequences

The summary chart and the list in a section agree on the right-edge session count. Other match filters do not move the chart. The page still reads stored hits and counts sessions from `daily_bar` for those tickers only. Build spec: `docs/pattern-compare.md`.
