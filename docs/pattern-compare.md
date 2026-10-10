# Pattern compare

Build spec for pattern compare in `docs/product-design.md`.
Decisions: `docs/adr/0004-hcx-bonds.md`, `docs/adr/0005-pattern-compare-job.md`, and `docs/adr/0006-named-pattern-scan.md`.

Look-alike is built. Named patterns are built.

UX is the first principle: performance and convenience. The screen opens a short stored list. It never walks the catalog in the browser.

Look-alike is the first method. Named patterns sit beside it. The engine stays open to later methods.

This document supersedes the market-list stock board control ("All, HOSE, HNX, UPCOM, HCX") and the board-table row that counts HCX as stock (207 names). HCX stays the board code. Those names become `type=bond`. They are not a stock board, and they are not part of Stocks | Funds | Indices. The market list does not gain a bond browser in this slice. Look-alike does not walk bonds. A named-pattern scan skips them too.

It also supersedes three product-design sentences that would build this slice wrong. The look-alike test "reference vs itself is rank 1": the reference is left out of the hit list. Section 3.3, "Same distance as shape patterns": kind `lookalike` is Pearson on min-max only. Section 2.6, "v1 Telegram is price alerts only", and "Alert on pattern hit" (section 3.4 and section 9): a successful scan sends one additional Telegram message. Price alerts stay as they are. Rule, shape, and the weekly schedule stay reserved.

---

## 1. Why

The page opens a stored list. The arithmetic is about 3,000 names × 90 closes. The job exists so that list is ready when the screen opens, and so the last bar is the official `dnse` bar.

A `source=quote` bar is built from sampled last prices. A `source=dnse` bar is the exchange OHLC. `docs/backfill-workflow.md` keeps those writers apart, and it removes the 16:30 history job from the API process. The look-alike scan runs after the backfill pass that is allowed to write today's official bar. A named-pattern scan runs only when you trigger it.

HCX is stored as stock. Section 2 moves those names to `type=bond`. Look-alike does not include them. A named-pattern scan skips them too.

The product design (`docs/product-design.md`) has look-alike, named patterns, and two reserved methodologies: rule (AND of clauses) and shape (a drawn line or a date range on a symbol). Look-alike is built. Named patterns are specified in section 4 and are built. The stored model and the job do not assume Pearson is the only scorer.

---

## 2. Bonds

HCX is the corporate-bond list: 207 names, stored today as `type=stock` because `classify_type` in `backend/app/clients/dnse.py` returns `stock` unless the payload looks like an ETF or an index. Names that have words are trái phiếu (public issues, and at least one convertible). Many rows are only the issue code (`BAB122030`, `VRE12007`). They are not shares.

Set `symbol.type` to `bond` where `board` is HCX. Do not rewrite the board code.

`classify_type` still checks ETF, then index. After those, it returns `bond` when the board is HCX or the payload contains `trái phiếu`. The next instrument ingest then writes the same type. A later backfill pass does not put these rows back under `stock`.

Stocks | Funds | Indices stay the market segments. The Stocks board control is All, HOSE, HNX, UPCOM. UPCOM still matches a stored board of `UPCOM` or `UPX`. HCX is not on that control. This slice adds no bond segment and no bond table.

---

## 3. Look-alike

Built. The numbers in this section are locked.

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

## 4. Named patterns

Built. The numbers in this section are locked. Look-alike's floor 0.85 and top 20 stay on look-alike.

A named pattern is a rule on one ticker's own daily bars. The saved scan stores the pattern name. Kind is `named`. The method registry dispatches that kind. The method does not call Pearson. There is no reference ticker.

You trigger it. It does not run from the backfill hook, the 30-minute poll, or opening a symbol. The run is stored on the same run and hit tables, including which patterns and which ticker scope you asked for. Section 5 is the timing. This section is the rule.

### First build

These four are the first build. Each name is one value of `spec.pattern` on kind `named`.

| Pattern | `spec.pattern` | Rule |
| --- | --- | --- |
| Double bottom | `double_bottom` | Two lows at nearly the same price, with a peak between them. The swings are low, rally, low. The two lows sit in a small price band. The rally between them is the neckline. The last swing, or the confirming close, falls in the last 10 trading sessions. |
| Double top | `double_top` | Two highs at nearly the same price, with a trough between them. The swings are high, decline, high. The two highs sit in a small price band. The trough between them is the neckline. The last swing, or the confirming close, falls in the last 10 trading sessions. |
| Head and shoulders | `head_and_shoulders` | Three highs. The middle one is clearly higher. The two shoulders are close in price. The swings are shoulder, trough, higher head, trough, shoulder. The neckline runs through the two troughs. The last swing, or the confirming close, falls in the last 10 trading sessions. |
| Inverse head and shoulders | `inverse_head_and_shoulders` | Three lows. The middle one is clearly lower. The two shoulders are close in price. The swings are shoulder, peak, lower head, peak, shoulder. The neckline runs through the two peaks. The last swing, or the confirming close, falls in the last 10 trading sessions. |

The Patterns page introduces this catalog: the shape, a schematic of the ideal form, and how to read the neckline, forming versus confirmed, and a close through the neckline. Favorites pin to the top. The score on each card is a teaching rank for how often the pattern is taught. Scan on that page runs only for the four built patterns. It starts the same manual market scan as Scans, for that one pattern on all eligible tickers. Triangles, flags, cup and handle, wedges, and rounding bottom stay on the page with Scan disabled.

### Later names

Same kind. Not in the first build.

| Pattern | `spec.pattern` | Rule |
| --- | --- | --- |
| Ascending triangle | `ascending_triangle` | Flat highs, rising lows |
| Descending triangle | `descending_triangle` | Flat lows, falling highs |
| Symmetrical triangle | `symmetrical_triangle` | Highs falling and lows rising |
| Bull flag | `bull_flag` | A sharp rise, then a short downward drift |
| Bear flag | `bear_flag` | A sharp drop, then a short upward drift |
| Cup and handle | `cup_and_handle` | A rounded decline and recovery, then a small dip. Needs more than 90 sessions |

Cup and handle uses a longer window than the first four. That length is still open.

### Freshness

The 90 sessions are how far back the detector may look for the swings of the current pattern. They are not a search through every stretch inside those 90 sessions. Freshness is a separate count.

The right edge is the last 10 trading sessions, about two calendar weeks. The last swing of a forming pattern falls in those 10 sessions. The confirming close of a confirmed pattern falls in those 10 sessions. The market scan and the one-ticker check use this same rule.

A pattern from the previous week still matches when you open finmon this week. A pattern that ended about a month ago does not. A pattern that sits only from T-60 to T-30 does not.

Older bars inside the 90 may be read while building the current pattern. They are not reported as their own match.

Missing the day the pattern formed does not drop it. The next run reads stored daily bars after backfill.

Forming: the swings are in place, price has not left the neckline, and the pattern is still current inside those 10 sessions. Confirmed: a close has broken the neckline, and that break falls within the last 10 trading sessions.

### Locked numbers

A swing high is strictly the highest high of five bars on the left and up to five on the right. A swing low is the same rule on the low. Inside the last five sessions the right side uses only the bars that exist, including none, so a pattern whose last swing falls there can still match.

The two bottoms, two tops, or two shoulders must sit within 3% of each other. The gap is the difference divided by the higher price. A wider gap is not a match. The pair component of the score is 1 when the two prices are equal and 0 when the gap is 3%.

The head must clear the higher shoulder by at least 3%. Inverse head and shoulders: the head must sit at least 3% below the lower shoulder. The head component is 0 at that 3% minimum and 1 when the head clears the shoulder by 6% or more. A smaller head is not a match.

Double top and double bottom use the pair component. Head and shoulders and the inverse use the average of the pair component and the head component. The score runs from 0 to 1. A perfect pair and a clear head score 1. The floor is 0.70. Below that, no hit. A double top or double bottom clears the floor when the gap is at most 0.9% of the higher price. Equal shoulders clear it when the head is at least 4.2% beyond the shoulder used for prominence.

The market scan keeps at most 20 hits for each selected pattern, highest score first. An equal score keeps the ticker that sorts first. The one-ticker check returns each selected pattern that clears 0.70, and at most one hit per pattern: the best current one. An equal score on that ticker keeps the later last swing. Patterns you did not select are not scored.

### Flow

You pick one or more names from the catalog, then press Scan. The catalog is the shared list in section 4, not a separate set of buttons. For that run the market scan:

1. Walk the ticker scope. The default is every listed stock and ETF on HOSE, HNX, and UPCOM that has enough daily bars. Stored UPX counts as UPCOM. You can switch to a subset and pick those tickers. Names outside the subset are not loaded. Skip bonds, HCX, indices, and futures (`type=futures`).
2. Read the last 90 sessions of daily high, low, and close. Closes alone are not enough. Those 90 sessions are the lookback for the current pattern. Freshness is the last 10 trading sessions. The price band is 3%. The swing width is five bars.
3. Mark swing highs and swing lows with the five-bar rule in Locked numbers, including the shorter right side at the edge of the window.
4. Test the last swings against each selected pattern's rule. A double bottom is low, rally, low. Head and shoulders is five swings: shoulder, trough, higher head, trough, shoulder. Each pattern has its own rule in the tables above. A name that does not have those swings is not a hit. A pattern whose last swing, or whose confirming close, falls outside the last 10 trading sessions is not a hit.
5. Score the fit from 0 to 1, as in Locked numbers. Even tops or bottoms score higher. A head that barely sticks out scores lower. Keep hits at or above 0.70. The market scan stores at most 20, highest score first.
6. Save the run, the patterns you selected, the ticker scope, and each hit with the ticker, the date window, the score, and the swing dates and prices. `window_start` is the date of the earliest swing in the match. `window_end` is the as-of date. The chart draws those points on that ticker. There is no reference ticker.
7. A hit is forming or confirmed. Forming: the swings are in place, price has not left the neckline, and the pattern is still current inside the last 10 trading sessions. Confirmed: a close has broken the neckline, and that break falls within the last 10 trading sessions. For a double bottom that close is above the peak. For a double top it is below the trough. For head and shoulders it is below the neckline through the two troughs. For inverse head and shoulders it is above the neckline through the two peaks. The list shows which.
8. One Telegram message for a successful run. Section 7.

A name is eligible when it is listed, `type` is `stock` or `etf`, the board is HOSE, HNX, UPCOM, or UPX, it has at least 90 `daily_bar` rows on or before the as-of date, and the bar on the as-of date exists with `daily_bar.source` `dnse`. Excluded when the other checks would pass: `type=bond`, `type=index`, `type=futures`, board HCX. A missing bar on the as-of date is not eligible. A bar on that date with `source=quote` is not eligible.

The run still completes. `eligible_count` is the names that pass that list. `compared_count` is how many of those names were tested against the rule.

### One ticker

Built.

The market scan is the patterns you selected across the ticker scope. From a ticker, you ask the other way: which of the selected patterns that ticker has.

Opening the ticker does not score. The page shows the last stored check for that ticker, or an empty state when there is none. Scan reads that ticker's last 90 sessions of high, low, and close, through the official bar on the as-of date. It tests only the patterns you selected, with the 10-session freshness rule. It stores the run and returns each match with the pattern name, forming or confirmed, the score, and the swing dates and prices. The chart draws those points on that ticker. A later open reads those stored rows and does not score again.

The check and the market scan call the same match rule. A stretch that matches in one view matches in the other when that pattern was selected. A pattern from the previous week matches in both. A stretch that sits only from T-60 to T-30 matches in neither.

The check does not walk other tickers. It does not call Pearson. It does not send Telegram. It is stored on the same run and hit tables. It does not write a second hit table.

### Still open

Look-alike's floor 0.85 and top 20 are not this method's floor or cap. The first four read the last 90 sessions as lookback. Freshness is the last 10 trading sessions. The price band, the five-bar swing, the 0.70 floor, and the cap of 20 are locked above.

- The cup-and-handle window. It needs more than 90 sessions, and it is not in the first build.
- Confirmation for the later names. Forming and confirmed above apply to the first four, which have a neckline.

Look-alike spec fields (`reference`, `min_score`, `top_k`) are not fields on kind `named`.

---

## 5. When it runs

Look-alike follows a finished backfill pass that is allowed to include today. That is the target-end-date rule in `docs/backfill-workflow.md` section 4.2: at or after 16:30 ICT on a weekday, or a later catch-up, including a pass on Saturday or Sunday. `as_of` on the look-alike run is that target date.

`python -m app.jobs.backfill` runs look-alike after that pass commits, including `--follow`. A weekday pass before 16:30 stops at the previous weekday and does not start a look-alike scan. A pass that exits early (lock held, missing keys, or auth failure) does not start a look-alike scan.

Look-alike reads `daily_bar`. It does not call DNSE. It does not run on page open. It is not added to the 30-minute API poll. The API process has no 16:30 history job for it to join.

Enabled `daily` look-alike patterns run in this same pass. A named pattern does not. Named scans are not a second job and they are not part of this pass.

A named scan runs when you press Scan. The market scan and the one-ticker check both read stored `daily_bar` rows. Neither calls DNSE. Neither runs because a page opened. Neither is on the 30-minute poll. The as-of date is the latest official `dnse` bar in the requested scope.

Compute inside the run. Do not store the normalized series. Do not store indicator points. Look-alike loads each eligible ticker once, reads the closes, pure Python, the same approach as `backend/app/indicators.py`. A named scan loads each ticker in its scope once and reads high, low, and close from that load. Do not add numpy or pandas.

---

## 6. Screen

The nav item is Scans. The design system already reserved that slot as "(Scans later)".

The page is a short list of saved patterns, and the selected pattern's latest successful hits. Columns: ticker, name, score, as-of (`window_end`). For look-alike, the header shows the reference ticker and that as-of date.

The hits on screen are that pattern's `scan_hit` rows from its newest `scan_run` with `status=ok`. A newer failed run leaves those hits in place, with their as-of date.

Empty when that pattern has no successful run yet, or its latest successful run has no hit at or above the floor. For look-alike, when the reference was not compared, the list is empty and the header says so.

### Look-alike

Defining a pattern is a small form:

| Field | Starts at |
| --- | --- |
| Name | Required |
| Reference ticker | Required. Chosen from the capped search below |
| Minimum score | 0.85 |
| Top K | 20 |
| Enabled | On |

Window, min-max, and Pearson are fixed for this method and are not fields. The form saves kind `lookalike` and schedule `daily`. It does not offer `named`, `rule`, `shape`, `weekly`, or `both`. Saving creates the pattern or updates those fields. Saving does not start a run.

The reference field uses the same capped search as the market list. It calls `GET /api/symbols` only with a query, `limit` 50, and the same rank: ticker equals the query, then ticker starts with the query, then name contains the query. It asks for `type=stock` and `type=etf` only. It never requests the unfiltered catalog, and it does not widen to `bond` or `index`.

A hit opens a compare view. The reference is on the left. The match is on the right. Both charts are those same 90 sessions, from `window_start` through `window_end`. Each chart has its own price scale, in đồng. The score is in the header. That is the comparison. The list itself stays short. The compare read loads those two tickers' bars. It does not load the catalog.

There is no "scan now" button for look-alike. A look-alike control on the page does not walk the catalog in the request.

### Named pattern

The Scans page has a named-pattern run beside look-alike. You pick patterns from a searchable multi-select of the catalog. Ticker scope starts at all eligible names. You can switch to a subset and pick tickers with a searchable multi-select. Scan stays disabled until at least one pattern is selected. Subset mode stays disabled until at least one ticker is selected. All-tickers mode does not ask you to pick names.

Scan scores only those patterns on that scope. The page then shows that stored run: the patterns, the scope, and the hits. Columns add the pattern, and forming or confirmed. The header shows those patterns and the as-of date. It does not show a reference ticker.

Empty when there is no successful named run yet, or the latest successful run stored no hit above the floor. There is no "reference was not compared" state. Opening the page reads the stored run and does not scan again.

The floor is 0.70 and the cap is 20 hits per pattern (section 4). The control does not ask for a reference ticker, a minimum score, or a top K.

A hit opens that ticker's daily chart for the date window and draws the saved swing points and the neckline. There is no second chart. The points come from the hit. They are not a user drawing. Switching indicators leaves the marks in place.

From a ticker, the same catalog is a searchable multi-select. Scan scores only the selected patterns on that ticker and stores the run. Opening the ticker shows the last stored check, or an empty state when there is none. It does not score on open. Same rules and the same 10-session freshness as the market scan. The chart draws the swing points and the neckline on that ticker. The check does not walk other tickers. An empty list is an empty state, not an error.

---

## 7. Telegram

On a successful look-alike run, after that pattern's hits are stored, the scan job sends one message for the pattern. The message has the pattern name, the reference ticker, the as-of date, and each hit with its score. When scoring ran and nothing cleared the floor, the message is one line that says so, with that same name, reference, and date. When the reference was not compared, the message is one line that says so. That line is not a hit list.

A named market run you triggered sends one message after that run's hits are stored. The message has the as-of date and each hit with its score, whether it is forming or confirmed, and the pattern. When the rule ran and nothing cleared the floor, the message is one line that says so, with that date. The message has no reference ticker. The one-ticker check sends no Telegram message.

A failed run sends no Telegram message. It must not look like a fresh hit list. A failed send leaves the `ok` run in place. The named message is not an `alert_delivery` row.

Price-alert Telegram stays as it is (`evaluate_alerts` and `TelegramSender`). This is an additional message from the scan job, using the same bot token and chat. It is not an `alert_delivery` row. If the send fails, the `ok` run and its hits stay.

---

## 8. Stored model

One engine. A method is a function: given the pattern spec and the prepared bars, it returns hit rows or no match. Look-alike loads bars once per eligible ticker, calls the method registered for `kind`, and writes hits. Kind `named` is one more function in that registry. A triggered named run calls it once per selected pattern. Adding it does not add a run table or a hit table.

### `pattern_def`

| Column | Meaning |
| --- | --- |
| `name` | Shown on the list, the header, and the Telegram message |
| `kind` | `lookalike` is built. `named` is the manual scan kind. `rule` and `shape` are reserved |
| `spec` | JSON. Look-alike holds `reference`, `min_score`, `top_k`. A saved named row is not what the scan runs |
| `schedule` | `daily` now, for look-alike. `weekly` and `both` are reserved |
| `enabled` | Disabled look-alike patterns are stored, shown, and not scored |

A later kind puts its own parameters in `spec`. It does not need a new table. This job scores enabled look-alike patterns whose `schedule` is `daily`. It does not score named patterns.

### `scan_run`

One row per enabled `daily` look-alike pattern in the pass. A user-triggered named scan is also one row, for the whole selection, not one row per pattern and not a row from the backfill pass. A run that clears nothing still gets an `ok` row, so the screen can tell "nothing above the floor" from "this was not scored". The named row's `request` records the pattern names and the ticker scope (`all`, or `subset` plus the tickers, or the one ticker). Reopening the page reads the newest `ok` row for that mode.

| Column | Meaning |
| --- | --- |
| `pattern` | The `pattern_def` this row scores |
| `started_at` | When scoring started |
| `finished_at` | When that pattern's scoring stopped |
| `status` | `ok` or `failed` |
| `eligible_count` | Names that met that method's universe. Section 3 for look-alike. Section 4 for a named pattern |
| `compared_count` | Look-alike: names passed to Pearson. Named pattern: names tested against the rule |
| `as_of` | Look-alike: backfill target date. Named: latest official bar in the requested scope. Hit `window_end` is this date |
| `request` | Named runs only. Pattern names and ticker scope. Look-alike leaves this empty |

Hits for that pattern are written only after its scoring finishes. Status becomes `ok` only after those hits are committed. On failure the row is `failed`, that run has no hits, and this pattern's previous `ok` run stays the one the screen reads. The next pattern in the pass still runs. The loop stays one load of bars, then one registered method per pattern.

### `scan_hit`

| Column | Meaning |
| --- | --- |
| `run` | The `scan_run` |
| `pattern` | The `pattern_def` |
| `ticker` | The matched name. For look-alike, never the reference |
| `score` | Look-alike: Pearson, from −1 to 1. Named pattern: fit of the swings, from 0 to 1, floor 0.70. Even tops or bottoms score higher. A head that barely sticks out scores lower. A later yes/no rule stores 1 for a hit |
| `window_start` | Look-alike: oldest session in the 90. Named pattern: date of the earliest swing in the match |
| `window_end` | As-of date |
| `swings` | Named pattern: the swing dates and prices, in the order the rule names them, plus the neckline endpoints. Look-alike leaves this empty |
| `state` | Named pattern: `forming` or `confirmed`. Look-alike leaves this empty |

Shared columns stay on the one hit table. Do not invent a second hit table.

---

## 9. Later methods

These are extension points. Rule, shape, other similarity, and the weekly schedule are not in the current build. Further named patterns plug into kind `named` (section 4) and are not in the first named-pattern build.

| Later | What it plugs into |
| --- | --- |
| More named patterns | Same kind `named`, new `spec.pattern` values. Ascending triangle, descending triangle, symmetrical triangle, bull flag, bear flag, cup and handle. Section 4 |
| Rule | `kind=rule`. Spec is an AND of clauses. The method computes close, SMA, ATR, and volume average from the window it was given. No stored indicator series. A hit stores score 1. No match returns no row |
| Shape | `kind=shape`. Spec is a template of length ≤ 90 — a drawn polyline, or a historical range such as HPG between two dates — and a minimum score. Same normalize-and-score slot, different spec |
| Other similarity | z-score, and 1 − cosine, as spec fields on a future method. Look-alike's spec does not offer them |
| Weekly | `schedule` `weekly` or `both`. This job does not select them |
| Bonds, indices, or futures | Not loaded into the prepared windows |

The look-alike function stays Pearson on min-max. A new similarity does not become a switch on kind `lookalike`. A new chart pattern does not become a switch on kind `lookalike`. It is another `spec.pattern` on kind `named`, or a later kind of its own.

---

## 10. Tests

Look-alike (built):

- Two identical normalized series score about 1. A reversed series is below 0.85. The reference ticker is not in its own hits.
- A flat candidate is skipped.
- A symbol stored as HCX / `type=bond` is not eligible. An index is not eligible. An ETF with 90 `dnse` bars is eligible.
- A window whose newest bar is `source=quote` is not eligible.
- A failed run leaves the previous hits queryable.
- Kind `lookalike` is dispatched through the method registry. The job does not call Pearson directly.

Named patterns:

- Kind `named` is dispatched through the method registry. The method does not call Pearson. The pattern has no reference ticker.
- The saved scan stores `spec.pattern`. The first build accepts the four names in section 4.
- A hit stores the swing dates and prices, and `forming` or `confirmed`.
- A pattern from the previous week, still inside the last 10 trading sessions, is a hit on the market scan and the one-ticker check.
- A pattern that ended about a month ago, including swings that sit only from T-60 to T-30, is not a hit on either view.
- Skipping the day the pattern formed does not drop it when the next run still finds it inside those 10 sessions.
- The one-ticker check uses the same match rule, including the 10-session freshness, as the market scan.
- A bond, an index, HCX, and a future are not eligible for the market scan.
- The backfill pass does not run a named scan. Opening a symbol does not score. A triggered one-ticker run is stored, and a later read returns those rows without scoring again.
- A market trigger limited to a ticker subset does not load tickers outside that subset.
- A failed named run leaves the previous hits queryable and sends no Telegram. A failed Telegram send keeps the `ok` run. The one-ticker check sends no Telegram.

---

## 11. Out of scope

- A look-alike "scan now" button, or a named scan of every pattern when you selected a subset.
- numpy or pandas.
- Stored normalized series, or a table of indicator points for the scan.
- A bond browser on the market list, or a rewrite of the HCX board code.
- Rule forms, shape drawing, and a weekly run.
- Changing price-alert delivery.
- Triangles, flags, and cup and handle in the first named-pattern build.
- Using look-alike's floor 0.85 as the named-pattern floor. Named patterns use 0.70 and a cap of 20.
