# 0013. Mock trades fill at last stored price

Status: accepted
Date: 2026-11-14

## Context

The product is not a broker. A buy or sell still needs a way to see whether the idea made or lost money, without placing an order at DNSE and without syncing a brokerage book.

## Decision

One paper account. Starting cash is 1,000,000,000 đồng. A buy or sell command fills immediately at last stored price: `quote_snapshot.last` when that row exists, otherwise the newest `daily_bar.close`. Cash, lots, and P&L live in finmon only.

The screen is **Trade**. First paint is the book: cash, equity, unrealized, realized, total P&L. The command is ticker, side, and a whole-share quantity. Positions and the latest 20 fills follow. The catalog is not loaded. Typing a ticker looks up that one name for last. Reset restores starting cash and clears lots and fills.

Tradeable names are listed stock and ETF. Indices and bonds are rejected. A sell may not exceed the shares already held. There is no short, no fee, no lot-size rule, and no limit or stop.

Unrealized is mark-to-market on remaining cost. Realized is booked on a sell against that cost. Total P&L is equity minus starting cash.

## Consequences

Real order placement and brokerage sync stay out of product. A fill never calls DNSE. Build spec: `docs/paper-trade.md`.
