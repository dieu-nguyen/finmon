# 0004. HCX names are corporate bonds

Status: accepted
Date: 2026-09-28

## Context

HCX names are corporate bonds (trái phiếu). 207 rows are stored today as type stock, so they show up as a stock board and would be walked by look-alike.

## Decision

They become `type=bond`. Board code stays HCX. They are not a stock board and look-alike does not walk them. This slice does not add a bond browser.

## Consequences

Stocks, funds, and indices stay the market segments. The stock board control is All, HOSE, HNX, UPCOM. UPCOM still includes stored board UPX. The market-list build spec is `docs/market-list.md`. The type change is specified in `docs/pattern-compare.md`.
