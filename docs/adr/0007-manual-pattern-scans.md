# 0007. Both pattern scans are manual

Status: accepted
Date: 2026-10-06

## Context

Look-alike was scheduled after the backfill pass that writes the official daily bar (`docs/adr/0005-pattern-compare-job.md`). Named patterns were already manual (`docs/adr/0006-named-pattern-scan.md`). Scoring the universe at the end of backfill, or on the 30-minute poll, walks every eligible name without a request to scan.

## Decision

Both scan kinds run only when the user triggers them.

Look-alike runs when the user presses Scan on the Scans page, for the one saved pattern that is selected. It does not run after backfill. It does not run on the 30-minute job. It does not run when the page opens. The method is unchanged: last 90 closes, min-max, Pearson, floor 0.85, top 20, reference required and excluded from hits, the same universe, no DNSE call. A successful run sends one Telegram message. A failed run keeps the previous ok hits. There is no pattern multi-select and no ticker subset on look-alike.

Named scans stay manual. The user picks patterns from a multi-select. A market scan covers all eligible names or a subset. A one-ticker check scores only that ticker. Both runs are stored. The one-ticker check sends no Telegram. A successful named market run sends one.

The one-ticker check lives on the Scan tab of the symbol side panel. The tab order is Company, Note, Alert, then Scan. Scan is last. Company stays the tab that loads when the symbol opens. The pattern picker and the scan results are not placed above the chart. Opening the symbol or the Scan tab shows the last stored result and does not scan. When that tab has a stored or just-triggered match, the daily price pane draws that pattern's swing points and neckline, anchored to date and price. If several patterns match, the chart draws the one selected on the Scan tab. The highest score is selected by default. A symbol opened from a market-scan hit shows that hit until the user selects another result on the Scan tab. Changing indicators, pan, and zoom keeps the marks. Drawings the user made stay. No match removes only the pattern marks.

## Consequences

ADR 0005 is superseded only for the automatic-after-backfill schedule. The look-alike method in that decision still stands. Build spec: `docs/pattern-compare.md`.
