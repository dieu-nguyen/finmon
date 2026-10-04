import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, type Bar, type NamedMatch, type SymbolRow } from "../api";
import { displayBoard } from "./Market";
import { Banner, Button, ChangeCell, EmptyState, Input, PriceCell, Select, Spinner, Tabs, Toast } from "../design-system";
import { CompanyPanel } from "./CompanyPanel";
import { DailyChart } from "../chart/DailyChart";
import type { Drawing, DrawingTool } from "../chart/drawings";
import { DEFAULT_INDICATOR_IDS, indicatorQuery } from "../chart/indicators";
import { markFrom, patternLabel, stateLabel, type PatternMark } from "../chart/patternMarks";

type SavedHit = { pattern: string; state: string; score: number; mark: PatternMark };

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
  const [indicatorIds, setIndicatorIds] = useState<string[]>(DEFAULT_INDICATOR_IDS);
  const [indicatorBody, setIndicatorBody] = useState<Record<string, unknown> | null>(null);
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
  const [searchParams] = useSearchParams();
  const patternId = searchParams.get("pattern");
  const [matches, setMatches] = useState<NamedMatch[]>([]);
  const [patternsReady, setPatternsReady] = useState(false);
  const [savedHit, setSavedHit] = useState<SavedHit | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

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

  const indicatorKey = indicatorIds.join(",");
  useEffect(() => {
    const names = indicatorQuery(indicatorIds);
    if (!names) {
      setIndicatorBody(null);
      setIndicatorTicker(t);
      return;
    }
    const ctrl = new AbortController();
    let active = true;
    api
      .indicators(t, names, CANDLE_RANGE, { signal: ctrl.signal })
      .then((body) => {
        if (!active) return;
        setIndicatorBody(body);
        setIndicatorTicker(t);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setIndicatorTicker(t);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [t, indicatorKey, indicatorIds]);

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

  useEffect(() => {
    setPicked(null);
    setMatches([]);
    setPatternsReady(false);
    const ctrl = new AbortController();
    api
      .namedPatterns(t, { signal: ctrl.signal })
      .then((body) => {
        setMatches(Array.isArray(body.matches) ? body.matches : []);
        setPatternsReady(true);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setMatches([]);
        setPatternsReady(true);
      });
    return () => ctrl.abort();
  }, [t]);

  useEffect(() => {
    const id = Number(patternId);
    if (!patternId || !Number.isFinite(id)) {
      setSavedHit(null);
      return;
    }
    const ctrl = new AbortController();
    api
      .patternHits(id, { signal: ctrl.signal })
      .then((body) => {
        const hit = body.hits.find((row) => row.ticker === t);
        const mark = hit ? markFrom(hit.swings) : null;
        const pattern = hit?.pattern ?? body.pattern ?? null;
        if (!hit || !mark || !pattern) {
          setSavedHit(null);
          return;
        }
        setSavedHit({ pattern, state: hit.state || "", score: hit.score, mark });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setSavedHit(null);
      });
    return () => ctrl.abort();
  }, [t, patternId]);

  const highlight = picked ?? (savedHit ? savedHit.pattern : null) ?? matches[0]?.pattern ?? null;
  const savedOnly = Boolean(savedHit && !picked && !matches.some((row) => row.pattern === savedHit.pattern));
  const chartMark = useMemo(() => {
    if (picked) {
      const live = matches.find((row) => row.pattern === picked);
      return live ? markFrom(live.swings) : null;
    }
    if (savedHit) return savedHit.mark;
    return matches[0] ? markFrom(matches[0].swings) : null;
  }, [picked, savedHit, matches]);

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
          {patternsReady ? (
            <div className="pattern-readout" aria-label="Named patterns">
              <span className="pattern-kicker">Patterns</span>
              {matches.length === 0 && !savedOnly ? <span className="pattern-empty">No named pattern on this ticker</span> : null}
              {savedOnly && savedHit ? (
                <button type="button" className="chip on" aria-pressed="true">
                  {patternLabel(savedHit.pattern)} · {stateLabel(savedHit.state)} · {savedHit.score.toFixed(2)}
                </button>
              ) : null}
              {matches.map((row) => (
                <button
                  key={row.pattern}
                  type="button"
                  className={highlight === row.pattern ? "chip on" : "chip"}
                  aria-pressed={highlight === row.pattern}
                  onClick={() => setPicked(row.pattern)}
                >
                  {patternLabel(row.pattern)} · {stateLabel(row.state)} · {row.score.toFixed(2)}
                </button>
              ))}
            </div>
          ) : null}
          {bars.length === 0 ? (
            <EmptyState text={`No daily bars for ${t}`} />
          ) : (
            <DailyChart
              ticker={t}
              bars={bars}
              indicatorIds={indicatorIds}
              indicatorData={barsTicker === t && indicatorTicker === t ? indicatorBody : null}
              onIndicator={setIndicatorIds}
              drawings={drawings}
              patternMark={chartMark}
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
