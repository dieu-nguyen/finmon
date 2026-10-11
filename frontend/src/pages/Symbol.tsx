import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, type Bar, type NamedCheck, type NamedMatch, type PatternCatalogItem, type SymbolRow } from "../api";
import { displayBoard } from "./Market";
import { Banner, Button, ChangeCell, EmptyState, Input, PriceCell, Select, Spinner, Tabs, Toast } from "../design-system";
import { CompanyPanel } from "./CompanyPanel";
import { DailyChart } from "../chart/DailyChart";
import type { Drawing, DrawingTool } from "../chart/drawings";
import { DEFAULT_INDICATOR_IDS, indicatorQuery } from "../chart/indicators";
import { MultiSelect } from "../components/MultiSelect";
import { markFrom, patternLabel, stateLabel, type PatternMark } from "../chart/patternMarks";

type SavedHit = { pattern: string; state: string; score: number; mark: PatternMark; runId?: number | null };

const SIDE_TABS = ["Company", "Note", "Alert", "Scan"];

function rankMatches(rows: NamedMatch[]): NamedMatch[] {
  return [...rows].sort((a, b) => b.score - a.score || a.pattern.localeCompare(b.pattern));
}

function asCatalog(body: unknown): PatternCatalogItem[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as { id?: unknown; label?: unknown };
    if (typeof item.id !== "string" || typeof item.label !== "string") return [];
    return [{ id: item.id, label: item.label }];
  });
}

function asCheck(body: unknown): Pick<NamedCheck, "as_of" | "patterns" | "matches"> {
  const row = body && typeof body === "object" ? (body as { as_of?: unknown; patterns?: unknown; matches?: unknown }) : {};
  return {
    as_of: typeof row.as_of === "string" ? row.as_of : null,
    patterns: Array.isArray(row.patterns) ? row.patterns.filter((item): item is string => typeof item === "string") : [],
    matches: Array.isArray(row.matches) ? (row.matches as NamedMatch[]) : [],
  };
}

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
  const [catalog, setCatalog] = useState<PatternCatalogItem[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [namedAsOf, setNamedAsOf] = useState<string | null>(null);
  const [namedReady, setNamedReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [savedHit, setSavedHit] = useState<SavedHit | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [followDeepLink, setFollowDeepLink] = useState(true);
  const [deepSettled, setDeepSettled] = useState(false);

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
    setSelectedPatterns([]);
    setNamedAsOf(null);
    setNamedReady(false);
    setScanning(false);
    setFollowDeepLink(true);
    const ctrl = new AbortController();
    Promise.allSettled([api.patternCatalog({ signal: ctrl.signal }), api.namedPatterns(t, { signal: ctrl.signal })]).then(
      (settled) => {
        if (ctrl.signal.aborted) return;
        const catalogResult = settled[0];
        const namedResult = settled[1];
        setCatalog(catalogResult.status === "fulfilled" ? asCatalog(catalogResult.value) : []);
        if (namedResult.status === "fulfilled") {
          const check = asCheck(namedResult.value);
          setMatches(check.matches);
          setSelectedPatterns(check.patterns);
          setNamedAsOf(check.as_of);
        } else if (!isAbortError(namedResult.reason)) {
          setMatches([]);
        }
        setNamedReady(true);
      },
    );
    return () => ctrl.abort();
  }, [t]);

  useEffect(() => {
    setFollowDeepLink(true);
    setPicked(null);
  }, [patternId]);

  useEffect(() => {
    if (!patternId) {
      setSavedHit(null);
      setDeepSettled(true);
      return;
    }
    setDeepSettled(false);
    const ctrl = new AbortController();
    if (/^\d+$/.test(patternId)) {
      const id = Number(patternId);
      api
        .patternHits(id, { signal: ctrl.signal })
        .then((body) => {
          const hit = body.hits.find((row) => row.ticker === t);
          const mark = hit ? markFrom(hit.swings) : null;
          const pattern = hit?.pattern ?? body.pattern ?? null;
          if (!hit || !mark || !pattern) {
            setSavedHit(null);
          } else {
            setSavedHit({ pattern, state: hit.state || "", score: hit.score, mark, runId: hit.run_id });
          }
          setDeepSettled(true);
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) return;
          setSavedHit(null);
          setDeepSettled(true);
        });
      return () => ctrl.abort();
    }
    api
      .namedScan({ signal: ctrl.signal })
      .then((body) => {
        const hit = body.hits.find((row) => row.ticker === t && row.pattern === patternId);
        const mark = hit ? markFrom(hit.swings) : null;
        if (!hit || !mark || !hit.pattern) {
          setSavedHit(null);
        } else {
          setSavedHit({ pattern: hit.pattern, state: hit.state || "", score: hit.score, mark, runId: hit.run_id });
        }
        setDeepSettled(true);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setSavedHit(null);
        setDeepSettled(true);
      });
    return () => ctrl.abort();
  }, [t, patternId]);

  const ranked = useMemo(() => rankMatches(matches), [matches]);
  const deepHit = followDeepLink && picked == null && savedHit ? savedHit : null;
  const waitingForHit = Boolean(patternId) && followDeepLink && picked == null && !deepSettled;
  const selectedPattern = picked ?? deepHit?.pattern ?? (waitingForHit ? null : (ranked[0]?.pattern ?? null));
  const chartMark = useMemo(() => {
    if (waitingForHit) return null;
    if (picked) {
      const live = matches.find((row) => row.pattern === picked);
      return live ? markFrom(live.swings) : null;
    }
    if (deepHit) return deepHit.mark;
    return ranked[0] ? markFrom(ranked[0].swings) : null;
  }, [waitingForHit, picked, matches, deepHit, ranked]);
  const orphan = deepHit && !matches.some((row) => row.pattern === deepHit.pattern) ? deepHit : null;

  function matchText(pattern: string, state: string, score: number, runId?: number | null) {
    const base = `${patternLabel(pattern, catalog)} · ${stateLabel(state)} · ${score.toFixed(2)}`;
    return runId == null ? base : `${base} · ${runId}`;
  }

  async function runNamedScan() {
    if (selectedPatterns.length === 0 || scanning) return;
    setScanning(true);
    setErr(null);
    try {
      const body = asCheck(await api.scanNamedPatterns(t, selectedPatterns));
      setMatches(body.matches);
      setSelectedPatterns(body.patterns);
      setNamedAsOf(body.as_of);
      setNamedReady(true);
      setFollowDeepLink(false);
      const best = rankMatches(body.matches)[0];
      setPicked(best ? best.pattern : null);
    } catch {
      setErr("Scan failed");
    } finally {
      setScanning(false);
    }
  }

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
          <Tabs stretch tabs={SIDE_TABS} value={tab} onChange={setTab} />
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
            {tab === "Scan" ? (
              <div className="scan-panel" aria-label="Named patterns">
                <MultiSelect label="Patterns" placeholder="Patterns" options={catalog} value={selectedPatterns} onChange={setSelectedPatterns} />
                <Button type="button" disabled={selectedPatterns.length === 0 || scanning} onClick={() => void runNamedScan()}>
                  {scanning ? "Scanning" : "Scan"}
                </Button>
                {namedReady && namedAsOf ? <span className="scan-summary">as of {namedAsOf}</span> : null}
                {namedReady && matches.length === 0 && !orphan ? (
                  <span className="pattern-empty">{namedAsOf ? "No named pattern on this ticker" : "No named pattern scan yet"}</span>
                ) : null}
                <div className="scan-results">
                  {orphan ? (
                    <button type="button" className="scan-row on" aria-pressed="true">
                      {matchText(orphan.pattern, orphan.state, orphan.score, orphan.runId)}
                    </button>
                  ) : null}
                  {ranked.map((row) => (
                    <button
                      key={`${row.run_id ?? ""}-${row.pattern}`}
                      type="button"
                      className={selectedPattern === row.pattern ? "scan-row on" : "scan-row"}
                      aria-pressed={selectedPattern === row.pattern}
                      onClick={() => {
                        setFollowDeepLink(false);
                        setPicked(row.pattern);
                      }}
                    >
                      {matchText(row.pattern, row.state, row.score, row.run_id)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
      {toast ? <Toast text={toast} /> : null}
    </div>
  );
}
