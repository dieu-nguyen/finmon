# History backfill and the session candle

Build spec for the price cadence in `docs/product-design.md`.
Decision: `docs/adr/0001-backfill-process.md`.

Accepted design, 2026-09-26. Implemented by the backfill command, the 30-minute quote candle, and `start.sh`.

`start.sh` launches history backfill as its own process, separate from the API. That process catches up immediately, then runs again at 16:30 ICT on weekdays for as long as `start.sh` stays up. The API process keeps the 30-minute watchlist poll, and that poll maintains today's candle for pinned tickers until the after-close backfill replaces it. The weekday 16:30 history job inside the API process goes away.

This document supersedes the product-design cadence for the instrument list and daily OHLCV ("daily" / "after close" / "catalog EOD"). Company data, indicators, alerts rules, and drawings stay as in the product design.

---

## 1. Why

The API process is not always running. A cron inside that process misses its slot whenever the UI is stopped, and it does not replay the miss.

The current history job also cannot resume. It asks DNSE for the last 400 days for every symbol, then writes one watermark for the whole run. A stop in the middle downloads those 400 days again next time, and it never walks further back than 400 days.

Daily bars are already unique on `(ticker, date)`, so writing the same day again updates the row. What is missing is a per-ticker cursor.

---

## 2. Two writers

Both write `daily_bar`. They stay apart by the `source` column that already exists on that table.

| Writer | When it runs | What it writes |
| --- | --- | --- |
| `python -m app.jobs.backfill`, started by `start.sh` | Once at launch, then weekdays at 16:30 ICT while `start.sh` is still up | Symbol list, full daily history, catch-up of missing days. `daily_bar.source = dnse` |
| 30-minute job inside the API | Weekdays while the API is up, during the session | `quote_snapshot` for pinned tickers, and today's forming candle with `daily_bar.source = quote` |

A `dnse` bar is the exchange OHLC. A `quote` bar is built from sampled last prices. The chart reads `daily_bar` either way and draws one candle per date.

### Screens

| Surface | Source |
| --- | --- |
| Chart candles, volume, indicators | `daily_bar` only |
| Market table Last, and the price beside the ticker | `quote_snapshot.last` when that row exists, otherwise the newest daily close |
| Change | That last price against the newest daily close |
| Volume column | Newest `daily_bar.volume` |
| Price alerts | `quote_snapshot.last`, otherwise the newest daily close |

`quote_snapshot` still stores `last`, `ref`, `ceiling`, and `floor`. Those three band fields are not used to build the candle.

---

## 3. Remove the 16:30 history job

Delete the API scheduler job at 16:30 ICT (`_run_eod` / `ingest_instruments_and_bars`). History has one writer: the backfill process. `start.sh` owns that process. The API scheduler does not.

The 30-minute scheduler stays:

- Weekdays, minute 0 and 30, hours 09 through 14 ICT
- Weekdays at 15:00 ICT
- Skip Saturday and Sunday, and skip when the clock is outside that session

Each of those runs still evaluates price alerts, including the 15:00 run. There is no second alert pass at 16:30. Alerts fire only while the API process is up for that poll.

`ingest_instruments_and_bars` (the fixed 400-day download and the weekend skip) is retired with the cron. The backfill command replaces it.

---

## 4. Backfill command

`start.sh` starts this after migrations, as a third process beside the API and the web app:

```bash
python -m app.jobs.backfill --follow
```

`--follow` runs one catch-up immediately, then sleeps until the next weekday 16:30 ICT and runs again, and repeats that wait until the process is stopped. `start.sh` prints that backfill is running. The UI and API come up without waiting for the catch-up to finish. Bars appear on the chart as each ticker commits.

Ctrl+C on `start.sh` sends SIGINT to the backfill process, waits for the current chunk to commit, then stops the API and the web app.

The same catch-up runs once and exits, without starting the API or the UI. Use this when you want history updated and the app left stopped:

```bash
python -m app.jobs.backfill
python -m app.jobs.backfill --ticker VCB
```

The first form catches up every listed symbol. `--ticker` limits that pass to one symbol. Both use the same cursor, so a later `start.sh` continues from wherever this run stopped. Same DNSE key and secret, same MySQL database as the API.

A MySQL named lock `finmon_backfill` is taken for each catch-up pass. If another pass holds it, this pass exits immediately and prints that a backfill is already running. With `--follow`, that exit does not kill the waiter: it sleeps until the next 16:30 and tries again.

Scope: listed stocks, ETFs, and indexes from DNSE `GET /instruments`. One process, one ticker at a time. Company fundamentals and live quotes are out of this command.

Futures and bonds are not fetched. A `bar_sync` row whose symbol is a future or a bond, or whose board is `DVX` or `HCX`, is set to `skipped` and DNSE OHLC is not called. A warrant that returns bars is synced with the stocks, ETFs, and indexes. A warrant that returns HTTP 400 is set to `skipped` and is not requested again. A stock, ETF, or index that returns HTTP 400 stays `error` and is retried on a later run.

The first pass walks history backward until DNSE returns an empty window. Later passes download only the days after `newest_date`, including a gap of several days if `start.sh` was stopped. Completed history is not downloaded again.

A missing key, 401, or 403 is printed once and is not retried in a loop. A one-shot run (no `--follow`) still exits non-zero on those failures. A rate limit does not end the pass: section 4.5 sleeps until the window resets and continues.

### 4.1 Cursor

New table `bar_sync`, one row per ticker:

| Column | Meaning |
| --- | --- |
| `ticker` | Primary key |
| `oldest_date` | Oldest date stored in `daily_bar` |
| `newest_date` | Newest date stored in `daily_bar` |
| `history_floor` | Oldest date DNSE has confirmed. Nothing earlier exists |
| `status` | `pending`, `partial`, `complete`, `error`, or `skipped` |
| `last_error` | Last failure for this ticker. Empty when the last chunk succeeded |
| `updated_at` | When the last chunk was committed |

`oldest_date` and `newest_date` match the bars just committed. `history_floor` is the proof that the backward walk is finished. `MIN(date)` and `MAX(date)` alone cannot record that proof.

### 4.2 One run

1. Require DNSE API key and secret. Exit with a clear message when they are missing.
2. `GET /instruments`, upsert the listed symbols, and keep stock, ETF, index, and warrant for OHLC. The market page can list names before any bars exist.
3. Ensure every wanted symbol has a `bar_sync` row (`pending` when new).
4. Build the work list. A ticker is done when `history_floor` is set and `newest_date` is on or after the latest weekday on or before today (Asia/Ho_Chi_Minh). A `skipped` row is not work. Everything else is work: `partial` and `error` first, then `pending`, ticker order stable. `--ticker` limits the list to that symbol.
5. For each ticker, fill forward, then backward. Commit after each chunk. See 4.3.
6. Print one summary line: completed, still partial, error, and skipped counts.

**Target end date.** On a weekday before 16:30 ICT, the target is the previous weekday. Today's candle stays with the 30-minute job. At 16:30 ICT and after, and all day Saturday and Sunday, the target is the latest weekday on or before today, so today's official bar is included.

### 4.3 Chunks

Prices are integer đồng, same as the rest of the store.

**Forward.** When `newest_date` is behind the target end date, one OHLC request covers `(newest_date, target]`. Upsert those bars with `source = dnse` and commit. This replaces a `quote` candle for the same date, including today's forming candle.

**Backward.** While `history_floor` is empty, request the next 365-day window before `oldest_date`. When the ticker has no bars yet, the first window ends today and starts 365 days earlier. Upsert and commit.

- A window that returns bars moves `oldest_date` earlier. The next window starts at the day before the oldest bar returned, so a truncated response is continued.
- A window that returns zero bars sets `history_floor`. The ticker's history is complete on the old side.
- A ticker DNSE has never traded ends `complete` with no bars and `history_floor` set.
- Calendar gaps inside a window stay empty. Halted days are not filled with synthetic bars.

**Done for this ticker** when `history_floor` is set and the forward window through the target end date has been requested (bars upserted, or the window was empty because of a holiday or a not-yet-listed day).

### 4.4 Where the next run starts

| Situation | Next run |
| --- | --- |
| Empty `daily_bar` | Walk backward in 365-day chunks until an empty window, and forward through the target end date |
| Stopped on VCB after four years | Earlier tickers with `complete` are skipped. VCB stays `partial` and continues at its oldest missing window |
| Bars exist through 26 Aug, today is 26 Sep | Forward request is 27 Aug through the latest weekday |
| `history_floor` is set | Backward walk is skipped |
| One ticker failed last time | That ticker is retried. A completed universe is skipped |

Re-running a finished ticker upserts the same dates. Rows are not duplicated.

### 4.5 Failures, rate limit, Ctrl+C

| Case | What the process does |
| --- | --- |
| One ticker returns 404 or another per-symbol error | Set that `bar_sync` row to `error` with `last_error`, continue with the next ticker. A warrant HTTP 400 is `skipped` instead |
| 401 or 403 | Stop the run. The key is rejected |
| 429 | Sleep until `X-RateLimit-Reset`, then retry the same chunk in this pass |
| Ctrl+C | Finish the current chunk commit, print the ticker, exit |

DNSE limits are per API key and per endpoint. Backfill calls two of them:

| Endpoint | Published rate (per hour) | Published quota (per 24h) | Backfill pauses itself at |
| --- | --- | --- | --- |
| `GET /instruments` | 10,000 | 100,000 | 8,000 in the rolling hour |
| `GET /price/ohlc` | 50,000 | 100,000 | 45,000 in the rolling hour, or 90,000 in the rolling 24h |

The 30-minute job calls latest trade, latest quote, and security definition. Those are separate endpoint buckets, so a backfill does not spend the quote job's allowance, and the quote job does not spend the OHLC allowance.

The backfill sends one request at a time. After every response it reads `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. It also counts its own calls in a rolling hour and a rolling 24 hours.

It sleeps before the next request when either of these is true:

- The local count has reached the pause row in the table above.
- `X-RateLimit-Remaining` is under 100.

Sleep lasts until `X-RateLimit-Reset` when that header is present. Otherwise it lasts until the oldest call in the local window is old enough that the count drops under the pause line. The current chunk is committed before the sleep, so stopping during the wait keeps that progress. The same pass continues with the next chunk after the sleep. This wait is the full reset interval. The DNSE client's 30-second cap on 429 retries does not apply to backfill calls.

A 429 follows the same wait: sleep until reset, then retry that chunk. The ticker stays `partial` only if the process is stopped during the wait. `--follow` does not start a second copy while this pass is sleeping. A one-shot run waits the same way and then finishes its queue.

A pass exits 0 when its queue is finished. It exits non-zero when it stopped early (lock held, missing keys, or auth failure).

### 4.6 During the session

A pass before 16:30 ICT does not request today's OHLC and does not overwrite today's `quote` bar. Pinned tickers keep the forming candle from section 5.

The 16:30 pass, and any pass started after 16:30 or on a weekend, writes today's DNSE bar with `source = dnse` and replaces the `quote` candle. After that row exists, the 30-minute job leaves it alone (section 5).

If `start.sh` is stopped before 16:30, that after-close pass does not run. The next `start.sh` performs it: immediately, because the clock is already past 16:30 or the day has rolled over.

---

## 5. 30-minute job and today's candle

The job still runs only for watchlist tickers, and only on the schedule in section 3.

For each pinned ticker, on each poll:

1. Load the live quote the way the job does now: latest trade, latest quote, and security definition. Keep `last`, `ref`, `ceiling`, and `floor`.
2. Upsert `quote_snapshot` (last, ref, ceiling, floor, time the job saved the row, source `dnse`).
3. Maintain today's `daily_bar` from `last`, using the rules below.
4. Evaluate alerts from `quote_snapshot.last`.

Quote fields stored, in đồng (`92.6` from DNSE is stored as `92600`):

| Field | Meaning |
| --- | --- |
| `last` | Latest matched trade. This is the only field that moves the candle |
| `ref` | Session reference price (prior close the band is built from) |
| `ceiling` | Highest price allowed today |
| `floor` | Lowest price allowed today |

Bid, ask, and volume are not in this snapshot. The forming candle's volume stays 0 until a backfill writes the real volume.

### 5.1 Building today's row

Today is the ICT calendar date.

When today's `daily_bar` is missing, insert:

- `open` = previous daily close. When no previous bar exists, `open` = `last`
- `high` = `last`
- `low` = `last`
- `close` = `last`
- `volume` = 0
- `value` = 0
- `source` = `quote`

When today's row exists and `source` is `quote`:

- `high` = `max(stored high, last)`
- `low` = `min(stored low, last)`
- `close` = `last`
- `open`, `volume`, and `value` stay as stored

When today's row exists and `source` is `dnse`, do not change it. The quote snapshot still updates, so the Last column keeps moving. The candle stays on the exchange OHLC.

### 5.2 What that candle gets wrong until backfill

- **Open** is the previous close, so a gap at the opening auction does not appear. The real open is the first match.
- **High and low** are the `last` prices seen at each poll, about every 30 minutes, plus the 15:00 run. A spike between polls is missing.
- **Volume** is 0.

Backfill overwrites that `(ticker, today)` row with DNSE open, high, low, close, volume, and value, and sets `source` to `dnse`.

---

## 6. Tests

Use the existing DNSE fixtures. No live keys.

- Second backfill run requests only the forward gap.
- A failure after ticker A skips A on the next run and resumes the partial ticker.
- An empty older window sets `history_floor`.
- A weekend run still fetches through the latest weekday.
- A weekday run before 16:30 ICT stops at the previous weekday and leaves today's `quote` bar in place.
- A run at or after 16:30 ICT replaces today's `quote` bar with DNSE OHLC.
- The backfill sleeps before the next OHLC call when its own hourly count reaches 45,000, when its 24h count reaches 90,000, or when `X-RateLimit-Remaining` is under 100, then continues the same pass.
- A 429 sleeps until `X-RateLimit-Reset` and retries the same chunk. The 30-second client cap is not used.
- A second process exits while the named lock is held.
- The 30-minute path inserts today's `quote` bar from the first `last`, then raises high and lowers low on later lasts, and leaves `open` unchanged.
- A `dnse` bar for today is left unchanged by a later quote poll.
- Backfill upsert of the same date replaces `source = quote` with `source = dnse` and the OHLC payload.

---

## 7. Out of scope

- An operating-system cron outside `start.sh`. Catch-up runs when `start.sh` starts, and at 16:30 ICT only while that process is still up.
- Moving the 30-minute quote poll out of the API process.
- Drawing the candle from ceiling, floor, or reference price.
- Intraday bars, WebSocket, or a second vendor.
- Company / Vnstock data.
