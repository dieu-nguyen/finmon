import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type Bar, type SymbolRow } from "../api";
import { displayBoard } from "./Market";
import { Banner, Button, ChangeCell, EmptyState, Input, PriceCell, Select, Spinner, Tabs, Toast } from "../design-system";
import { CompanyPanel } from "./CompanyPanel";
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
  const [company, setCompany] = useState<Record<string, unknown> | null | undefined>(undefined);
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
        const [b, header, ind, dr, pn] = await Promise.all([
          api.bars(t),
          api.symbol(t).catch(() => null),
          api.indicators(t, "sma:20").catch(() => ({})),
          api.drawings(t).catch(() => []),
          api.pageNote(t).catch(() => ({ body: "" })),
        ]);
        if (cancelled) return;
        setBars(b);
        setRow(header);
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
    let cancelled = false;
    setCompany(undefined);
    api
      .company(t)
      .then((p) => {
        if (!cancelled) setCompany(p);
      })
      .catch(() => {
        if (!cancelled) setCompany(null);
      });
    return () => {
      cancelled = true;
    };
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

  const last = row?.last ?? bars.at(-1)?.close ?? null;

  return (
    <div className="symbol-page">
      <div className="quote">
        <div className="quote-id">
          <h1 className="quote-ticker">{t}</h1>
          {row?.board ? <span className="board-pill">{displayBoard(row.board)}</span> : null}
          {row?.name ? <span className="quote-name">{row.name}</span> : null}
        </div>
        <div className="quote-px">
          <PriceCell value={last} />
          <ChangeCell value={row?.change ?? null} />
        </div>
      </div>
      {err ? <Banner kind="error">{err}</Banner> : null}
      {tab === "Company" ? (
        <div className="company-screen">
          <Tabs stretch tabs={["Note", "Company", "Alert"]} value={tab} onChange={setTab} />
          <div style={{ marginTop: 16 }}>
            {company ? <CompanyPanel payload={company} /> : company === null ? <EmptyState text="Company data unavailable" /> : <Spinner />}
          </div>
        </div>
      ) : (
        <div className="symbol-split">
          <div className="chart-frame">
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
          <aside className="rail">
            <Tabs stretch tabs={["Note", "Company", "Alert"]} value={tab} onChange={setTab} />
            <div className="rail-body">
              {tab === "Note" ? (
                <>
                  <textarea className="note-box" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
                  <Button
                    onClick={async () => {
                      await api.savePageNote(t, note);
                      setToast("Saved");
                      window.setTimeout(() => setToast(null), 3000);
                    }}
                  >
                    Save note
                  </Button>
                </>
              ) : null}
              {tab === "Alert" ? (
                <form
                  className="field-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await api.createAlert({ ticker: t, op, price: Number(price), mode });
                    setToast("Saved");
                    window.setTimeout(() => setToast(null), 3000);
                  }}
                >
                  <label className="field">
                    Condition
                    <Select value={op} onChange={(e) => setOp(e.target.value)} aria-label="Condition">
                      <option value="gte">≥</option>
                      <option value="lte">≤</option>
                    </Select>
                  </label>
                  <label className="field">
                    Price
                    <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (đồng)" aria-label="Price" />
                  </label>
                  <label className="field">
                    Frequency
                    <Select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Frequency">
                      <option value="once">once</option>
                      <option value="repeat">repeat</option>
                    </Select>
                  </label>
                  <Button type="submit">Add alert</Button>
                </form>
              ) : null}
            </div>
          </aside>
        </div>
      )}
      {toast ? <Toast text={toast} /> : null}
    </div>
  );
}
