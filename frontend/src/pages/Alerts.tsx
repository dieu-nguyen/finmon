import { useEffect, useState } from "react";
import { api, type Alert } from "../api";
import { Badge, Banner, Button, Input, Select, Table, formatDong } from "../design-system";
import { TrashIcon } from "../design-system/icons";

function condition(op: string): string {
  if (op === "gte") return "≥";
  if (op === "lte") return "≤";
  return op;
}

export function Alerts() {
  const [rows, setRows] = useState<Alert[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ticker, setTicker] = useState("");
  const [price, setPrice] = useState("");
  const [op, setOp] = useState("gte");
  const [mode, setMode] = useState("once");

  const load = () => api.alerts().then(setRows).catch(() => setErr("Failed to load alerts"));
  useEffect(() => {
    load();
  }, []);

  const active = rows.filter((row) => row.enabled).length;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">
          Alerts
          <span className="page-sub">{active} active</span>
        </h1>
      </div>
      {err ? <Banner kind="error">{err}</Banner> : null}
      <form
        className="form-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createAlert({ ticker, op, price: Number(price), mode });
          setTicker("");
          setPrice("");
          load();
        }}
      >
        <div className="form-row">
          <label className="field">
            Ticker
            <Input placeholder="Ticker" aria-label="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} style={{ background: "var(--bg)", width: 120, fontFamily: "var(--font-num)", textTransform: "uppercase" }} />
          </label>
          <label className="field">
            Condition
            <Select value={op} onChange={(e) => setOp(e.target.value)} aria-label="Condition" style={{ background: "var(--bg)" }}>
              <option value="gte">≥</option>
              <option value="lte">≤</option>
            </Select>
          </label>
          <label className="field">
            Price (VND)
            <Input placeholder="Price (đồng)" aria-label="Price" value={price} onChange={(e) => setPrice(e.target.value)} style={{ background: "var(--bg)", width: 140, fontFamily: "var(--font-num)", textAlign: "right" }} />
          </label>
          <label className="field">
            Frequency
            <Select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Frequency" style={{ background: "var(--bg)" }}>
              <option value="once">once</option>
              <option value="repeat">repeat</option>
            </Select>
          </label>
          <div className="form-actions">
            <Button type="submit">Add alert</Button>
          </div>
        </div>
      </form>
      <div className="table-panel">
        <Table className="heads-up sticky-head">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="center">Condition</th>
              <th className="num">Price (VND)</th>
              <th>Frequency</th>
              <th className="center">Status</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="ticker-cell">{r.ticker}</td>
                <td className="center ticker-cell">{condition(r.op)}</td>
                <td className="num">{formatDong(r.price)}</td>
                <td style={{ color: "var(--text-muted)" }}>{r.mode}</td>
                <td className="center">
                  <span title={r.last_fired_at ? `Fired ${r.last_fired_at}` : "Not fired"}>
                    <Badge kind={r.enabled ? "up" : "muted"}>{r.enabled ? "enabled" : "disabled"}</Badge>
                  </span>
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete ${r.ticker}`}
                    title="Delete alert"
                    onClick={async () => {
                      try {
                        await api.deleteAlert(r.id);
                        load();
                      } catch {
                        setErr("Failed to delete alert");
                      }
                    }}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
