import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, type Bar, type NamedCheck, type NamedMatch, type SymbolRow } from "../api";
import { displayBoard } from "./Market";
import { Banner, Button, ChangeCell, EmptyState, Input, PriceCell, Select, Spinner, Tabs, Toast } from "../design-system";
import { CompanyPanel } from "./CompanyPanel";
import { DailyChart } from "../chart/DailyChart";
import type { Drawing, DrawingTool } from "../chart/drawings";
import { DEFAULT_BAR_SIZE, DEFAULT_RANGE_MONTHS, type BarSize } from "../chart/chartWindow";
import { DEFAULT_INDICATOR_IDS, indicatorQuery } from "../chart/indicators";
import { MultiSelect } from "../components/MultiSelect";
import { markFrom, patternLabel, stateLabel, type PatternMark } from "../chart/patternMarks";
import { patternMenuOptions } from "../patterns/catalog";
import { formatScannedAt } from "../time";

type SavedHit = {
  pattern: string;
  state: string;
  score: number;
  mark: PatternMark;
  runId?: number | null;
  scannedAt?: string | null;
};

const SIDE_TABS = ["Company", "Note", "Alert", "Scan"];
const patternOptions = patternMenuOptions();

function rankMatches(rows: NamedMatch[]): NamedMatch[] {
  return [...rows].sort((a, b) => b.score - a.score || a.pattern.localeCompare(b.pattern));
}

function SessionAge({ count }: { count: number | null | undefined }) {
  if (count == null || !Number.isFinite(count)) return null;
  const past = count > 10;
  return (
    <span className={past ? "scan-age past" : "scan-age"}>
      {count} sessions
      {past ? <span className="scan-age-badge">Past 10</span> : null}
    </span>
  );
}

function asCheck(body: unknown): Pick<NamedCheck, "as_of" | "patterns" | "matches"> {
  const row = body && typeof body === "object" ? (body as { as_of?: unknown; patterns?: unknown; matches?: unknown }) : {};
  return {
    as_of: typeof row.as_of === "string" ? row.as_of : null,
    patterns: Array.isArray(row.patterns) ? row.patterns.filter((item): item is string => typeof item === "string") : [],
    matches: Array.isArray(row.matches) ? (row.matches as NamedMatch[]) : [],
  };
}

/** Shared by the candle request and the indicator request for the chart window. */

function CompanyTab({ profile, financials }: { profile: CompanyPart; financials: CompanyPart }) {
  const view = companyView(profile, financials);
  if (!view) {
    return view === null ? <EmptyState text="Company data unavailable" /> : <Spinner />;
  }
  return <CompanyPanel payload={view} financialsPending={financials === undefined} />;
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

type CompanyPart = Record<string, unknown> | null | undefined;

function asCompanyPart(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
}

/** Profile can paint before statements. Undefined means that part is still loading. */
function companyView(profile: CompanyPart, financials: CompanyPart): Record<string, unknown> | null | undefined {
  const profileReady = profile != null;
  const financialsReady = financials != null;
  if (!profileReady && !financialsReady) {
    return profile === undefined || financials === undefined ? undefined : null;
  }
  const profileBody = profileReady ? profile : {};
  const financialBody = financialsReady ? financials : {};
  return {
    ticker: profileBody.ticker ?? financialBody.ticker,
    profile: "profile" in profileBody ? profileBody.profile : [],
    statements: "statements" in financialBody ? financialBody.statements : {},
    ratios: "ratios" in financialBody ? financialBody.ratios : [],
  };
}

export function SymbolPage() {
  const { ticker = "" } = useParams();
  const t = ticker.toUpperCase();
  const [bars, setBars] = useState<Bar[]>([]);
  const [barsTicker, setBarsTicker] = useState("");
  const [rangeMonths, setRangeMonths] = useState(DEFAULT_RANGE_MONTHS);
  const [barSize, setBarSize] = useState<BarSize>(DEFAULT_BAR_SIZE);
  const [barsWindow, setBarsWindow] = useState("");
  const [indicatorWindow, setIndicatorWindow] = useState("");
  const [row, setRow] = useState<SymbolRow | null>(null);
  const [indicatorIds, setIndicatorIds] = useState<string[]>(DEFAULT_INDICATOR_IDS);
  const [indicatorBody, setIndicatorBody] = useState<Record<string, unknown> | null>(null);
  const [indicatorTicker, setIndicatorTicker] = useState("");
  const [tab, setTab] = useState("Company");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [profilePart, setProfilePart] = useState<CompanyPart>(undefined);
  const [statementPart, setStatementPart] = useState<CompanyPart>(undefined);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const saveTimer = useRef<number | null>(null);
  const [tool, setTool] = useState<DrawingTool>("pan");
  const [op, setOp] = useState("gte");
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState("once");
  const [err, setErr] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const patternId = searchParams.get("pattern");
  const [matches, setMatches] = useState<NamedMatch[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [namedAsOf, setNamedAsOf] = useState<string | null>(null);
  const [namedReady, setNamedReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [savedHit, setSavedHit] = useState<SavedHit | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [followDeepLink, setFollowDeepLink] = useState(true);
  const [deepSettled, setDeepSettled] = useState(false);

  const windowKey = `${rangeMonths}|${barSize}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [header, dr, pn] = await Promise.all([
          api.symbol(t).catch(() => null),
          api.drawings(t).catch(() => []),
          api.pageNote(t).catch(() => ({ body: "" })),
        ]);
        if (cancelled) return;
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
    const ctrl = new AbortController();
    let active = true;
    const candle = { months: rangeMonths, interval: barSize };
    api
      .bars(t, candle, { signal: ctrl.signal })
      .then((b) => {
        if (!active) return;
        setBars(b);
        setBarsTicker(t);
        setBarsWindow(windowKey);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setBars([]);
        setBarsTicker(t);
        setBarsWindow(windowKey);
        setErr("Failed to load symbol");
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [t, rangeMonths, barSize, windowKey]);

  const indicatorKey = indicatorIds.join(",");
  useEffect(() => {
    const names = indicatorQuery(indicatorIds);
    if (!names) {
      setIndicatorBody(null);
      setIndicatorTicker(t);
      setIndicatorWindow(windowKey);
      return;
    }
    const ctrl = new AbortController();
    let active = true;
    api
      .indicators(t, names, { months: rangeMonths, interval: barSize }, { signal: ctrl.signal })
      .then((body) => {
        if (!active) return;
        setIndicatorBody(body);
        setIndicatorTicker(t);
        setIndicatorWindow(windowKey);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setIndicatorTicker(t);
        setIndicatorWindow(windowKey);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [t, indicatorKey, indicatorIds, rangeMonths, barSize, windowKey]);

  useEffect(() => {
    if (tab !== "Company") return;
    const ctrl = new AbortController();
    let active = true;
    setProfilePart(undefined);
    setStatementPart(undefined);
    api
      .companyProfile(t, { signal: ctrl.signal })
      .then((body) => {
        if (active) setProfilePart(asCompanyPart(body));
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setProfilePart(null);
      });
    api
      .companyStatements(t, { signal: ctrl.signal })
      .then((body) => {
        if (active) setStatementPart(asCompanyPart(body));
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error)) return;
        setStatementPart(null);
      });
    return () => {
      active = false;
      ctrl.abort();
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
    api
      .namedPatterns(t, { signal: ctrl.signal })
      .then((body) => {
        if (ctrl.signal.aborted) return;
        const check = asCheck(body);
        setMatches(check.matches);
        setSelectedPatterns(check.patterns);
        setNamedAsOf(check.as_of);
        setNamedReady(true);
      })
      .catch((error: unknown) => {
        if (ctrl.signal.aborted || isAbortError(error)) return;
        setMatches([]);
        setNamedReady(true);
      });
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
        .patternHits(id, "", { signal: ctrl.signal })
        .then((body) => {
          const hit = body.hits.find((row) => row.ticker === t);
          const mark = hit ? markFrom(hit.swings) : null;
          const pattern = hit?.pattern ?? body.pattern ?? null;
          if (!hit || !mark || !pattern) {
            setSavedHit(null);
          } else {
            setSavedHit({
              pattern,
              state: hit.state || "",
              score: hit.score,
              mark,
              runId: hit.run_id,
              scannedAt: hit.scanned_at,
            });
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
          setSavedHit({
            pattern: hit.pattern,
            state: hit.state || "",
            score: hit.score,
            mark,
            runId: hit.run_id,
            scannedAt: hit.scanned_at,
          });
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

  function matchText(pattern: string, state: string, score: number, runId?: number | null, scannedAt?: string | null) {
    const base = `${patternLabel(pattern, patternOptions)} · ${stateLabel(state)} · ${score.toFixed(2)}`;
    const withRun = runId == null ? base : `${base} · ${runId}`;
    const when = formatScannedAt(scannedAt);
    return when ? `${withRun} · Scanned ${when}` : withRun;
  }

  function rowClass(selected: boolean, sessions: number | null | undefined) {
    return ["scan-row", selected ? "on" : "", sessions != null && sessions > 10 ? "past" : ""].filter(Boolean).join(" ");
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
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    const ticker = t;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      api.saveDrawings(ticker, d).then(() => {
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
          {barsTicker === t && bars.length === 0 && barsWindow === windowKey ? (
            <EmptyState text={`No daily bars for ${t}`} />
          ) : barsTicker !== t || bars.length === 0 ? (
            <Spinner />
          ) : (
            <DailyChart
              ticker={t}
              bars={bars}
              indicatorIds={indicatorIds}
              indicatorData={
                barsWindow === windowKey && indicatorTicker === t && indicatorWindow === windowKey ? indicatorBody : null
              }
              onIndicator={setIndicatorIds}
              drawings={drawings}
              patternMark={chartMark}
              tool={tool}
              onTool={setTool}
              onDrawings={persistDrawings}
              rangeMonths={rangeMonths}
              barSize={barSize}
              onRangeMonths={setRangeMonths}
              onBarSize={setBarSize}
            />
          )}
        </div>
        <aside className="rail">
          <Tabs stretch tabs={SIDE_TABS} value={tab} onChange={setTab} />
          <div className="rail-body">
            {tab === "Company" ? (
              <CompanyTab profile={profilePart} financials={statementPart} />
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
                <MultiSelect label="Patterns" placeholder="Patterns" options={patternOptions} value={selectedPatterns} onChange={setSelectedPatterns} />
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
                      {matchText(orphan.pattern, orphan.state, orphan.score, orphan.runId, orphan.scannedAt)}
                    </button>
                  ) : null}
                  {ranked.map((row) => (
                    <button
                      key={`${row.run_id ?? ""}-${row.pattern}`}
                      type="button"
                      className={rowClass(selectedPattern === row.pattern, row.sessions_behind)}
                      aria-pressed={selectedPattern === row.pattern}
                      onClick={() => {
                        setFollowDeepLink(false);
                        setPicked(row.pattern);
                      }}
                    >
                      <span>{matchText(row.pattern, row.state, row.score, row.run_id, row.scanned_at)}</span>
                      <SessionAge count={row.sessions_behind} />
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
