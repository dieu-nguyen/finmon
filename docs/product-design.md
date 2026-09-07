# finmon product design

Vietnam equity monitor (HOSE, HNX, UPCOM). Prices from **DNSE OpenAPI**. Company and fundamental data from **Vnstock**. Technical indicators are computed locally from daily OHLCV. Not a broker, not a trading terminal, not realtime Level-2.

Audience: one operator (you). Single-user is enough for v1.

---

## 1. Purpose

See the market, mark your own thinking on it, get told when price hits a level you chose, and once a day (and once a week) have the system hunt for names that match **your** patterns.

Success looks like:

- After the session, you can open any listed stock or ETF, see a daily chart, and it matches DNSE history.
- You can draw and write on that chart, plus keep a longer note beside it; those survive refresh.
- When last price crosses an alert you set, Telegram gets a message the same polling cycle (target: within one 30-minute job in session, or at EOD if you only run EOD).
- Overnight, a job ranks names whose last 90 daily bars match a pattern you defined; you open a short list, not 1,500 charts.

The first three bullets are **v1**. The scan is **v1.1** (same product, next slice).

Out of scope for this product:

- Order placement, portfolio brokerage sync, DNSE WebSocket live board.
- Selling or republishing exchange data.
- Auto-trading from patterns.
- Intraday indicator engine (daily bars only).

---

## 2. What you see (product surfaces)

### 2.1 Market

- Boards: HOSE, HNX, UPCOM, plus indices (at least VNINDEX, VN30) and ETFs that DNSE instruments expose.
- Catalog: every symbol as a row (code, name, board, last, change, volume). Cheap fields only. Opening a row loads the chart.
- Watchlist / “hot” list: symbols you pin. These refresh on the session poll (every 30 minutes while the market is open, ICT). The rest of the catalog refreshes at **end of day**.
- Filters: board, watchlist, search by ticker/name.

### 2.2 Chart (daily)

- Daily OHLCV candlesticks. Default lookback 1 year; you can request more if DNSE returns it.
- Local overlays you turn on: SMA, EMA, RSI, MACD, Bollinger, ATR, volume MA. Parameters editable. Not fetched from a TA vendor.
- Price scale: **đồng**, one convention everywhere.
- Vietnam session context on the axis (calendar dates, skip non-trading days). Show reference / ceiling / floor when DNSE provides them on the quote.

### 2.3 Your analytics

Three separate objects, all owned by you, keyed by symbol (and optionally by time on the chart):

| Object | Where it lives | What it is |
| --- | --- | --- |
| **Drawing** | On the chart | Trend line, horizontal, rectangle, Fibonacci, text label at a bar. Anchored to price + date, not to pixels. |
| **Chart note** | On the chart | Short pin on a candle (e.g. “break 61.9”). |
| **Page note** | Side panel, not on the candles | Longer markdown: thesis, risks, links. One current note per symbol, with history of edits. |

Drawings and chart notes must re-attach after new bars arrive (anchor = trading date + price). If a split/adjust changes the series, v1 keeps raw DNSE close; you accept that old drawings may look wrong on adjusted history until we add an adjust policy later.

### 2.4 Company panel (on demand)

Loaded when you open a symbol, not on the catalog poll.

From Vnstock: company info, shareholders/officers as available, financial statements (income, balance, cash flow), ratios (P/E, P/B, ROE, …). Failure of Vnstock must not blank the chart.

### 2.5 Alerts

You set: symbol, condition, channel.

v1 conditions:

- Last price **≥** or **≤** a price you type.
- Optional: only once vs repeat each day while still true.

Delivery: **Telegram** (bot message: ticker, board, last, condition, time ICT).

Evaluation: same cadence as hot-list poll in session; plus a full pass at EOD so nothing is missed if the 30-minute job skipped a name.

### 2.6 Pattern desk (autonomous scan)

You do **not** scan the UI yourself. Two scheduled jobs:

- **Daily** after EOD bars are stored (evening ICT, after DNSE daily OHLC is complete).
- **Weekly** (e.g. Sunday evening ICT) with the same engine, extra “weekly” pattern set if you tagged patterns as weekly.

Inputs: last **90 trading days** of daily close (and OHLC if the pattern asks for it) for the universe you enable (default: all three boards + ETFs that have 90 bars).

Outputs: a **scan result** list: symbol, pattern name, score, as-of date. You open it like a watchlist. No auto-alert unless you also attach a pattern to Telegram (v1.1). v1 Telegram is price alerts only.

---

## 3. Pattern types you can define

All patterns are **your** definitions stored in the app. The scanner only runs what you enabled.

### 3.1 Rule patterns (v1)

Boolean rules on the 90D (or shorter) daily series, for example:

- Close today vs SMA(20) / SMA(50)
- 90D high/low break
- Consecutive down/up days
- Range compression (e.g. 20D ATR vs 90D ATR)
- Volume today vs 20D average

You compose them in a form (AND of clauses). No Python in v1.

### 3.2 Shape patterns (v1)

A shape is a **template series** of length ≤ 90:

- Drawn by you on a chart (normalized polyline), or
- Taken from a date range on a symbol (“use HPG 2026-03-01 → 2026-06-01 as template”).

Match: compare the last N daily **closes**, min-max (or z-score) normalized, with **Pearson correlation** or **1 − cosine distance**. You set a minimum score (e.g. 0.85). This is “historical 90D data forming a shape.”

### 3.3 Look-alike (v1)

“Stocks that look like this stock”: pick a reference symbol, compare last 90D normalized closes to every other name, return top K (e.g. 20) above a score floor. Same distance as shape patterns. This is not fundamental similarity.

### 3.4 Later (not v1)

- DTW / more shape families (head-and-shoulders detector as a named built-in)
- Intraday patterns
- News/sentiment
- Alert-on-scan (Telegram when a pattern hits)

---

## 4. Data & cadence

| Data | Source | When |
| --- | --- | --- |
 | Instrument list | DNSE `GET /instruments` | Daily |
| Daily OHLCV all symbols | DNSE `GET /price/ohlc` | After close, batched, respect per-endpoint limits (OHLC 50,000/hour, 100,000/day) |
| Hot-list last price | DNSE latest trade/quote or a 1D OHLC close | Every 30 minutes **09:00–15:00 ICT** on trading days |
| Indices | DNSE index OHLC / market index as documented | Same as prices |
| Company / statements / ratios | Vnstock | On chart open; cache (e.g. 24h for profile, until next quarter for statements) |
| Indicators | Local from stored daily bars | On read |
| Telegram | Bot API | When an alert fires |

DNSE WebSocket is **not** used in v1.

Fallback: none in v1. If DNSE fails, jobs retry with backoff and the UI shows stale-as-of. Do not silently mix CafeF/VPS into the same bars.

Vnstock rate limit (community **60 req/min**): company panel is on-demand and cached. Scanner does **not** call Vnstock.

---

## 5. Architecture

Small units, each with one job:

```
[DNSE client] --> [ingest jobs] --> [market store]
[Vnstock client] --> [company cache]     ^
                                         |
[indicator lib] reads market store
[annotation store]  drawings / notes
[alert engine] reads market store + alert rules --> [Telegram]
[pattern engine] reads market store + pattern defs --> [scan results]
[web app] reads all stores; writes annotations, alerts, patterns, watchlist
```

- **DNSE client**: auth (API key/secret), REST only, rate-limit headers, paging.
- **Vnstock client**: isolated so a Vnstock outage cannot block ingest.
- **Market store**: symbols, daily bars, last quote snapshot, ingest watermarks.
- **Annotation store**: drawings, chart notes, page notes.
- **Alert engine**: load rules, compare to last price, write delivery log, call Telegram once per fire.
- **Pattern engine**: no network; numpy/pandas on 90D windows; write ranked hits.
- **Scheduler**: ICT calendar (skip weekends/VN holidays when we have a holiday list; until then skip Sat/Sun only).
- **Web app**: market table, chart+draw (Apache ECharts), notes, alerts CRUD, pattern CRUD, scan results.
- **Store**: MySQL 8.

Compute indicators in the app (or a pure function module), not in SQL, so definitions stay testable.

---

## 6. Data model (logical)

- `symbol`: ticker, name, board, type (stock/etf/index/other), listed flag
- `daily_bar`: ticker, date, open, high, low, close, volume, value, source=`dnse`
- `quote_snapshot`: ticker, last, ref, ceiling, floor, time, source
- `watchlist_item`: ticker, position
- `drawing`: id, ticker, tool, points[] (date, price), style, created_at
- `chart_note`: id, ticker, date, price, text
- `page_note`: ticker, body, updated_at (+ `page_note_revision` optional)
- `price_alert`: ticker, op (gte/lte), price, once|repeat, enabled, last_fired_at
- `alert_delivery`: alert_id, sent_at, telegram_ok, payload
- `pattern_def`: name, kind (rule|shape|lookalike), spec JSON, schedule (daily|weekly|both), enabled
- `scan_run`: id, started_at, finished_at, status
- `scan_hit`: run_id, ticker, pattern_id, score, window_start, window_end

Prices stored as integer **đồng** (or decimal with fixed scale). Never mix nghìn.

---

## 7. Error handling

- DNSE 429: honor `X-RateLimit-*`, sleep, resume; do not drop the day’s ingest without a failed `scan_run` / ingest watermark.
- DNSE missing symbol: keep catalog row, chart shows “no bars”.
- Vnstock error: company panel “unavailable”; chart still works.
- Telegram fail: keep alert unsent, retry next cycle; do not flip `last_fired_at` until send succeeds (for `once` alerts).
- Pattern job timeout: mark run failed, keep previous hits visible with as-of date.

---

## 8. Testing

- DNSE client: recorded fixtures (no live keys in CI).
- Indicator functions: golden values on a fixed 90-bar series.
- Alert engine: price 100, alert ≥ 100 fires; 99.99 does not; `once` does not double-send.
- Shape match: two identical normalized series score ~1; reversed series below threshold.
- Look-alike: reference vs itself is rank 1.
- UI: chart load, save drawing, save page note, create alert (browser or component tests).

---

## 9. Delivery order

**v1 — view + think + price ping**

1. DNSE ingest: instruments + daily bars + 30-minute hot list  
2. Market table + daily chart + local indicators  
3. Drawings, chart notes, page notes  
4. Price alerts → Telegram  
5. Company panel (Vnstock, cached)

**v1.1 — autonomous scan**

6. Rule patterns  
7. Shape templates + look-alike (90D)  
8. Daily and weekly jobs + results UI  

**Not before v1.1 is used in anger**

- DNSE WebSocket  
- Second price vendor fallback  
- Alert on pattern hit  
- Adjusted-price series  

---

## 10. Defaults (locked unless you change them)

- Timezone: `Asia/Ho_Chi_Minh`
- Hot-list poll: 30 minutes in session; catalog EOD
- Indicators: daily only, computed locally
- Pattern window: 90 trading days
- Similarity: Pearson on min-max normalized closes
- Alerts: Telegram only
- Single user, no public market data API
- Language of UI: English labels OK; tickers and company names as returned (Vietnamese)

---

## 11. What this document is not

It is not an implementation plan (file list, tickets, DNSE register steps). After you accept this product design, the next artifact is an implementation plan for **v1 only**.
