# Market list and chart fetch

Accepted design, 2026-09-27. Not yet implemented.

UX is the first principle: performance and convenience. First paint is a small page. Search narrows the request. A slower wider response must not replace a narrower result. Stocks, fund certificates, and indices stay in separate lists.

This document supersedes product-design section 2.1 ("every symbol as a row" and the filter bullet). The watchlist refresh cadence (the 30-minute session poll) and daily bars stay as in the backfill doc. Company cache stays as it is.

---

## 1. Why

The catalog is small enough to store and too large to paint as one table.

| | Count |
| --- | --- |
| Symbols | 3,299 |
| Stock | 3,262 |
| ETF (all HOSE) | 23 |
| Index | 14 |

Boards stored:

| Board | Type | Rows |
| --- | --- | --- |
| HOSE | stock | 1,801 |
| UPX | stock | 946 |
| HNX | stock | 308 |
| HCX | stock | 207 |
| HOSE | etf | 23 |
| HOSE | index | 2 |
| HNX | index | 4 |
| DVX | index | 8 |

`daily_bar` already has 1.56 million rows, from 2000-07-28 through 2026-09-25, about 122 MB of data and about 84 MB of indexes. 1,810 tickers have bars. Backfill is still filling the rest. Ten more years stays a few million rows. The schema is not the problem.

`GET /api/symbols` loads every symbol, then for each ticker runs a `quote_snapshot` lookup and the latest two `daily_bar` rows. That is about 6,600 queries. Typing VHM sends a filter, but the in-flight unfiltered request finishes later and paints the full list again. The table also mixes stocks, fund certificates (`type` etf), and indices. The UI board list is HOSE, HNX, and UPCOM, and UPCOM matches nothing because those names are stored as UPX.

---

## 2. Database

No migration. No Redis, no partitioning, no financial-statement tables, and no latest-bar side table in this enhancement.

`company_cache` stays one JSON document per ticker, replaced every 24 hours. `page_note` revisions and an extra ticker index on `daily_bar` are out of scope.

The one later addition, only if a board must be sorted by last, change, or volume, is a narrow latest-row per ticker. A page of 50 does not need it. The unique key `(ticker, date)` already finds the latest bars for the tickers on the page.

---

## 3. Market screen

Segment control: Stocks, Funds, Indices. Default Stocks. Funds are `type=etf`. Indices are `type=index`.

The board control is only on Stocks: All, HOSE, HNX, UPCOM, HCX. UPCOM matches a stored board of `UPCOM` or `UPX`. The table shows UPX as UPCOM. Stored board values are not rewritten.

With an empty search box, the screen shows 50 rows per page, ordered by ticker, with previous and next. The watchlist checkbox filters in SQL inside the current segment and, on Stocks, the current board.

Search replaces the page. The box debounces about 200 ms. The result is capped at 50. Rank, compared case-insensitively:

| Rank | Match |
| --- | --- |
| 1 | Ticker equals the query |
| 2 | Ticker starts with the query |
| 3 | Name contains the query |

A symbol takes the best rank that applies, so the ticker VHM comes before a name that merely contains those letters. While the box is non-empty, there is no pager.

Search first applies the current segment and, on Stocks, the current board. If that set is empty, search all types and boards, still capped at 50, and show a line that these matches are outside the current filter. The board column, and the type when it is not the current segment, tells them what they opened. The wider search runs only after the narrower one comes back empty.

The client cancels the previous request with `AbortController` and ignores a response that is not the latest request. The full catalog cannot paint over VHM. An older, wider response does not replace a newer, narrower one.

Columns stay: Ticker, Name, Board, Last, Change, Volume, Pin. Pin refetches the current page.

Opening a row still goes to the symbol page.

---

## 4. API

`GET /api/symbols` returns an object, not a bare array:

```json
{ "items": [], "total": 0, "limit": 50, "offset": 0 }
```

`items` is a list of `SymbolRow`. Fields stay: `ticker`, `name`, `board`, `type`, `listed`, `last`, `change`, `volume`, `watchlist`. `board` is the stored value. `total` is the count of symbols matching the same filters, before `limit`.

Query: `type` (default `stock`), `board`, `q`, `watchlist`, `limit` (default 50, max 50), `offset`.

Omitted `type` means `stock`, so a caller cannot accidentally receive the mixed catalog. Funds send `type=etf`. Indices send `type=index`. The widened search sends `type=all` and omits `board`. `board=UPCOM` matches stored `UPCOM` or `UPX`. Any other board matches that stored value. A search request uses `offset` 0.

Price fields keep today's rule in `_last_and_prev` (`backend/app/routers/symbols.py`):

| Field | Rule |
| --- | --- |
| `volume` | Newest `daily_bar.volume`, or null |
| `last`, when `quote_snapshot` exists | `snapshot.last` |
| Previous close, when `quote_snapshot` exists | Newest daily close |
| `last`, when no snapshot | Newest close |
| Previous close, when no snapshot | The close before that |
| `change` | `(last - prev) / prev * 100`, or null when `prev` is missing or 0 |

Queries for one page are a fixed set, not one query per ticker, and not a window over every `daily_bar` row:

1. The symbol page (filter, order, limit) plus a `COUNT` on `symbol` only for `total`. The count uses the same filters, including watchlist, and does not read `daily_bar`.
2. `quote_snapshot` for those tickers only.
3. The latest two `daily_bar` rows for those tickers only, using the `(ticker, date)` unique index: `WHERE ticker IN` the page, then the two newest dates.

`GET /api/symbols/{ticker}` returns one `SymbolRow`, and 404 when the ticker is unknown. The symbol page header uses this. It must not call the list endpoint.

---

## 5. Chart fetch

`GET /api/symbols/{ticker}/bars` already defaults to about one year (`to` = today, `from` = today − 365 days). Keep that.

`GET /api/symbols/{ticker}/indicators` today loads every bar for the ticker and returns a full-length series. The chart only has one year of candles, so SMA is not aligned with those dates.

Indicators accept the same `from` and `to` as bars. Load enough bars before `from` to warm up the largest requested period. Cover weekends: a simple bound is period × 3 calendar days, or enough prior rows for that period. For `macd`, that period is the slow length used by `macd()` (26) when the request does not pass one. Compute on the warmup plus the window, then return `dates` and each series only for dates inside `from`..`to`, so each series length matches the candle array for that same window.

The symbol page passes the same `from` and `to` to both calls. Omit both to use the shared one-year default.

The company tab stays lazy. The 24-hour `company_cache` stays.

---

## 6. Tests

- A page of 50; the next page does not repeat tickers.
- `type=stock` excludes etf and index.
- `board=UPCOM` includes a symbol stored as UPX.
- `q=VHM` returns VHM and does not return the rest of the catalog. An exact ticker ranks before a name that merely contains those letters.
- `watchlist=true` does not price the unpinned catalog.
- An ETF ticker with Stocks and a board that excludes it returns that ETF once the wider search runs, with `type` etf.
- `GET /api/symbols/VHM` is one row.
- An indicator series length equals the bar count for the same `from` / `to`.

---

## 7. Out of scope

- Redis or any cache in front of MySQL.
- Partitioning.
- Normalizing company statements.
- A latest-bar side table.
- Sorting a page by change or volume.
- Virtualizing thousands of rows.
- Changing backfill or the 30-minute quote job.
- Dropping `page_note` revisions.
