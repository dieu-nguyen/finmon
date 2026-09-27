# Pattern compare

Accepted design, 2026-09-27. Not yet implemented.

UX is the first principle: performance and convenience. The screen opens a short stored list. It never walks the catalog in the browser.

Look-alike is the first method. The engine stays open to later methods.

This document supersedes the market-list stock board control ("All, HOSE, HNX, UPCOM, HCX") and the board-table row that counts HCX as stock (207 names). HCX stays the board code. Those names become `type=bond`. They are not a stock board, and they are not part of Stocks | Funds | Indices. The market list does not gain a bond browser in this slice. Look-alike does not walk bonds.

It also supersedes three product-design sentences that would build this slice wrong. The look-alike test "reference vs itself is rank 1": the reference is left out of the hit list. Section 3.3, "Same distance as shape patterns": kind `lookalike` is Pearson on min-max only. Section 2.6, "v1 Telegram is price alerts only", and "Alert on pattern hit" (section 3.4 and section 9): a successful scan sends one additional Telegram message. Price alerts stay as they are. Rule, shape, and the weekly schedule stay reserved.

---

## 1. Why

The page opens a stored list. The arithmetic is about 3,000 names × 90 closes. The job exists so that list is ready when the screen opens, and so the last bar is the official `dnse` bar.

A `source=quote` bar is built from sampled last prices. A `source=dnse` bar is the exchange OHLC. `docs/backfill-workflow.md` keeps those writers apart, and it removes the 16:30 history job from the API process. The scan runs after the backfill pass that is allowed to write today's official bar.

HCX is stored as stock. Section 2 moves those names to `type=bond`. Look-alike does not include them.

The product design (`docs/product-design.md`) has three methodologies: rule (AND of clauses), shape (a drawn line or a date range on a symbol), and look-alike. This slice implements look-alike only. The stored model and the job do not assume Pearson is the only scorer.

---

## 2. Bonds

HCX is the corporate-bond list: 207 names, stored today as `type=stock` because `classify_type` in `backend/app/clients/dnse.py` returns `stock` unless the payload looks like an ETF or an index. Names that have words are trái phiếu (public issues, and at least one convertible). Many rows are only the issue code (`BAB122030`, `VRE12007`). They are not shares.

Set `symbol.type` to `bond` where `board` is HCX. Do not rewrite the board code.

`classify_type` still checks ETF, then index. After those, it returns `bond` when the board is HCX or the payload contains `trái phiếu`. The next instrument ingest then writes the same type. A later backfill pass does not put these rows back under `stock`.

Stocks | Funds | Indices stay the market segments. The Stocks board control is All, HOSE, HNX, UPCOM. UPCOM still matches a stored board of `UPCOM` or `UPX`. HCX is not on that control. This slice adds no bond segment and no bond table.

---

## 3. Look-alike

A match uses the last 90 trading days of closes: 90 `daily_bar` rows, not 90 calendar days. `window_end` is the as-of date (the backfill target date for this run). `window_start` is the date of the oldest of those 90 rows.

Min-max each window to 0–1. The lowest close maps to 0. The highest close maps to 1. The price level drops out.

The score is the Pearson correlation of the two normalized lines, from −1 to 1. The default floor is 0.85. Keep the top 20 other names at or above the floor. The reference ticker is excluded before the floor and before the top-K cut, even though its correlation with itself is 1.

When the highest close equals the lowest close, the window is flat and Pearson is undefined. Skip it. Record it as not compared.

Higher score wins a scarce slot. An equal score keeps the ticker that sorts first.

Look-alike spec is three fields: reference ticker, minimum score, top K. Window length, min-max, and Pearson are the method. They are not spec fields. z-score and 1 − cosine are not spec fields on kind `lookalike`.

### Universe

A name is eligible when all of these hold:

| Check | Rule |
| --- | --- |
| Listed | `symbol.listed` |
| Type | `stock` or `etf` |
| Board | HOSE, HNX, UPCOM, or UPX. Stored UPX counts as UPCOM |
| History | At least 90 `daily_bar` rows on or before the as-of date |
| Official last bar | The row dated the as-of date exists and `daily_bar.source` is `dnse` |

Excluded even when the other checks would pass: `type=bond`, `type=index`, board HCX. A missing bar on the as-of date is not eligible. A bar on that date with `source=quote` is not eligible. A name backfill has not finished is skipped.

The run still completes. It stores how many names were eligible and how many were compared.

`eligible_count` is the names that pass the table. `compared_count` is how many of those names were passed to Pearson. A flat window is eligible and is not compared. The reference is not compared with itself, so it is not part of `compared_count`. When the reference is missing from the eligible set, or its own window is flat, no pair is scored and `compared_count` is 0.

---

## 4. When it runs

The scan follows a finished backfill pass that is allowed to include today. That is the target-end-date rule in `docs/backfill-workflow.md` section 4.2: at or after 16:30 ICT on a weekday, or a later catch-up, including a pass on Saturday or Sunday. `as_of` on the run is that target date.

`python -m app.jobs.backfill` runs the scan after that pass commits, including `--follow`. A weekday pass before 16:30 stops at the previous weekday and does not start a scan. A pass that exits early (lock held, missing keys, or auth failure) does not start a scan.

The scan reads `daily_bar`. It does not call DNSE. It does not run on page open. It is not added to the 30-minute API poll. The API process has no 16:30 history job for it to join.

Compute inside the job. Do not store the normalized series. Do not store indicator points. Pure Python over lists of closes, the same approach as `backend/app/indicators.py`. Do not add numpy or pandas for this slice.

---

## 5. Screen

The nav item is Scans. The design system already reserved that slot as "(Scans later)".

The page is a short list of saved patterns, and the selected pattern's latest successful hits. Columns: ticker, name, score, as-of (`window_end`). The header shows the reference ticker and that as-of date.

The hits on screen are that pattern's `scan_hit` rows from its newest `scan_run` with `status=ok`. A newer failed run leaves those hits in place, with their as-of date.

Empty when that pattern has no successful run yet, or its latest successful run has no hit at or above the floor. When the reference was not compared, the list is empty and the header says so.

Defining a pattern is a small form:

| Field | Starts at |
| --- | --- |
| Name | Required |
| Reference ticker | Required. Chosen from the capped search below |
| Minimum score | 0.85 |
| Top K | 20 |
| Enabled | On |

Window, min-max, and Pearson are fixed for this method and are not fields. The form saves kind `lookalike` and schedule `daily`. It does not offer `rule`, `shape`, `weekly`, or `both`. Saving creates the pattern or updates those fields. Saving does not start a run.

The reference field uses the same capped search as the market list. It calls `GET /api/symbols` only with a query, `limit` 50, and the same rank: ticker equals the query, then ticker starts with the query, then name contains the query. It asks for `type=stock` and `type=etf` only. It never requests the unfiltered catalog, and it does not widen to `bond` or `index`.

A hit opens a compare view. The reference is on the left. The match is on the right. Both charts are those same 90 sessions, from `window_start` through `window_end`. Each chart has its own price scale, in đồng. The score is in the header. That is the comparison. The list itself stays short. The compare read loads those two tickers' bars. It does not load the catalog.

There is no "scan now" button. A control on the page does not walk the catalog in the request.

---

## 6. Telegram

On a successful run, after that pattern's hits are stored, the scan job sends one message for the pattern. The message has the pattern name, the reference ticker, the as-of date, and each hit with its score. When scoring ran and nothing cleared the floor, the message is one line that says so, with that same name, reference, and date. When the reference was not compared, the message is one line that says so. That line is not a hit list.

A failed run sends no Telegram message. It must not look like a fresh hit list.

Price-alert Telegram stays as it is (`evaluate_alerts` and `TelegramSender`). This is an additional message from the scan job, using the same bot token and chat. It is not an `alert_delivery` row. If the send fails, the `ok` run and its hits stay.

---

## 7. Stored model

One engine. A method is a function: given the pattern spec and the prepared windows, it returns hit rows (ticker, score, window start, window end) or no match. The job loads bars once per eligible ticker, calls the method registered for `kind`, and writes hits. Adding a method does not change the job loop or the hit table.

### `pattern_def`

| Column | Meaning |
| --- | --- |
| `name` | Shown on the list, the header, and the Telegram message |
| `kind` | `lookalike` now. `rule` and `shape` are reserved |
| `spec` | JSON. Look-alike holds `reference`, `min_score`, `top_k` |
| `schedule` | `daily` now. `weekly` and `both` are reserved |
| `enabled` | Disabled patterns are stored, shown, and not scored |

A later kind puts its own parameters in `spec`. It does not need a new table. This job scores enabled patterns whose `schedule` is `daily`.

### `scan_run`

One row per enabled `daily` pattern in the pass. A pattern that clears nothing still gets an `ok` row, so the screen can tell "nothing above the floor" from "this pattern was not scored".

| Column | Meaning |
| --- | --- |
| `pattern` | The `pattern_def` this row scores |
| `started_at` | When scoring started |
| `finished_at` | When that pattern's scoring stopped |
| `status` | `ok` or `failed` |
| `eligible_count` | Names that met section 3 |
| `compared_count` | Names passed to Pearson for this pattern |
| `as_of` | Backfill target date. Hit `window_end` is this date |

Hits for that pattern are written only after its scoring finishes. Status becomes `ok` only after those hits are committed. On failure the row is `failed`, that run has no hits, and this pattern's previous `ok` run stays the one the screen reads. The next pattern in the pass still runs. The loop stays one load of bars, then one registered method per pattern.

### `scan_hit`

| Column | Meaning |
| --- | --- |
| `run` | The `scan_run` |
| `pattern` | The `pattern_def` |
| `ticker` | The other name. Never the reference, for look-alike |
| `score` | Pearson, from −1 to 1. A later yes/no rule stores 1 for a hit |
| `window_start` | Oldest session in the 90 |
| `window_end` | As-of date |

Same columns for every method. Do not invent a second hit table.

---

## 8. Later methods

These are extension points. They are not in this slice. Each one is a `kind` or a `schedule` the registry and the job already have a place for.

| Later | What it plugs into |
| --- | --- |
| Rule | `kind=rule`. Spec is an AND of clauses. The method computes close, SMA, ATR, and volume average from the window it was given. No stored indicator series. A hit stores score 1. No match returns no row |
| Shape | `kind=shape`. Spec is a template of length ≤ 90 — a drawn polyline, or a historical range such as HPG between two dates — and a minimum score. Same normalize-and-score slot, different spec |
| Other similarity | z-score, and 1 − cosine, as spec fields on a future method. Look-alike's spec does not offer them |
| Weekly | `schedule` `weekly` or `both`. This job does not select them |
| Bonds or indices | Not loaded into the prepared windows |

The look-alike function stays Pearson on min-max. A new similarity does not become a switch on kind `lookalike`.

---

## 9. Tests

- Two identical normalized series score about 1. A reversed series is below 0.85. The reference ticker is not in its own hits.
- A flat candidate is skipped.
- A symbol stored as HCX / `type=bond` is not eligible. An index is not eligible. An ETF with 90 `dnse` bars is eligible.
- A window whose newest bar is `source=quote` is not eligible.
- A failed run leaves the previous hits queryable.
- Kind `lookalike` is dispatched through the method registry. The job does not call Pearson directly.

---

## 10. Out of scope

- A "scan now" button, or any request that walks the catalog to score it.
- numpy or pandas.
- Stored normalized series, or a table of indicator points for the scan.
- A bond browser on the market list, or a rewrite of the HCX board code.
- Rule forms, shape drawing, and a weekly run.
- Changing price-alert delivery.
