# 0002. The market screen is one page of one type

Status: accepted
Date: 2026-09-28

## Context

The symbol catalog is a few thousand rows. Painting every symbol, and mixing stocks, funds, and indices in one table, is slow and easy to misread. A late response for the full catalog was painting over a search.

## Decision

The market screen shows one page of one type (stocks, funds, or indices), 50 rows. Search replaces that page. A late full-catalog response must not paint over it. Bonds are not in this list.

## Consequences

First paint is a small set. Stocks, funds, and indices stay in separate lists. Search and the watchlist checkbox narrow the request. Build spec: `docs/market-list.md`.
