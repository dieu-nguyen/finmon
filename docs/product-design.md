# finmon product design

Vietnam equity monitor (HOSE, HNX, UPCOM). Prices from **DNSE OpenAPI**. Company and fundamental data from **Vnstock**. Technical indicators are computed locally from daily OHLCV. Not a broker, not a trading terminal, not realtime Level-2.

Audience: one operator (you). Single-user is enough for v1.

## Where to read

- This file is the current product.
- Build specs: `docs/backfill-workflow.md`, `docs/market-list.md`, `docs/pattern-compare.md`.
- Decisions: 0001. History backfill is its own process (`docs/adr/0001-backfill-process.md`); 0002. The market screen is one page of one type (`docs/adr/0002-market-list-page.md`); 0003. Indicators are calculated when the chart asks (`docs/adr/0003-indicators-on-read.md`); 0004. HCX names are corporate bonds (`docs/adr/0004-hcx-bonds.md`); 0005. Pattern compare runs after the official bar (`docs/adr/0005-pattern-compare-job.md`); 0006. Named patterns are their own scan kind (`docs/adr/0006-named-pattern-scan.md`).
- `docs/design-system.md` and `docs/market-api-research.md` stay supporting material.

---

## 1. Purpose

See the market, mark your own thinking on it, get told when price hits a level you chose, and after the official daily bar is stored, see which names look like a reference you picked. Named-pattern hits, from that ticker's own swings, are accepted and not built yet.

Success looks like:

- After the session, you can open any listed stock or ETF, see a daily chart, and it matches DNSE history.
- You can draw and write on that chart, plus keep a longer note beside it; those survive refresh.
- When last price crosses an alert you set, Telegram gets a message on that 30-minute poll, while the API is up in session.
- After the backfill pass that writes the official bar, a job scores enabled look-alike patterns. You open a short hit list, not the catalog.
- Named patterns are accepted and not built. The same job will score a saved pattern from that ticker's own swings. Lookback is 90 sessions. The last swing or the confirming close is inside the last 10 trading sessions. A hit opens that ticker's chart. From a ticker, the same rule reports which of the four match.

The first three bullets are **v1**. Look-alike is **v1.1**. Named patterns are the next scan kind. They are not built.

Out of scope for this product:

- Order placement, portfolio brokerage sync, DNSE WebSocket live board.
- Selling or republishing exchange data.
- Auto-trading from patterns.
- Intraday indicator engine (daily bars only).

---

## 2. What you see (product surfaces)

UX is the first principle for every screen: performance and convenience. First paint is a small set. Search and filters narrow the request. Stocks, fund certificates, and indices stay in separate lists.

### 2.1 Market

Three lists: **Stocks | Funds | Indices**. Default is Stocks. Funds are `type=etf`. Indices are `type=index`. Bonds are `type=bond` and are not a market segment in this version. HCX stays the board code on those rows. It is not a stock board.

On Stocks, the board control is All, HOSE, HNX, UPCOM. UPCOM includes a stored board of UPX.

The table is 50 rows, ordered by ticker. Search replaces the page (cap 50): exact ticker, then ticker prefix, then name. A slower wider response must not replace a narrower one. The watchlist checkbox filters inside the current segment. Opening a row loads the chart.

Detail: `docs/market-list.md`.

### 2.2 Chart (daily)

- Candles come from `daily_bar` only. Default lookback is about one year.
- Indicators are calculated when the chart asks, on the same from/to window as the candles, and they are not stored: sma, ema, rsi, macd, bollinger, atr, volume_ma. The chart today shows SMA 20. The others exist on the API. Parameters stay editable. Not fetched from a TA vendor.
- Price scale: **đồng**, one convention everywhere.
- Vietnam session context on the axis (calendar dates, skip non-trading days). Show reference / ceiling / floor when DNSE provides them on the quote.

Detail for the window alignment: `docs/market-list.md`.

### 2.3 Your analytics

Three separate objects, all owned by you, keyed by symbol (and optionally by time on the chart):

| Object | Where it lives | What it is |
| --- | --- | --- |
| **Drawing** | On the chart | Trend line, horizontal, rectangle, Fibonacci, text label at a bar. Anchored to price + date, not to pixels. |
| **Chart note** | On the chart | Short pin on a candle (e.g. “break 61.9”). |
| **Page note** | Side panel, not on the candles | Longer markdown: thesis, risks, links. One current note per symbol, with history of edits. |

Drawings and chart notes must re-attach after new bars arrive (anchor = trading date + price). If a split/adjust changes the series, v1 keeps raw DNSE close; you accept that old drawings may look wrong on adjusted history until we add an adjust policy later.

### 2.4 Company panel (on demand)

Loaded when you open a symbol, not on the market list.

One JSON document per ticker from Vnstock (profile, statements, ratios), cached 24 hours. No statement warehouse. Failure of Vnstock must not blank the chart.

### 2.5 Alerts

You set: symbol, condition, channel.

v1 conditions:

- Last price **≥** or **≤** a price you type.
- Optional: only once vs repeat each day while still true.

Delivery: **Telegram** (bot message: ticker, board, last, condition, time ICT).

Evaluation: the 30-minute watchlist poll, while the API is up in session, including the 15:00 run. There is no second pass at 16:30.

Pattern compare sends its own Telegram message from the scan job. That is not a price alert.

### 2.6 Pattern compare (v1.1)

Accepted. The screen does not score the catalog.

After the backfill pass that writes the official daily bar, a job scores enabled look-alike patterns. It does not run when the page opens, and not on the 30-minute poll.

Look-alike uses the last 90 trading-day closes, min-max normalized, Pearson correlation, floor 0.85, top 20. The reference ticker is excluded.

Universe: listed stock and ETF on HOSE, HNX, and UPCOM (stored UPX counts as UPCOM). Skip bonds, indices, HCX, flat windows, and windows whose newest bar is still `source=quote`.

The screen is **Scans**: a short hit list. A hit opens two charts side by side for those 90 sessions. A successful run sends one Telegram message. A failed run keeps the previous hits and sends no hit-list message.

Named patterns are accepted and not built. They sit beside look-alike. A saved scan stores the pattern name and kind `named`. The job reads the last 90 sessions of daily high, low, and close, marks swing highs and lows, and tests the last swings against that pattern's rule. Those 90 sessions are how far back the current pattern may start. Freshness is the last 10 trading sessions, about two calendar weeks. A pattern from last week still matches. One that ended about a month ago, including a stretch that sits only in the middle of the 90, does not. Missing the day it formed does not drop it: the next run reads the stored bars. The first build is double bottom, double top, head and shoulders, and inverse head and shoulders. A hit stores the ticker, the date window, the score, and the swing dates and prices. The list shows forming or confirmed. Forming is still inside those 10 sessions and has not left the neckline. Confirmed means the neckline break is inside those 10 sessions. The chart draws those points on that ticker. From a ticker you can ask which of the four match. That check uses the same rule as the scan. There is no reference ticker. Pearson is not used. Triangles, flags, and cup and handle come later. The price band, swing width, score floor, and cap are still open.

Rules, shapes, and a weekly schedule are reserved. They are not in this slice.

Detail: `docs/pattern-compare.md`.

---

## 3. Pattern types

Look-alike is the method the job scores today. Named patterns are accepted beside it and are not built yet. You enable the patterns you want. Rule patterns, shape patterns, and a weekly schedule stay reserved.

### 3.1 Look-alike

Pick a reference symbol. Compare its last 90 daily closes to other listed stocks and ETFs. The score is Pearson correlation after min-max normalization. Keep the top 20 at or above 0.85. The reference is not in the list. This is not fundamental similarity. The screen and the job are in section 2.6.

### 3.2 Named patterns

Accepted. Not built yet.

Save a pattern by name. The job tests that rule on each ticker's own daily high, low, and close. Lookback is 90 sessions. The last swing or the confirming close falls in the last 10 trading sessions. It does not use a reference ticker or Pearson. First build: double bottom, double top, head and shoulders, inverse head and shoulders. A hit is forming or confirmed. The chart draws the swing points on that ticker. From a ticker, the same rule reports which of the four match.

Detail: `docs/pattern-compare.md`.

### 3.3 Reserved

- **Rule**: an AND of clauses on the daily series (close vs a moving average, range, volume). A later job may compute those indicators inside the run and store matches only, not every indicator point.
- **Shape**: a template series of length ≤ 90, drawn or taken from a date range on a symbol.
- **Weekly** schedule.

### 3.4 Later (not this product yet)

- DTW / more shape families
- Intraday patterns
- News/sentiment

---

## 4. Data & cadence

| Data | Source | When |
| --- | --- | --- |
| Instrument list and daily OHLCV | DNSE, written by the backfill process | `start.sh` launches that process: catch-up, then weekdays at 16:30 ICT. Writes `daily_bar.source=dnse` |
| Watchlist last price and today's forming candle | DNSE quote, 30-minute poll inside the API | Weekdays in session. Updates `quote_snapshot` and today's candle `source=quote` until the after-close backfill replaces that bar |
| Indices | Same writers as prices | Same as prices |
| Company | Vnstock | On demand. One JSON document per ticker, 24h cache. No statement warehouse |
| Indicators | Local from `daily_bar` | When the chart asks, on that candle window. Not stored |
| Price-alert Telegram | Bot API | When an alert fires on the 30-minute poll |
| Pattern Telegram | Bot API | One message from a successful pattern run (look-alike today; named patterns when that method is built) |

The API has no 16:30 history job.

Detail: `docs/backfill-workflow.md`.

DNSE WebSocket is **not** used.

Fallback: none. If DNSE fails, jobs retry with backoff and the UI shows stale-as-of. Do not silently mix CafeF/VPS into the same bars.

Vnstock rate limit (community **60 req/min**): the company panel is on demand and cached. The scanner does not call Vnstock.

---

## 5. Architecture

Small units, each with one job:

```
[DNSE client] --> [backfill process] --> [market store]
[DNSE client] --> [30-min quote poll] --> [market store]
[Vnstock client] --> [company cache]        ^
                                            |
[indicator lib] reads market store when the chart asks
[annotation store]  drawings / notes
[alert engine] reads market store + alert rules --> [Telegram]
[pattern job] after the official bar --> [scan hits] --> [Telegram]
[web app] reads all stores; writes annotations, alerts, patterns, watchlist
```

- **DNSE client**: auth (API key/secret), REST only, rate-limit headers, paging.
- **Vnstock client**: isolated so a Vnstock outage cannot block ingest.
- **Backfill process**: started by `start.sh`. Catch-up, then weekdays at 16:30 ICT. Official bars (`source=dnse`) only. Not inside the API.
- **Market store**: symbols, daily bars, last quote snapshot, ingest watermarks.
- **Annotation store**: drawings, chart notes, page notes.
- **Alert engine**: load rules, compare to last price, write delivery log, call Telegram once per fire. The 30-minute poll only.
- **Pattern job**: no DNSE call. Runs after the backfill pass that writes the official bar. Look-alike on 90 closes. Named patterns, when built, on one ticker's swings: 90 sessions of lookback, fresh within the last 10 trading sessions. Writes hits. One Telegram message when the run succeeds. A one-ticker check uses that same match rule and is not a second job.
- **API scheduler**: 30-minute watchlist poll, weekdays in session (ICT), including 15:00. No 16:30 history job. Skip Saturday and Sunday; skip VN holidays when a holiday list exists.
- **Web app**: market list, chart and drawings (Apache ECharts), notes, price alerts, Scans.
- **Store**: MySQL 8.

Compute chart indicators in the app (or a pure function module), not in SQL, and not as stored series.

---

## 6. Data model (logical)

- `symbol`: ticker, name, board, type (stock/etf/index/bond/futures), listed flag. HCX rows are `type=bond`. The board code stays HCX.
- `daily_bar`: ticker, date, open, high, low, close, volume, value. `source=dnse` is the official bar. `source=quote` is today's forming candle until the after-close backfill replaces it.
- `quote_snapshot`: ticker, last, ref, ceiling, floor, time, source
- `watchlist_item`: ticker, position
- `drawing`: id, ticker, tool, points[] (date, price), style, created_at
- `chart_note`: id, ticker, date, price, text
- `page_note`: ticker, body, updated_at (+ `page_note_revision` optional)
- `price_alert`: ticker, op (gte/lte), price, once|repeat, enabled, last_fired_at
- `alert_delivery`: alert_id, sent_at, telegram_ok, payload
- `pattern_def`: name, kind (`lookalike` built; `named` accepted, not built; `rule` and `shape` reserved), spec JSON, schedule (`daily` now; `weekly` and `both` reserved), enabled. A named pattern stores its pattern name in spec.
- `scan_run`: id, started_at, finished_at, status
- `scan_hit`: run_id, ticker, pattern_id, score, window_start, window_end. A named-pattern hit also stores the swing dates and prices, and forming or confirmed.

Prices stored as integer **đồng** (or decimal with fixed scale). Never mix nghìn.

---

## 7. Error handling

- DNSE 429: honor `X-RateLimit-*`, sleep, resume; do not drop the day’s ingest without a failed `scan_run` / ingest watermark.
- DNSE missing symbol: keep the symbol row, chart shows “no bars”.
- Vnstock error: company panel “unavailable”; chart still works.
- Telegram fail on a price alert: keep the alert unsent, retry next cycle; do not flip `last_fired_at` until send succeeds (for `once` alerts).
- Pattern job failure: mark that run failed, keep the previous hits visible with their as-of date, and send no hit-list message.

---

## 8. Testing

- DNSE client: recorded fixtures (no live keys in CI).
- Indicator functions: golden values on a fixed series. The series returned with a chart matches that candle window.
- Alert engine: price 100, alert ≥ 100 fires; 99.99 does not; `once` does not double-send.
- Look-alike: two identical normalized series score about 1. The reference ticker is not in its own hits. A window whose newest bar is `source=quote` is not scored.
- Named patterns: specified in `docs/pattern-compare.md`. Not built yet.
- UI: a market page of 50, chart load, save drawing, save page note, create alert (browser or component tests).

---

## 9. Delivery order

**v1 — view + think + price ping**

1. History backfill as its own process, plus the 30-minute watchlist poll and the quote candle
2. Market list (Stocks | Funds | Indices, 50 rows) and a daily chart with indicators on that window
3. Drawings, chart notes, page notes
4. Price alerts → Telegram
5. Company tab (on demand, 24h cache)

**v1.1 — look-alike**

6. Job after the official bar, Scans hit list, side-by-side charts for those 90 sessions, one Telegram message

**Accepted, not built — named patterns**

7. Same job and the same hit tables. Kind `named`. First four patterns. Lookback is 90 sessions. Freshness is the last 10 trading sessions, on the market scan and from a ticker. The list shows forming or confirmed. The chart draws the swings on that ticker.

**Reserved**

- Rule patterns, shape templates, weekly schedule
- A bond browser

**Not in this product**

- DNSE WebSocket
- Second price vendor
- Adjusted-price series

---

## 10. Defaults (locked unless you change them)

- Timezone: `Asia/Ho_Chi_Minh`
- Prices: backfill process (catch-up, then weekdays at 16:30 ICT). API watchlist poll every 30 minutes in session. No API history job at 16:30.
- Official bars: `source=dnse`. Session candle: `source=quote` until that after-close pass.
- Market list: one segment, 50 rows, ordered by ticker. Search replaces the page.
- Indicators: daily only, computed on the chart's from/to window, not stored. The chart shows SMA 20.
- Pattern window (look-alike): 90 trading-day closes, Pearson on min-max, floor 0.85, top 20, reference excluded
- Named patterns: 90 sessions of lookback for the current pattern. Freshness is the last 10 trading sessions, on the market scan and the one-ticker check. Kind `named` and the pattern name on the saved scan are decided. The price band, bars on each side of a swing, score floor, and hit cap are still open.
- Alerts: Telegram on last-price rules. Pattern Telegram is a separate message from the scan job.
- Single user, no public market data API
- Language of UI: English labels OK; tickers and company names as returned (Vietnamese)

---

## 11. What this document is not

This file is the product as it stands. The slice docs are the build specs. The ADRs are the decision records. Both are listed under Where to read.
