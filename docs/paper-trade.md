# Paper trade

Build spec for the mock book in `docs/product-design.md`.
Decision: `docs/adr/0013-mock-paper-trade.md`.

Accepted design, 2026-11-14.

UX is the first principle: performance and convenience. First paint is the book, not the catalog. The command is one ticker. A slower symbol lookup must not block a fill, and an older lookup must not replace a newer ticker.

This is not a broker. Fills never leave finmon.

---

## 1. Why

A buy or sell idea needs a cash number, a fill, and win/lose on that book. The market list and the chart already have last. They do not keep a position. A real order at DNSE is out of scope.

---

## 2. Database

One account (`paper_account` id 1). Starting cash is 1,000,000,000 đồng, stored as integer đồng.

| Table | Key | What it is |
| --- | --- | --- |
| `paper_account` | id | `cash`, `starting_cash` |
| `paper_position` | ticker | `quantity`, `cost_basis` (đồng paid for remaining shares) |
| `paper_fill` | id | ticker, side (`buy` / `sell`), quantity, price, `realized_pnl`, `cash_after`, `created_at` |

Average cost on a lot is `cost_basis // quantity`. A buy adds quantity and cost. A sell removes `cost_basis * qty // old_qty` and books `qty * price - that cost` as realized.

Reset deletes fills and positions and sets `cash` back to `starting_cash`.

No fee column. No lot-size column. No second account.

---

## 3. Trade screen

Nav: **Trade**, after Market.

First paint: cash, equity, unrealized, realized, total P&L. Empty positions show “No positions. Fill a buy at last price.” The catalog is not fetched.

The command row: Buy or Sell, ticker, quantity, last (when that ticker resolves), Fill. Ticker is uppercase. Quantity is a whole share count ≥ 1. Typing a ticker looks up `/api/symbols/{ticker}` after about 200 ms and cancels the previous lookup. That preview does not fill. Fill posts the command and uses the book the API returns.

Open lots: ticker (opens the symbol chart), name, qty, avg, last, value, P&L. Fills: the latest 20 matching the fill filters, newest first, time, side, ticker, qty, price, realized. The fill toolbar is Range (All, Today, 7d, 30d in ICT), Symbol (one ticker, not the catalog), and Result (All, Win, Lose). Win is realized P&L above zero; Lose is below zero. Buys stay out of Win and Lose. Reset restores the starting book.

---

## 4. Fill

Last price is `quote_snapshot.last` when present, else the newest `daily_bar.close`. A name with neither is rejected (`no last price`).

Tradeable: `type` stock or etf. Index and bond are `not tradeable`. Unknown ticker is 404.

Buy: `qty * last` must be ≤ cash, or `insufficient cash`. Cash falls by that amount. The lot is created or averaged in.

Sell: `qty` must be ≤ shares held, or `insufficient shares`. There is no short. Cash rises by `qty * last`. Realized is booked against remaining cost. A full sell deletes the lot.

Equity is cash plus mark-to-market of open lots. Unrealized is mark minus remaining cost. Realized is the sum of fill `realized_pnl`. Total P&L is equity minus starting cash.

No commission, tax, or lot of 100. No limit, stop, or T+ settlement.

---

## 5. API

Single user. No public market-data write.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/paper` | Book: cash, equity, P&L, positions, latest 20 fills. `ticker`, `from`, `to` (ICT dates), and `result=all\|win\|lose` narrow fills only. Creates the account at starting cash if missing. |
| POST | `/api/paper/orders` | `{ side: buy\|sell, ticker, quantity }`. Fills at last and returns the book. |
| POST | `/api/paper/reset` | Starting cash, no lots, no fills. Returns the book. |

Prices and cash are integer đồng.

---

## 6. Testing

- Empty book: cash 1,000,000,000, equity the same, P&L 0, no lots.
- Buy 100 at close 91,000: cash falls by 9,100,000, avg 91,000, unrealized 0.
- Quote last is used when both quote and close exist.
- Last then moves: unrealized and total P&L follow the mark.
- Partial sell books realized on the sold qty and leaves the rest marked.
- Sell all clears the lot. Round trip at the same price is P&L 0.
- Insufficient cash, insufficient shares, unknown ticker, no last, and index are rejected and leave the book unchanged.
- Reset restores starting cash.
- Fills: `ticker` keeps that symbol; `result=win` keeps positive realized; `result=lose` keeps negative realized; `from`/`to` are inclusive ICT days.
- UI: empty book, a filled buy shows the lot and profit, a 400 shows the API detail, Reset returns to the empty book. Range, Symbol, and Win/Lose narrow the fill request and cancel the previous one.

---

## 7. Out of scope

DNSE order placement. Brokerage sync. Short. Fees. Lot size. Limit and stop. A second paper account. Auto-trade from a pattern or an alert.
