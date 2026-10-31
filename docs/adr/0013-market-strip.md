# 0013. A market strip is pinned on every page

Status: accepted
Date: 2026-10-27

## Context

The operator moves between the market list, a symbol, scans, and patterns. The index level, the breadth of HOSE, and how much value traded are session context for every one of those pages. Foreign net is not in this strip.

## Decision

The strip is shell chrome, pinned above every page. It sits directly under the top bar and above the page outlet, edge to edge across the app frame, and stays put while the page below scrolls.

Three cells, and a fourth cell of the same width that stays empty. The empty cell is reserved space. It has no label and no placeholder. Foreign net, and any other fourth metric, are omitted on purpose.

Every cell shows the same 30 trading sessions. There is no switch. The sessions are the latest `VNINDEX` dates on official bars (`daily_bar.source = dnse`), not calendar days. The strip shows that latest session date.

VN-Index reads `daily_bar` for `ticker = VNINDEX`. `to_dong(..., is_index=True)` stores hundredths of a point, so the cell shows points (`close / 100`). The change is from the first close in the window to the latest close. The cell links to the existing symbol page.

HOSE breadth and HOSE trading value are computed on read. The read uses those session dates only, plus the one session before the window so the oldest day has a previous close. It joins `daily_bar` to symbols with `board = HOSE` and `type` of `stock` or `etf`. Indexes, bonds, warrants, and futures are out. A name with no bar on a session is omitted from that session's advance, decline, and unchanged counts. Value is the sum of stored `daily_bar.value` for the names that have a bar that session.

`daily_bar.value` is the DNSE OHLC `value` integer. The parser does not run it through `to_dong`, and backfill stores that integer unchanged. A quote candle stores 0. The cell shows the latest sum in tỷ đồng (the stored sum divided by 1e9) against the average of the window. When every value in the window is 0, the cell stays and says the turnover was not stored. It does not draw a chart of zeros.

The strip loads with the shell and does not block the page. A failed read leaves a quiet failure in the strip. The page underneath still works.

## Consequences

`GET /api/market/summary` is the only read. It always returns 30 sessions. A `sessions` query string is ignored. The query is the VNINDEX date list (limit 31 on `uq_daily_bar_ticker_date`), then one aggregate of HOSE stock and ETF bars on those dates. Each bar lookup is an equality on `(ticker, date)`.
