import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SymbolRow } from "../api";
import { Banner, Button, ChangeCell, Checkbox, Input, PriceCell, Select, Table } from "../design-system";

export function Market() {
  const [rows, setRows] = useState<SymbolRow[]>([]);
  const [board, setBoard] = useState("");
  const [q, setQ] = useState("");
  const [onlyWatch, setOnlyWatch] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  const load = () => {
    const params = new URLSearchParams();
    if (board) params.set("board", board);
    if (q) params.set("q", q);
    if (onlyWatch) params.set("watchlist", "true");
    api
      .symbols(`?${params.toString()}`)
      .then(setRows)
      .catch(() => setErr("Load error"));
  };

  useEffect(() => {
    load();
  }, [board, q, onlyWatch]);

  const boards = useMemo(() => ["", "HOSE", "HNX", "UPCOM"], []);

  return (
    <div>
      <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>Market</h1>
      {err ? (
        <Banner kind="error">
          {err} <Button onClick={load}>Retry</Button>
        </Banner>
      ) : null}
      <div style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-3) 0" }}>
        <Select value={board} onChange={(e) => setBoard(e.target.value)}>
          {boards.map((b) => (
            <option key={b} value={b}>
              {b || "All boards"}
            </option>
          ))}
        </Select>
        <Input placeholder="Search ticker or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Checkbox checked={onlyWatch} onChange={(e) => setOnlyWatch(e.target.checked)} />
          Watchlist
        </label>
      </div>
      <Table>
        <thead>
          <tr>
            {["Ticker", "Name", "Board", "Last", "Change", "Volume", "Pin"].map((h) => (
              <th key={h} style={{ textAlign: h === "Last" || h === "Change" || h === "Volume" ? "right" : "left", borderBottom: "1px solid var(--border)", height: 36, position: "sticky", top: 0, background: "var(--bg-elev)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.ticker}
              onClick={() => nav(`/symbol/${r.ticker}`)}
              style={{ height: 36, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ fontFamily: "var(--font-num)" }}>{r.ticker}</td>
              <td>{r.name}</td>
              <td>{r.board}</td>
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
                    load();
                  }}
                  style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)", height: 32 }}
                >
                  {r.watchlist ? "Unpin" : "Pin to watchlist"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
