# finmon design system

Source of truth for UI. Implement tokens and primitives **before** any product screen. Do not introduce a third-party component kit (MUI, Chakra, Ant, shadcn). Charts use **Apache ECharts** (`echarts`) only, wrapped so candles, volume, grid, and axis still use these tokens.

Product context: dense Vietnam market monitor (catalog, daily chart, notes, alerts). Single operator. English UI labels; Vietnamese names/tickers as data.

---

## 1. Principles

1. **One surface, one density.** Catalog and chart share the same background, type scale, and control height. No “marketing” page mixed with “terminal” page.
2. **Numbers are first-class.** Prices, %, volume use a tabular figure font. Green is up, red is down, **always** (Vietnam convention: tăng xanh, giảm đỏ). Unchanged is muted.
3. **Chrome is quiet.** Color is for data and status, not decoration. Drawings on the chart are the loudest user layer.
4. **Anchor to data, not pixels.** Chart tools use trading date + price. UI chrome uses 4px spacing.
5. **Stale is visible.** If ingest is old, show as-of time. Never fake freshness.

---

## 2. Tokens

CSS custom properties on `:root`. Dark theme only in v1 (one theme).

### 2.1 Color

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#0e1116` | App background |
| `--bg-elev` | `#161b22` | Panels, table header sticky |
| `--bg-hover` | `#1c2330` | Row hover |
| `--bg-selected` | `#1a2740` | Selected row / active nav |
| `--border` | `#2a3340` | Hairlines |
| `--text` | `#e6edf3` | Primary text |
| `--text-muted` | `#8b9bb4` | Labels, as-of, secondary |
| `--text-faint` | `#5c6b82` | Disabled, axis |
| `--up` | `#3dd68c` | Positive change |
| `--down` | `#f87171` | Negative change |
| `--warn` | `#e3b341` | Stale, once-alert, caution |
| `--accent` | `#6ea8fe` | Focus, links, active tab |
| `--accent-muted` | `#6ea8fe33` | Focus ring fill |
| `--overlay` | `#00000099` | Modal scrim |

Chart plot area uses `--bg`. Grid `--border`. Candle up `--up`, down `--down`. Wick same as body. Volume bars 40% opacity of up/down.

ECharts: set `backgroundColor` to `--bg`; `axisLine`/`splitLine` to `--border`; `axisLabel` to `--text-faint` / `--font-num`; candlestick `itemStyle.color` / `color0` / `borderColor` / `borderColor0` to `--up` / `--down`. Do not keep ECharts’ default red-up palette. Tooltip uses `--bg-elev`, `--text`, `--font-num`.

Drawings: `--accent` default stroke; user may pick from `{accent, up, down, warn, text}`.

### 2.2 Type

| Token | Value |
| --- | --- |
| `--font-ui` | `"IBM Plex Sans", "Noto Sans", sans-serif` |
| `--font-num` | `"IBM Plex Mono", "Noto Sans Mono", ui-monospace, monospace` |
| `--fs-xs` | `11px` |
| `--fs-sm` | `12px` |
| `--fs-md` | `14px` |
| `--fs-lg` | `16px` |
| `--fs-xl` | `20px` |
| `--lh` | `1.4` |
| `--fw-reg` | `400` |
| `--fw-med` | `500` |
| `--fw-bold` | `600` |

Rules: ticker and all prices/%/volume use `--font-num`. Headings `--fs-lg` / `--fw-med`. Table body `--fs-sm`. Never go below 11px.

### 2.3 Space and radius

`--space-1` 4px through `--space-8` 32px (multiples of 4). `--radius` 6px for controls. `--radius-sm` 4px for badges. Tables: no large rounding.

### 2.4 Control size

One control height: **32px**. Icon buttons 32×32. Table row height **36px**. Header height **48px**. Left nav width **220px**.

### 2.5 Motion

150ms opacity/background only. No bounce. Chart pan/zoom via ECharts `dataZoom` (inside + slider), not CSS.

---

## 3. Layout

App shell (all authenticated pages):

```
+------------------+----------------------------------------+
| Brand + as-of    |  (top bar, 48px)                       |
+------------------+----------------------------------------+
| Nav              |  Page                                  |
| Market           |                                        |
| Alerts           |                                        |
| (Scans later)    |                                        |
+------------------+----------------------------------------+
```

- Top bar: product name `finmon`, last ingest time ICT (`YYYY-MM-DD HH:mm ICT`), connection chip (ok / stale / error).
- Nav: text links, selected state `--bg-selected` + `--accent` left bar 2px.
- Page padding `--space-4`.
- Symbol workspace (chart page): **left chart (flex 1)**, **right rail 360px** (tabs: Note / Company / Alert). Drawings live on the chart, not in the rail.

Breakpoints: v1 desktop only, min width 1200px. No mobile layout in v1.

---

## 4. Primitives (build these first)

Implement under `frontend/src/design-system/`. Each primitive: one file, tokens only, no page-specific copy.

| Component | Behavior |
| --- | --- |
| `Button` | variants: primary, ghost, danger. 32px. Disabled opacity 0.4. |
| `IconButton` | 32px, ghost, tooltip via `title`. |
| `Input` | 32px, border `--border`, focus ring `--accent`. |
| `Select` | native styled, same height. |
| `Checkbox` | 16px, accent fill. |
| `Tabs` | underline active, `--accent`. |
| `Badge` | up / down / muted / warn. |
| `Table` | sticky header, hover row, selected row, numeric cells right-aligned + `--font-num`. |
| `Panel` | `--bg-elev`, 1px border. |
| `EmptyState` | muted text + optional action. |
| `Banner` | error / warn / info, dismissible optional. |
| `Toast` | 3s, bottom-right, save/error only. |
| `Modal` | scrim, 480px max, focus trap. |
| `Spinner` | 16px, for panel load (company). Chart uses skeleton bars not spinner. |
| `AsOf` | “as of {time} ICT” muted. |
| `ChangeCell` | signed %, color `--up`/`--down`. |
| `PriceCell` | đồng, no thousand-unit mixing; thousands separators. |

**Do not** add a primitive for every drawing tool. Chart tools are a compact toolbar on the chart panel (see §5).

---

## 5. Chart chrome

Toolbar, left to right, 32px icons: pan, horizontal, trend, rectangle, fib, text, chart-note pin, delete selected. Active tool = `--accent` background.

Legend below toolbar: ticker, last, change badge, optional SMA/EMA chips (toggle).

Empty chart: `EmptyState` “No daily bars for {ticker}”.

Indicator toggles in a overflow “Indicators” menu (checkboxes + period number inputs). Defaults: SMA 20, SMA 50 off until user enables.

---

## 6. Copy and states

| State | UI |
| --- | --- |
| Loading catalog | Table skeleton rows, not a full-page spinner |
| Load error | `Banner` error, retry button |
| Stale data | Top-bar chip warn + `AsOf` |
| Vnstock down | Company tab: `EmptyState` “Company data unavailable”; chart unchanged |
| Alert sent | Toast “Telegram sent” |
| Telegram fail | Banner on Alerts page; alert stays unsent |

Buttons: “Save note”, “Add alert”, “Pin to watchlist”. No “Submit”.

---

## 7. Accessibility (v1 bar)

- Focus visible (`--accent` outline 2px).
- Icon buttons have `aria-label`.
- Table sortable columns: `aria-sort`.
- Contrast: muted text on `--bg` must stay readable; do not lighten `--text-muted` further.

---

## 8. Gallery

`frontend` dev route `/gallery` renders every primitive and a fake table + fake chart chrome with token colors. No network. This is the regression surface for visual consistency.
