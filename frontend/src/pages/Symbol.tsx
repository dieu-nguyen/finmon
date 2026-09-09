import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type Bar, type SymbolRow } from "../api";
import { Banner, Button, ChangeCell, EmptyState, Input, PriceCell, Select, Tabs, Toast } from "../design-system";
import { DailyChart } from "../chart/DailyChart";
import type { Drawing, DrawingTool } from "../chart/drawings";

export function SymbolPage() {
  const { ticker = "" } = useParams();
  const t = ticker.toUpperCase();
  const [bars, setBars] = useState<Bar[]>([]);
  const [row, setRow] = useState<SymbolRow | null>(null);
  const [sma, setSma] = useState<(number | null)[]>([]);
  const [showSma, setShowSma] = useState(true);
  const [tab, setTab] = useState("Note");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<DrawingTool>("pan");
  const [op, setOp] = useState("gte");
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState("once");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, symbols, ind, dr, pn] = await Promise.all([
          api.bars(t),
          api.symbols(`?q=${t}`),
          api.indicators(t, "sma:20").catch(() => ({})),
          api.drawings(t).catch(() => []),
          api.pageNote(t).catch(() => ({ body: "" })),
        ]);
        if (cancelled) return;
        setBars(b);
        setRow(symbols.find((s) => s.ticker === t) || null);
        const indRaw = (ind as Record<string, unknown>)["sma:20"];
        setSma(Array.isArray(indRaw) ? (indRaw as (number | null)[]) : []);
        setDrawings((dr as Drawing[]) || []);
        setNote(pn.body || "");
      } catch {
        if (!cancelled) setErr("Failed to load symbol");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (tab !== "Company") return;
    api
      .company(t)
      .then((p) => setCompany(JSON.stringify(p, null, 2)))
      .catch(() => setCompany(null));
  }, [tab, t]);

  const persistDrawings = (d: Drawing[]) => {
    setDrawings(d);
    window.setTimeout(() => {
      api.saveDrawings(t, d).then(() => {
        setToast("Saved");
        window.setTimeout(() => setToast(null), 3000);
      });
    }, 300);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "var(--space-4)", minHeight: 0 }}>
      <div>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <h1 style={{ fontFamily: "var(--font-num)", fontSize: "var(--fs-xl)", margin: 0 }}>{t}</h1>
          <PriceCell value={row?.last ?? bars.at(-1)?.close ?? null} />
          <ChangeCell value={row?.change ?? null} />
          <span style={{ color: "var(--text-muted)" }}>{row?.board}</span>
        </div>
        {err ? <Banner kind="error">{err}</Banner> : null}
        {bars.length === 0 ? (
          <EmptyState text={`No daily bars for ${t}`} />
        ) : (
          <DailyChart
            ticker={t}
            bars={bars}
            sma20={sma}
            showSma={showSma}
            onToggleSma={() => setShowSma((v) => !v)}
            drawings={drawings}
            tool={tool}
            onTool={setTool}
            onDrawings={persistDrawings}
          />
        )}
      </div>
      <aside>
        <Tabs tabs={["Note", "Company", "Alert"]} value={tab} onChange={setTab} />
        {tab === "Note" ? (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 240, background: "var(--bg-elev)", border: "1px solid var(--border)", color: "var(--text)", padding: 8 }}
            />
            <Button
              onClick={async () => {
                await api.savePageNote(t, note);
                setToast("Saved");
                window.setTimeout(() => setToast(null), 3000);
              }}
            >
              Save note
            </Button>
          </div>
        ) : null}
        {tab === "Company" ? company ? <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{company}</pre> : <EmptyState text="Company data unavailable" /> : null}
        {tab === "Alert" ? (
          <form
            style={{ display: "grid", gap: 8, marginTop: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              await api.createAlert({ ticker: t, op, price: Number(price), mode });
              setToast("Saved");
              window.setTimeout(() => setToast(null), 3000);
            }}
          >
            <Select value={op} onChange={(e) => setOp(e.target.value)}>
              <option value="gte">gte</option>
              <option value="lte">lte</option>
            </Select>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (đồng)" />
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="once">once</option>
              <option value="repeat">repeat</option>
            </Select>
            <Button type="submit">Add alert</Button>
          </form>
        ) : null}
      </aside>
      {toast ? <Toast text={toast} /> : null}
    </div>
  );
}
