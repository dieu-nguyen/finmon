import { useEffect, useState } from "react";
import { api, type Alert } from "../api";
import { Banner, Button, Input, Select, Table } from "../design-system";

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

  return (
    <div>
      <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>Alerts</h1>
      {err ? <Banner kind="error">{err}</Banner> : null}
      <form
        style={{ display: "flex", gap: 8, margin: "12px 0" }}
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createAlert({ ticker, op, price: Number(price), mode });
          setTicker("");
          setPrice("");
          load();
        }}
      >
        <Input placeholder="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
        <Select value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="gte">gte</option>
          <option value="lte">lte</option>
        </Select>
        <Input placeholder="Price (đồng)" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="once">once</option>
          <option value="repeat">repeat</option>
        </Select>
        <Button type="submit">Add alert</Button>
      </form>
      <Table>
        <thead>
          <tr>
            {["Ticker", "Op", "Price", "Mode", "Fired"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--border)", height: 36 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ height: 36 }}>
              <td style={{ fontFamily: "var(--font-num)" }}>{r.ticker}</td>
              <td>{r.op}</td>
              <td style={{ fontFamily: "var(--font-num)" }}>{r.price}</td>
              <td>{r.mode}</td>
              <td>{r.last_fired_at ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
