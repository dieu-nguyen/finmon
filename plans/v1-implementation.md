# v1 implementation plan

Implements [product design](../docs/product-design.md) **v1 only** (market view, daily chart, local indicators, drawings/notes, Telegram price alerts, on-demand company panel). Scanner is **v1.1** (section 12); do not build it in v1.

UI must follow [design system](../docs/design-system.md): tokens and primitives before any product screen.

Stack: **Python** backend (FastAPI), **Node.js** frontend (Vite + React + TypeScript). Single operator. Timezone `Asia/Ho_Chi_Minh`.

---

## Repo layout (create and keep)

```
docs/
  market-api-research.md
  product-design.md
  design-system.md
plans/
  v1-implementation.md          ← this file
backend/
  pyproject.toml
  alembic.ini
  alembic/
  app/
    main.py                     # FastAPI app factory
    config.py                   # env: DNSE keys, Telegram, Vnstock
    db.py
    models.py
    schemas.py
    clients/
      dnse.py
      vnstock_client.py
      telegram.py
    indicators.py               # pure functions, no I/O
    alerts.py                   # evaluate rules, no I/O except injected sender
    jobs/
      ingest.py                 # instruments, EOD bars, hot-list poll
      evaluate_alerts.py
    routers/
      symbols.py
      bars.py
      watchlist.py
      annotations.py
      alerts.py
      company.py
      meta.py                   # as-of / health
  tests/
    test_indicators.py
    test_alerts.py
    test_dnse_client.py
    conftest.py
frontend/
  package.json
  vite.config.ts
  index.html
  src/
    main.tsx
    App.tsx
    api.ts
    design-system/
      tokens.css
      index.ts
      Button.tsx
      ...                      # primitives listed in design-system.md
    layouts/AppShell.tsx
    pages/
      Gallery.tsx
      Market.tsx
      Symbol.tsx
      Alerts.tsx
    chart/
      DailyChart.tsx            # wraps chart lib + drawing overlay
      drawings.ts               # date/price anchors
```

Root `README.md` stays a title only unless you ask to expand it.

---

## Task 0 — Folders and toolchains

**Files:** `backend/pyproject.toml`, `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`

- Python 3.12, package `app`, deps: `fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `pydantic-settings`, `httpx`, `apscheduler`, `pytest`. Optional later: `vnstock`.
- Node 22, Vite, React, TypeScript. Chart lib: `lightweight-charts` (candles only; drawings are our overlay).
- `backend` pytest: `pytest`. `frontend` test: `vitest` + React Testing Library.
- CORS: frontend origin to API.

**Done when:** `cd backend && pytest` exits 0 on empty tests; `cd frontend && npx vite build` succeeds on a hello root.

---

## Task 1 — Design system (no product pages)

**Files:** `frontend/src/design-system/tokens.css` and one component file per primitive in [design-system.md](../docs/design-system.md) §4; `frontend/src/pages/Gallery.tsx`; route `/gallery`.

TDD: component tests for `ChangeCell` (positive → up class, negative → down) and `PriceCell` (integer đồng formatting).

**Done when:** `/gallery` shows buttons, table, badges, inputs, tabs, banners, fake chart toolbar using **only** tokens. No hex in page files.

---

## Task 2 — App shell

**Files:** `frontend/src/layouts/AppShell.tsx`, `frontend/src/App.tsx`

Nav: Market, Alerts. Top bar: `finmon`, `AsOf` placeholder, status chip. Min width 1200px. Selected nav uses design-system selected styles.

**Done when:** Gallery and empty Market/Alerts routes share the same chrome.

---

## Task 3 — Database models and migrations

**Files:** `backend/app/models.py`, `backend/app/db.py`, Alembic revision `0001_v1`

Tables from product design §6 that v1 needs: `symbol`, `daily_bar`, `quote_snapshot`, `watchlist_item`, `drawing`, `chart_note`, `page_note`, `page_note_revision`, `price_alert`, `alert_delivery`, `ingest_watermark` (source, job, `as_of`, status).

Prices: integer **đồng**. Unique `(ticker, date)` on bars. SQLite default URL for local; SQLAlchemy so Postgres can replace later.

**Done when:** `alembic upgrade head` creates tables.

---

## Task 4 — DNSE client (no live keys in tests)

**Files:** `backend/app/clients/dnse.py`, `backend/tests/test_dnse_client.py`, `backend/tests/fixtures/dnse_instruments.json`, `dnse_ohlc.json`

HMAC/date signing as DNSE docs. Methods: `list_instruments()`, `ohlc(symbol, from, to)`, `latest_quote(symbol)` (or latest trade — pick whichever DNSE REST documents and **stick to it**). Parse rate-limit headers; on 429 sleep until reset.

Tests: httpx mock transport, no network.

**Done when:** fixtures parse into internal dataclasses (`board`, `ticker`, `ohlcv` in đồng).

---

## Task 5 — Ingest jobs

**Files:** `backend/app/jobs/ingest.py`, `backend/app/main.py` (scheduler)

- Daily: instruments upsert; for each listed stock/ETF/index of interest, daily OHLC (batch, honor 50k/hour). Skip Sat/Sun. ICT.
- Session: every 30 minutes 09:00–15:00 ICT, refresh `quote_snapshot` for watchlist tickers only.
- Write `ingest_watermark`.

Config: `DNSE_API_KEY`, `DNSE_API_SECRET`. If missing, jobs no-op and watermark `error` / health `unconfigured`.

**Done when:** a pytest with mocked DNSE inserts bars and a watchlist quote.

---

## Task 6 — Read APIs for market

**Files:** `backend/app/routers/symbols.py`, `bars.py`, `watchlist.py`, `meta.py`

- `GET /api/health` — watermark, configured flags (not secrets).
- `GET /api/symbols?board=&q=&watchlist=`
- `GET /api/symbols/{ticker}/bars?from=&to=` (default 1y)
- `POST/DELETE /api/watchlist/{ticker}`
- `GET /api/watchlist`

**Done when:** curl against a DB seeded in tests returns catalog rows with last/change from latest bar or snapshot.

---

## Task 7 — Market page

**Files:** `frontend/src/pages/Market.tsx`, `frontend/src/api.ts`

Table: ticker, name, board, last, change, volume. Filter board, search, watchlist toggle. Click row → `/symbol/:ticker`. Pin control writes watchlist API.

Uses `Table`, `ChangeCell`, `PriceCell`, `Badge` only.

**Done when:** seeded API shows HOSE/HNX/UPCOM rows; pin persists after reload.

---

## Task 8 — Indicators (local, daily)

**Files:** `backend/app/indicators.py`, `backend/tests/test_indicators.py`

Functions: `sma`, `ema`, `rsi`, `macd`, `bollinger`, `atr`, `volume_ma` on lists of daily bars. Golden vector of 90 synthetic bars. Frontend may either call `GET /api/symbols/{ticker}/indicators?names=sma:20` or compute in TS — **pick one: Python only**, so there is one definition. Chart fetches overlay series from API.

**Done when:** tests match golden values ±1e-6.

---

## Task 9 — Symbol page: chart

**Files:** `frontend/src/pages/Symbol.tsx`, `frontend/src/chart/DailyChart.tsx`

Load bars + indicators. `lightweight-charts` for candles and volume. Token colors. Toolbar from design system §5 (pan + indicator menu first; drawing tools in Task 10). Ceiling/floor/ref as horizontal lines if quote has them. Empty state if no bars. Header: ticker, last, change, board.

**Done when:** opening a seeded ticker shows a daily candle chart with SMA20 toggle.

---

## Task 10 — Drawings and notes

**Files:** `backend/app/routers/annotations.py`; `frontend/src/chart/drawings.ts`; Symbol right rail

API:

- `GET/PUT /api/symbols/{ticker}/drawings` (array of tools + points `{date, price}`)
- `GET/PUT /api/symbols/{ticker}/chart-notes`
- `GET/PUT /api/symbols/{ticker}/page-note` (body markdown; append revision)

Frontend: overlay canvas/SVG aligned to chart time/price scale; tools horizontal, trend, rectangle, fib, text, pin. Save on mouse-up (debounce 300ms). Rail tab **Note**: textarea, Save note. Toast on save.

**Done when:** reload restores drawings and both note types.

---

## Task 11 — Alert engine + Telegram

**Files:** `backend/app/alerts.py`, `backend/app/clients/telegram.py`, `backend/app/jobs/evaluate_alerts.py`, `backend/app/routers/alerts.py`, `backend/tests/test_alerts.py`, `frontend/src/pages/Alerts.tsx` + Symbol tab Alert

Rules: `gte` / `lte`, `once` | `repeat`, enabled. Evaluate vs `quote_snapshot.last` else last daily close. `once`: set `last_fired_at` only after Telegram HTTP 200. Repeat: at most one fire per ticker per calendar day ICT.

Telegram: bot token + chat id in env. Message: `{ticker} {board} last={price} {op} {level} at {time} ICT`.

Job: run after each hot-list poll and after EOD ingest.

UI: list alerts; create from Symbol (price input, op, once/repeat). Failures: Banner, do not mark fired.

**Done when:** unit tests cover fire / no-fire / once; mocked Telegram; Alerts page CRUD.

---

## Task 12 — Company panel (Vnstock)

**Files:** `backend/app/clients/vnstock_client.py`, `backend/app/routers/company.py`

`GET /api/symbols/{ticker}/company` — profile, statements (year), ratios. Cache in memory or table `company_cache` (ticker, payload json, fetched_at). TTL 24h profile; statements 7 days. On error: 503 with `{error: "unavailable"}`; frontend Company tab EmptyState; chart still works.

Isolate import of `vnstock` so tests mock the client. Respect 60 req/min if uncached.

**Done when:** mock returns VCB-like payload; failure test leaves bars endpoint 200.

---

## Task 13 — Health in the shell

**Files:** `frontend` AppShell wired to `GET /api/health`

Chip: ok / stale (>1 trading day) / error / unconfigured. `AsOf` from watermark.

**Done when:** stopping ingest shows stale/warn chip.

---

## Verification (v1 complete)

1. Gallery still matches tokens (no one-off colors on Market/Symbol).
2. Ingest (mocked or live DNSE) fills catalog; watchlist 30-minute path updates snapshots.
3. Chart + indicators + drawings + page note persist.
4. Price alert sends Telegram (or mock) once.
5. Company tab fails closed.
6. `pytest` and `vitest` green.

Secrets: `.env` gitignored. Never commit DNSE/Telegram keys.

---

## v1.1 (do not implement in this plan’s tasks)

Pattern defs, 90D Pearson look-alike / shape / rule scan, daily+weekly jobs, Scans nav. Same design system: results use the Market `Table`. Plan file later: `plans/v1.1-scanner.md`.

---

## Suggested order of work

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13.

Do not start Market UI before Task 1. Do not call Vnstock from ingest.
