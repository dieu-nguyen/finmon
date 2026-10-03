import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type Bar, type SymbolRow } from "../api";
import { displayBoard } from "./Market";
import { Banner, Button, ChangeCell, EmptyState, Input, PriceCell, Select, Spinner, Tabs, Toast } from "../design-system";
import { CompanyPanel } from "./CompanyPanel";
import { DailyChart } from "../chart/DailyChart";
import type { Drawing, DrawingTool } from "../chart/drawings";
import { DEFAULT_INDICATOR_ID, indicatorById } from "../chart/indicators";

/** Shared by the candle request and the indicator request. Both omit from/to so the API applies one default window. */
const CANDLE_RANGE = undefined;

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

export function SymbolPage() {
  const { ticker = "" } = useParams();
  const t = ticker.toUpperCase();
  const [bars, setBars] = useState<Bar[]>([]);
  const [barsTicker, setBarsTicker] = useState("");
  const [row, setRow] = useState<SymbolRow | null>(null);
  const [indicatorId, setIndicatorId] = useState(DEFAULT_INDICATOR_ID);
  const [indicatorData, setIndicatorData] = useState<unknown>(null);
  const [indicatorTicker, setIndicatorTicker] = useState("");
  const [tab, setTab] = useState("Company");
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
        const [b, header, dr, pn] = await Promise.all([
          api.bars(t, CANDLE_RANGE),
          api.symbol(t).catch(() => null),
          api.drawings(t).catch(() => []),
          api.pageNote(t).catch(() => ({ body: "" })),
        ]);
        if (cancelled) return;
        setBars(b);
        setBarsTicker(t);
        setRow(header);
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
    const spec = indicatorById(indicatorId);
    if (!spec.apiName) {
      setIndicatorData(null);
      setIndicatorTicker(t);
      return;
    }
    const ctrl = new AbortController();
    let active = true;
    setIndicatorData(null);
    setIndicatorTicker("");
    api
      .indicators(t, spec.apiName, CANDLE_RANGE, { signal: ctrl.signal })
      .then((body) => {
        if (!active) return;
        setIndicatorData(body[spec.apiName!] ?? null);
        setIndicatorTicker(t);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setIndicatorData(null);
        setIndicatorTicker(t);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [t, indicatorId]);

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
      <div className="symbol-split">
        <div className="chart-frame">
          {bars.length === 0 ? (
            <EmptyState text={`No daily bars for ${t}`} />
          ) : (
            <DailyChart
              ticker={t}
              bars={bars}
              indicatorId={indicatorId}
              indicatorData={barsTicker === t && indicatorTicker === t ? indicatorData : null}
              onIndicator={setIndicatorId}
              drawings={drawings}
              tool={tool}
              onTool={setTool}
              onDrawings={persistDrawings}
            />
          )}
        </div>
        <aside className="rail">
          <Tabs stretch tabs={["Company", "Note", "Alert"]} value={tab} onChange={setTab} />
          <div className="rail-body">
            {tab === "Company" ? (
              company ? <CompanyPanel payload={company} /> : company === null ? <EmptyState text="Company data unavailable" /> : <Spinner />
            ) : null}
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
      {toast ? <Toast text={toast} /> : null}
    </div>
  );
}
