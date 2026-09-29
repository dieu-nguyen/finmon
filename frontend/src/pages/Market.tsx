import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SymbolPage, type SymbolRow } from "../api";
import { Banner, Button, ChangeCell, Checkbox, EmptyState, Input, PriceCell, Segmented, Table, formatDong } from "../design-system";
import { PinIcon } from "../design-system/icons";

type Segment = "stock" | "etf" | "index";

const BOARDS = [
  { value: "", label: "All" },
  { value: "HOSE", label: "HOSE" },
  { value: "HNX", label: "HNX" },
  { value: "UPCOM", label: "UPCOM" },
];

export function displayBoard(board: string): string {
  return board === "UPX" ? "UPCOM" : board;
}

function typeHint(segment: Segment, row: SymbolRow): string | null {
  if (row.type === segment) return null;
  if (row.type === "etf") return "ETF";
  if (row.type === "index") return "Index";
  if (row.type === "bond") return "Bond";
  return row.type;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function Market() {
  const [segment, setSegment] = useState<Segment>("stock");
  const [board, setBoard] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [onlyWatch, setOnlyWatch] = useState(false);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<SymbolPage>({ items: [], total: 0, limit: 50, offset: 0 });
  const [widened, setWidened] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [q]);

  const filterKey = `${segment}|${board}|${onlyWatch}|${debouncedQ}`;
  const [seenFilter, setSeenFilter] = useState(filterKey);
  if (seenFilter !== filterKey) {
    setSeenFilter(filterKey);
    setOffset(0);
  }

  useEffect(() => {
    const ctrl = new AbortController();
    let active = true;
    const requestOffset = debouncedQ ? 0 : offset;
    const narrow = new URLSearchParams();
    narrow.set("type", segment);
    narrow.set("limit", "50");
    narrow.set("offset", String(requestOffset));
    if (segment === "stock" && board) narrow.set("board", board);
    if (debouncedQ) narrow.set("q", debouncedQ);
    if (onlyWatch) narrow.set("watchlist", "true");

    const apply = (next: SymbolPage, outside: boolean) => {
      if (!active) return;
      setWidened(outside);
      setPage(next);
      setErr(null);
    };

    api
      .symbols(`?${narrow.toString()}`, { signal: ctrl.signal })
      .then(async (narrowPage) => {
        if (!active) return;
        if (!debouncedQ || narrowPage.items.length > 0) {
          apply(narrowPage, false);
          return;
        }
        const wide = new URLSearchParams();
        wide.set("type", "all");
        wide.set("limit", "50");
        wide.set("offset", "0");
        wide.set("q", debouncedQ);
        if (onlyWatch) wide.set("watchlist", "true");
        const widePage = await api.symbols(`?${wide.toString()}`, { signal: ctrl.signal });
        apply(widePage, true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setErr("Load error");
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [segment, board, onlyWatch, debouncedQ, offset, reloadKey]);

  const searching = debouncedQ.length > 0;
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = page.offset + page.items.length;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Market</h1>
        <Segmented
          label="Segment"
          value={segment}
          options={[
            { value: "stock", label: "Stocks" },
            { value: "etf", label: "Funds" },
            { value: "index", label: "Indices" },
          ]}
          onChange={(value) => {
            const next = value as Segment;
            setSegment(next);
            if (next !== "stock") setBoard("");
          }}
        />
      </div>
      {err ? (
        <Banner kind="error">
          {err}{" "}
          <Button
            onClick={() => {
              setErr(null);
              setReloadKey((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </Banner>
      ) : null}
      <div className="toolbar">
        {segment === "stock" ? <Segmented label="Board" value={board} options={BOARDS} onChange={setBoard} /> : null}
        <Input className="search-input" placeholder="Search ticker or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <label className="check-label">
          <Checkbox checked={onlyWatch} onChange={(e) => setOnlyWatch(e.target.checked)} />
          Watchlist
        </label>
      </div>
      {widened ? <p className="filter-note">These matches are outside the current filter.</p> : null}
      {page.items.length === 0 && !err ? <EmptyState text="No symbols" /> : null}
      {page.items.length > 0 ? (
        <div className="table-panel">
          <Table className="heads-up sticky-head market-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Board</th>
                <th className="num">Last</th>
                <th className="num">Change</th>
                <th className="num">Volume</th>
                <th className="pin-col">
                  <span className="sr-only">Pin</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((r) => {
                const hint = widened ? typeHint(segment, r) : null;
                return (
                  <tr key={r.ticker} onClick={() => nav(`/symbol/${r.ticker}`)}>
                    <td className="ticker-cell">{r.ticker}</td>
                    <td>
                      {r.name}
                      {hint ? <span style={{ color: "var(--text-muted)" }}> · {hint}</span> : null}
                    </td>
                    <td>
                      <span className="board-pill">{displayBoard(r.board)}</span>
                    </td>
                    <td className="num">
                      <PriceCell value={r.last} />
                    </td>
                    <td className="num">
                      <ChangeCell value={r.change} />
                    </td>
                    <td className="num">{formatDong(r.volume)}</td>
                    <td className="pin-col">
                      <button
                        type="button"
                        className={r.watchlist ? "pin-btn on" : "pin-btn"}
                        aria-label={r.watchlist ? "Unpin" : "Pin"}
                        title={r.watchlist ? "Unpin" : "Pin"}
                        aria-pressed={r.watchlist}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (r.watchlist) await api.unpin(r.ticker);
                          else await api.pin(r.ticker);
                          setReloadKey((n) => n + 1);
                        }}
                      >
                        <PinIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ) : null}
      {searching ? null : (
        <div className="pager">
          <span>
            {from}–{to} of {formatCount(page.total)}
          </span>
          <div className="pager-actions">
            <Button variant="ghost" disabled={offset <= 0} onClick={() => setOffset((n) => Math.max(0, n - 50))}>
              Previous
            </Button>
            <Button variant="ghost" disabled={offset + page.limit >= page.total} onClick={() => setOffset((n) => n + 50)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
