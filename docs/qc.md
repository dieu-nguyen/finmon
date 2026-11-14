# Playwright QC

Live-screen check of the running app. Chromium clicks the same controls you do. It is not Vitest or pytest.

Runner: `./qc.sh`. Specs: `frontend/e2e`. Seed: `backend/qc/seed.py`.

---

## Run

```bash
./qc.sh
```

That resets `finmon_qc`, starts the API on **8010** and the web app on **5174**, then runs the six journeys. `start.sh` stays on 8000 / 5173 and the `finmon` database. The scheduler is off (`FINMON_TESTING=1`). DNSE and Telegram are not called.

Leave the stack up without running the tests:

```bash
./qc.sh --serve
```

The seed refuses any database whose name does not contain `qc`.

---

## Seeded world

As of **2026-09-28**. Ninety bars on VCB and HPG.

| Ticker | Name | Role |
| --- | --- | --- |
| VCB | Vietcombank | Stock, company cache, confirmed double bottom, look-alike reference |
| HPG | Hoa Phat | Stock, forming double bottom, look-alike match at 0.9100 |
| E1VFVN30 | VN30 ETF | Funds list |
| VNINDEX | VNIndex | Listed, not walked in the journeys |

Stored scans: look-alike pattern **Rise** (reference VCB), a market named run (HPG forming), and a one-ticker named run (VCB confirmed). Both named hits are double bottom.

---

## Journeys

Six specs, one worker, one shared QC database. They run in this order.

### Market — `frontend/e2e/market.spec.ts`

Lists seeded names, pins a row, opens the chart.

- Header wordmark and status pill (`ok`, `stale`, or `unconfigured`)
- Stocks shows VCB / Vietcombank
- Funds shows E1VFVN30 and hides the HOSE board filter
- Search `HPG` keeps Hoa Phat and drops Vietcombank
- Pin, then Unpin
- Click Vietcombank → `/symbol/VCB`, Market nav stays active

### Symbol — `frontend/e2e/symbol.spec.ts`

Opens VCB and uses the side panel.

- Quote name Vietcombank, chart frame, not the empty-bars state
- Company tab: Ngân hàng TMCP Ngoại thương Việt Nam, Revenue
- Note: save `QC thesis: hold VCB`
- Alert: price 92000, Add alert, Saved
- Scan tab: stored **Double bottom · Confirmed** is selected

Does not press Scan to score. It reads the seeded ticker run.

### Alerts — `frontend/e2e/alerts.spec.ts`

Creates and deletes through the live API.

- Add HPG, ≤, 26500, repeat
- Row shows HPG and repeat, form ticker clears
- Delete HPG, row gone

### Patterns — `frontend/e2e/patterns.spec.ts`

Catalog search and favorites. Favorites are browser storage, not the QC database.

- Double bottom is in the catalog
- Search `flag` keeps Bull flag and Bear flag, hides Double bottom
- Favorite Cup and handle; it sorts first
- Reload: Cup and handle still first

Does not press Scan on a card.

### Scans — `frontend/e2e/scans.spec.ts`

Reads stored named and look-alike hits, filters, opens Compare.

Named patterns:

- Pattern counts: Double bottom forming 1, confirmed 1, total 2
- HPG row: Double bottom, Forming, ticker and Chart links to `/symbol/HPG?pattern=double_bottom`, Chart `target=_blank`
- VCB row: Confirmed, link to `/symbol/VCB?pattern=double_bottom`
- Ticker search `HPG` keeps HPG and drops VCB

Look-alike:

- Rise is selected, reference VCB, Scan enabled
- Compare HPG → `/scans/{id}/compare/HPG`
- VCB (Reference), HPG (Match), score 0.9100, two chart cards
- Back link returns to `/scans`

Does not press Scan on either section.

### Drawings — `frontend/e2e/drawings.spec.ts`

Draws on the VCB daily chart and checks the drawings API.

- Horizontal: one click, Saved, one point stored
- Trend: two clicks, two points stored
- Reload: both drawings still there
- Delete selected, click the chart: trend gone, horizontal remains

---

## Not in QC

- Unit tests (`frontend` Vitest, `backend` pytest)
- Live DNSE quotes, Vnstock company fetch, Telegram
- Pressing Scan to run a named or look-alike job
- Right-edge, state, or pattern filters beyond the HPG ticker search
- Rectangle, fib, text, pin tools
- Indicator picker
- Gallery
- The normal `start.sh` stack
