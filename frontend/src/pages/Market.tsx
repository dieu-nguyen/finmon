import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SymbolPage, type SymbolRow } from "../api";
import { Banner, Button, ChangeCell, Checkbox, EmptyState, Input, PriceCell, Select, Table, Tabs } from "../design-system";

type Segment = "stock" | "etf" | "index";

const SEGMENT_LABEL: Record<Segment, string> = {
  stock: "Stocks",
  etf: "Funds",
  index: "Indices",
};

const LABEL_SEGMENT: Record<string, Segment> = {
  Stocks: "stock",
  Funds: "etf",
  Indices: "index",
};

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
      <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>Market</h1>
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
      <div style={{ margin: "var(--space-3) 0" }}>
        <Tabs
          tabs={["Stocks", "Funds", "Indices"]}
          value={SEGMENT_LABEL[segment]}
          onChange={(label) => {
            const next = LABEL_SEGMENT[label] ?? "stock";
            setSegment(next);
            if (next !== "stock") setBoard("");
          }}
        />
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-3) 0" }}>
        {segment === "stock" ? (
          <Select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Board">
            <option value="">All</option>
            <option value="HOSE">HOSE</option>
            <option value="HNX">HNX</option>
            <option value="UPCOM">UPCOM</option>
          </Select>
        ) : null}
        <Input placeholder="Search ticker or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Checkbox checked={onlyWatch} onChange={(e) => setOnlyWatch(e.target.checked)} />
          Watchlist
        </label>
      </div>
      {widened ? <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>These matches are outside the current filter.</p> : null}
      {page.items.length === 0 && !err ? <EmptyState text="No symbols" /> : null}
      {page.items.length > 0 ? (
        <Table>
          <thead>
            <tr>
              {["Ticker", "Name", "Board", "Last", "Change", "Volume", "Pin"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Last" || h === "Change" || h === "Volume" ? "right" : "left",
                    borderBottom: "1px solid var(--border)",
                    height: 36,
                    position: "sticky",
                    top: 0,
                    background: "var(--bg-elev)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.items.map((r) => {
              const hint = widened ? typeHint(segment, r) : null;
              return (
                <tr
                  key={r.ticker}
                  onClick={() => nav(`/symbol/${r.ticker}`)}
                  style={{ height: 36, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ fontFamily: "var(--font-num)" }}>{r.ticker}</td>
                  <td>
                    {r.name}
                    {hint ? <span style={{ color: "var(--text-muted)" }}> · {hint}</span> : null}
                  </td>
                  <td>{displayBoard(r.board)}</td>
                  <td style={{ textAlign: "right" }}>
                    <PriceCell value={r.last} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <ChangeCell value={r.change} />
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-num)" }}>{r.volume ?? "—"}</td>
                  <td>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (r.watchlist) await api.unpin(r.ticker);
                        else await api.pin(r.ticker);
                        setReloadKey((n) => n + 1);
                      }}
                      style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)", height: 32 }}
                    >
                      {r.watchlist ? "Unpin" : "Pin to watchlist"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}
      {searching ? null : (
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-3)" }}>
          <Button variant="ghost" disabled={offset <= 0} onClick={() => setOffset((n) => Math.max(0, n - 50))}>
            Previous
          </Button>
          <Button variant="ghost" disabled={offset + page.limit >= page.total} onClick={() => setOffset((n) => n + 50)}>
            Next
          </Button>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)", fontFamily: "var(--font-num)" }}>
            {from}–{to} of {page.total}
          </span>
        </div>
      )}
    </div>
  );
}
