import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type NamedScan, type Pattern, type PatternCatalogItem, type PatternHits, type PatternInput, type ScanHit, type SymbolRow } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { patternLabel, stateLabel } from "../chart/patternMarks";
import { patternMenuOptions } from "../patterns/catalog";
import { Banner, Button, Checkbox, EmptyState, Input, Select, Table } from "../design-system";
import { LookalikeScoreChart } from "./LookalikeScoreChart";
import { NamedMatchChart } from "./NamedMatchChart";
import { formatScannedAt } from "../time";
import {
  MATCH_PAGE_SIZE,
  filterLookalikeHits,
  filterNamedHits,
  orderLookalikeHits,
  orderNamedHits,
  summarizeLookalikeHits,
  summarizeNamedHits,
} from "./namedSummary";

const emptyForm = {
  name: "",
  reference: "",
  minScore: "0.85",
  topK: "20",
  enabled: true,
};

const emptyScan: NamedScan = { as_of: null, patterns: [], scope: "all", tickers: [], hits: [] };
const defaultMatch = { pattern: "", ticker: "", state: "all", rightEdge: 10 };

function matchListQuery(filter: { pattern: string; ticker: string; state: string; rightEdge: number }): string {
  const params = new URLSearchParams();
  if (filter.pattern) params.set("pattern", filter.pattern);
  if (filter.ticker) params.set("ticker", filter.ticker);
  if (filter.state && filter.state !== "all") params.set("state", filter.state);
  params.set("right_edge", String(filter.rightEdge));
  return `?${params.toString()}`;
}

function parseRightEdge(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMatch.rightEdge;
  return parsed;
}
const patternOptions = patternMenuOptions();

function asScan(body: unknown): NamedScan {
  const row = body && typeof body === "object" ? (body as Partial<NamedScan>) : {};
  const scope = row.scope === "subset" ? "subset" : "all";
  return {
    as_of: typeof row.as_of === "string" ? row.as_of : null,
    patterns: Array.isArray(row.patterns) ? row.patterns.filter((item): item is string => typeof item === "string") : [],
    scope,
    tickers: Array.isArray(row.tickers) ? row.tickers.filter((item): item is string => typeof item === "string") : [],
    hits: Array.isArray(row.hits) ? row.hits : [],
    run_id: typeof row.run_id === "number" ? row.run_id : null,
    status: typeof row.status === "string" ? row.status : null,
  };
}

function scanPending(status: string | null | undefined): boolean {
  return status === "accepted";
}

export function Scans() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hits, setHits] = useState<PatternHits | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [refQ, setRefQ] = useState("");
  const [refHits, setRefHits] = useState<SymbolRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [named, setNamed] = useState<NamedScan>(emptyScan);
  const [namedReady, setNamedReady] = useState(false);
  const [pickedPatterns, setPickedPatterns] = useState<string[]>([]);
  const [scope, setScope] = useState<"all" | "subset">("all");
  const [pickedTickers, setPickedTickers] = useState<string[]>([]);
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerOptions, setTickerOptions] = useState<PatternCatalogItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lookScanning, setLookScanning] = useState(false);
  const [matchPattern, setMatchPattern] = useState("");
  const [matchTicker, setMatchTicker] = useState("");
  const [matchState, setMatchState] = useState(defaultMatch.state);
  const [matchRightEdge, setMatchRightEdge] = useState(String(defaultMatch.rightEdge));
  const [appliedMatch, setAppliedMatch] = useState(defaultMatch);
  const [listedHits, setListedHits] = useState<ScanHit[] | null>(null);
  const [matchPage, setMatchPage] = useState(0);
  const [chartHits, setChartHits] = useState<ScanHit[] | null>(null);
  const [namedReload, setNamedReload] = useState(0);
  const [lookTicker, setLookTicker] = useState("");
  const [appliedLook, setAppliedLook] = useState("");
  const [lookRightEdge, setLookRightEdge] = useState(String(defaultMatch.rightEdge));
  const [appliedLookEdge, setAppliedLookEdge] = useState(defaultMatch.rightEdge);
  const [lookEpoch, setLookEpoch] = useState(0);
  const [lookPage, setLookPage] = useState(0);
  const seededRun = useRef(false);

  const lookalikes = patterns.filter((row) => row.kind !== "named");
  const chosen = lookalikes.find((row) => row.id === selected) ?? null;
  const savedReference = String(chosen?.spec.reference ?? "").trim().toUpperCase();
  const formMatchesSaved =
    chosen != null &&
    form.name.trim() === chosen.name &&
    form.enabled === chosen.enabled &&
    form.reference.trim().toUpperCase() === savedReference &&
    savedReference.length > 0 &&
    Number(form.minScore) === Number(chosen.spec.min_score ?? 0.85) &&
    Number(form.topK) === Number(chosen.spec.top_k ?? 20);
  const lookScanDisabled = !formMatchesSaved || !form.enabled || lookScanning;

  const loadPatterns = async (prefer?: number) => {
    const rows = await api.patterns();
    setPatterns(rows);
    const saved = rows.filter((row) => row.kind !== "named");
    const next = prefer ?? selected ?? saved[0]?.id ?? null;
    setSelected(saved.some((row) => row.id === next) ? next : saved[0]?.id ?? null);
    const chosen = saved.find((row) => row.id === (saved.some((row) => row.id === next) ? next : saved[0]?.id));
    if (chosen) fill(chosen);
    else setForm(emptyForm);
  };

  useEffect(() => {
    loadPatterns().catch(() => setErr("Load error"));
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setChartHits(null);
    api
      .namedMatchList(`?right_edge=${appliedMatch.rightEdge}`, { signal: ctrl.signal })
      .then((body) => {
        if (ctrl.signal.aborted) return;
        const stored = asScan(body);
        setChartHits(stored.hits);
        setNamed(stored);
        if (!seededRun.current) {
          seededRun.current = true;
          setPickedPatterns(stored.patterns);
          setScope(stored.scope);
          setPickedTickers(stored.tickers);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!ctrl.signal.aborted) setChartHits([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setNamedReady(true);
      });
    return () => ctrl.abort();
  }, [appliedMatch.rightEdge, namedReload]);

  useEffect(() => {
    if (!scanPending(named.status)) return;
    setScanning(true);
    const timer = window.setInterval(() => {
      api
        .namedMatchList(`?right_edge=${appliedMatch.rightEdge}`)
        .then((body) => {
          const stored = asScan(body);
          setNamed(stored);
          setChartHits(stored.hits);
          if (!scanPending(stored.status)) {
            setScanning(false);
            if (stored.status === "failed") setErr("Scan failed");
          }
        })
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [named.status, named.run_id, appliedMatch.rightEdge]);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .namedMatchList(matchListQuery(appliedMatch), { signal: ctrl.signal })
      .then((body) => {
        if (ctrl.signal.aborted) return;
        setListedHits(asScan(body).hits);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!ctrl.signal.aborted) setListedHits([]);
      });
    return () => ctrl.abort();
  }, [appliedMatch, named.run_id, named.status]);

  useEffect(() => {
    if (selected == null || !scanPending(hits?.status)) return;
    setLookScanning(true);
    const patternId = selected;
    const timer = window.setInterval(() => {
      api
        .patternHits(patternId, `?right_edge=${appliedLookEdge}`)
        .then((body) => {
          setHits(body);
          if (!scanPending(body.status)) {
            setLookScanning(false);
            if (body.status === "failed") setErr("Scan failed");
          }
        })
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hits?.status, hits?.run_id, selected, appliedLookEdge]);

  useEffect(() => {
    if (selected == null) {
      setHits(null);
      return;
    }
    const ctrl = new AbortController();
    setHits(null);
    api
      .patternHits(selected, `?right_edge=${appliedLookEdge}`, { signal: ctrl.signal })
      .then((body) => {
        if (ctrl.signal.aborted) return;
        setHits(body);
        setErr(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!ctrl.signal.aborted) setErr("Load error");
      });
    return () => ctrl.abort();
  }, [selected, appliedLookEdge, lookEpoch]);

  useEffect(() => {
    const q = refQ.trim();
    if (!q) {
      setRefHits([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("type", "stock,etf");
      params.set("limit", "50");
      params.set("offset", "0");
      api
        .symbols(`?${params.toString()}`, { signal: ctrl.signal })
        .then((page) => setRefHits(page.items))
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [refQ]);

  useEffect(() => {
    const q = tickerQuery.trim();
    if (!q) {
      setTickerOptions([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("type", "stock,etf");
      params.set("limit", "50");
      params.set("offset", "0");
      api
        .symbols(`?${params.toString()}`, { signal: ctrl.signal })
        .then((page) => setTickerOptions(page.items.map((row) => ({ id: row.ticker, label: `${row.ticker} ${row.name}` }))))
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [tickerQuery]);

  function fill(row: Pattern) {
    setForm({
      name: row.name,
      reference: row.spec.reference ?? "",
      minScore: String(row.spec.min_score ?? 0.85),
      topK: String(row.spec.top_k ?? 20),
      enabled: row.enabled,
    });
    setRefQ("");
    setRefHits([]);
  }

  function choose(row: Pattern) {
    setSelected(row.id);
    fill(row);
    setLookTicker("");
    setAppliedLook("");
    setLookPage(0);
  }

  const scanDisabled = pickedPatterns.length === 0 || scanning || (scope === "subset" && pickedTickers.length === 0);
  const scopeText = named.scope === "subset" ? named.tickers.join(", ") || "Subset" : "All tickers";
  const matchSummary = useMemo(() => summarizeNamedHits(chartHits ?? []), [chartHits]);
  const lookSpread = useMemo(() => summarizeLookalikeHits(hits?.kind === "named" ? [] : (hits?.hits ?? [])), [hits]);
  const lookRows = useMemo(
    () => filterLookalikeHits(orderLookalikeHits(hits?.kind === "named" ? [] : (hits?.hits ?? [])), appliedLook),
    [hits, appliedLook],
  );
  const matchRows = useMemo(
    () => filterNamedHits(orderNamedHits(listedHits ?? []), appliedMatch),
    [listedHits, appliedMatch],
  );
  const matchPageCount = Math.max(1, Math.ceil(matchRows.length / MATCH_PAGE_SIZE));
  const matchPageIndex = Math.min(matchPage, matchPageCount - 1);
  const matchPageRows = matchRows.slice(matchPageIndex * MATCH_PAGE_SIZE, matchPageIndex * MATCH_PAGE_SIZE + MATCH_PAGE_SIZE);
  const matchFrom = matchRows.length === 0 ? 0 : matchPageIndex * MATCH_PAGE_SIZE + 1;
  const matchTo = matchPageIndex * MATCH_PAGE_SIZE + matchPageRows.length;
  const lookPageCount = Math.max(1, Math.ceil(lookRows.length / MATCH_PAGE_SIZE));
  const lookPageIndex = Math.min(lookPage, lookPageCount - 1);
  const lookPageRows = lookRows.slice(lookPageIndex * MATCH_PAGE_SIZE, lookPageIndex * MATCH_PAGE_SIZE + MATCH_PAGE_SIZE);
  const lookFrom = lookRows.length === 0 ? 0 : lookPageIndex * MATCH_PAGE_SIZE + 1;
  const lookTo = lookPageIndex * MATCH_PAGE_SIZE + lookPageRows.length;
  const patternChoices = patternOptions.filter((item) => !item.disabled);
  const lookResult = hits != null && hits.kind !== "named" ? hits : null;
  const lookSpreadText =
    lookSpread.min == null || lookSpread.max == null
      ? null
      : lookSpread.min === lookSpread.max
        ? lookSpread.max.toFixed(2)
        : `${lookSpread.min.toFixed(2)}–${lookSpread.max.toFixed(2)}`;

  function applyMatchSearch() {
    const rightEdge = parseRightEdge(matchRightEdge);
    setMatchRightEdge(String(rightEdge));
    setAppliedMatch({ pattern: matchPattern, ticker: matchTicker.trim(), state: matchState, rightEdge });
    setMatchPage(0);
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Scans</h1>
      </div>
      {err ? <Banner kind="error">{err}</Banner> : null}
      <section className="scan-section" aria-label="Named patterns">
        <h2 className="section-label">Named patterns</h2>
        <section aria-label="Named pattern summary">
          {!namedReady || chartHits == null ? (
            <EmptyState text="Loading" />
          ) : matchSummary.length === 0 ? (
            <EmptyState text="No named pattern matches" />
          ) : (
            <>
              <NamedMatchChart rows={matchSummary} />
              <Table className="heads-up" aria-label="Pattern counts">
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th className="num">Forming</th>
                    <th className="num">Confirmed</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matchSummary.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td className="num">{row.forming}</td>
                      <td className="num">{row.confirmed}</td>
                      <td className="num">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </section>
        <div className="scan-bar">
          <label className="field">
            Patterns
            <MultiSelect
              label="Patterns"
              placeholder="Patterns"
              options={patternOptions}
              value={pickedPatterns}
              onChange={setPickedPatterns}
              all={{ mode: "select" }}
            />
          </label>
          <label className="field">
            Tickers
            <MultiSelect
              label="Tickers"
              placeholder="Search tickers"
              options={tickerOptions}
              value={pickedTickers}
              onChange={(ids) => {
                setScope("subset");
                setPickedTickers(ids);
              }}
              onQuery={setTickerQuery}
              all={{
                mode: "exclusive",
                active: scope === "all",
                onActiveChange: (active) => {
                  setScope(active ? "all" : "subset");
                  if (active) setPickedTickers([]);
                },
              }}
            />
          </label>
          <Button
            type="button"
            disabled={scanDisabled}
            onClick={() => {
              if (scanDisabled) return;
              setScanning(true);
              setErr(null);
              api
                .runNamedScan({
                  patterns: pickedPatterns,
                  scope,
                  tickers: scope === "subset" ? pickedTickers : [],
                })
                .then((body) => {
                  const stored = asScan(body);
                  setNamed((prev) => ({
                    ...prev,
                    as_of: stored.as_of,
                    patterns: stored.patterns,
                    scope: stored.scope,
                    tickers: stored.tickers,
                    run_id: stored.run_id,
                    status: stored.status,
                  }));
                  setPickedPatterns(stored.patterns);
                  setScope(stored.scope);
                  setPickedTickers(stored.tickers);
                  setMatchPage(0);
                  setNamedReload((value) => value + 1);
                  if (!scanPending(stored.status)) setScanning(false);
                })
                .catch(() => {
                  setErr("Scan failed");
                  setScanning(false);
                });
            }}
          >
            {scanning ? "Scanning" : "Scan"}
          </Button>
        </div>
        {named.as_of ? (
          <div className="scan-summary">
            {named.patterns.map((id) => patternLabel(id, patternOptions)).join(", ") || "Patterns"} · {scopeText} · as of {named.as_of}
          </div>
        ) : null}
        <form
          className="scan-bar"
          onSubmit={(event) => {
            event.preventDefault();
            applyMatchSearch();
          }}
        >
          <label className="field">
            Pattern
            <Select
              aria-label="Pattern"
              value={matchPattern}
              onChange={(event) => setMatchPattern(event.target.value)}
              style={{ background: "var(--bg)", minWidth: 180 }}
            >
              <option value="">All patterns</option>
              {patternChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            Ticker
            <Input
              aria-label="Ticker"
              value={matchTicker}
              onChange={(event) => setMatchTicker(event.target.value)}
              style={{ background: "var(--bg)", width: 140, fontFamily: "var(--font-num)", textTransform: "uppercase" }}
            />
          </label>
          <label className="field">
            State
            <Select
              aria-label="State"
              value={matchState}
              onChange={(event) => setMatchState(event.target.value)}
              style={{ background: "var(--bg)", minWidth: 140 }}
            >
              <option value="all">All</option>
              <option value="forming">Forming</option>
              <option value="confirmed">Confirmed</option>
            </Select>
          </label>
          <label className="field">
            Right edge
            <Input
              aria-label="Right edge"
              type="number"
              min={0}
              step={1}
              value={matchRightEdge}
              onChange={(event) => setMatchRightEdge(event.target.value)}
              style={{ background: "var(--bg)", width: 100, fontFamily: "var(--font-num)" }}
            />
          </label>
          <Button type="submit">Search</Button>
        </form>
        {!namedReady || listedHits == null ? (
          <EmptyState text="Loading" />
        ) : matchRows.length === 0 ? (
          <EmptyState text={named.hits.length === 0 ? (named.as_of ? "No names at or above the floor" : "No named pattern scan yet") : "No matches"} />
        ) : (
          <>
            <Table className="heads-up" aria-label="Named matches">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Name</th>
                  <th>Pattern</th>
                  <th>State</th>
                  <th className="num">Score</th>
                  <th>As of</th>
                  <th>Run</th>
                  <th>Scanned</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {matchPageRows.map((hit) => (
                  <tr key={`${hit.run_id ?? ""}-${hit.ticker}-${hit.pattern ?? ""}`}>
                    <td className="ticker-cell">
                      <Link to={`/symbol/${hit.ticker}?pattern=${hit.pattern ?? ""}`}>{hit.ticker}</Link>
                    </td>
                    <td>{hit.name}</td>
                    <td>{patternLabel(hit.pattern, patternOptions)}</td>
                    <td>{stateLabel(hit.state)}</td>
                    <td className="score-cell">
                      <span className="score-num">{hit.score.toFixed(4)}</span>
                      <span className="score-bar" aria-hidden="true">
                        <span style={{ width: `${Math.max(0, Math.min(100, hit.score * 100))}%` }} />
                      </span>
                    </td>
                    <td className="ticker-cell">{hit.window_end}</td>
                    <td className="ticker-cell">{typeof hit.run_id === "number" ? hit.run_id : ""}</td>
                    <td className="ticker-cell">{formatScannedAt(hit.scanned_at)}</td>
                    <td className="center">
                      <Link
                        className="text-btn"
                        to={`/symbol/${hit.ticker}?pattern=${hit.pattern ?? ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Chart
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="pager">
              <span>
                {matchFrom}–{matchTo} of {matchRows.length}
              </span>
              <div className="pager-actions">
                <Button variant="ghost" type="button" disabled={matchPageIndex <= 0} onClick={() => setMatchPage(matchPageIndex - 1)}>
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={matchPageIndex + 1 >= matchPageCount}
                  onClick={() => setMatchPage(matchPageIndex + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      <section className="scan-section" aria-label="Look-alike">
        <h2 className="section-label">Look-alike</h2>
        <section aria-label="Look-alike summary">
          {selected != null && hits == null ? (
            <EmptyState text="Loading" />
          ) : lookResult == null || lookResult.as_of == null ? (
            <EmptyState text={lookResult ? "No successful run yet" : "No look-alike result"} />
          ) : lookResult.reference_compared === false ? (
            <EmptyState text="Reference was not compared" />
          ) : lookSpread.count === 0 ? (
            <EmptyState text="No names at or above the floor" />
          ) : (
            <>
              <p className="summary-meta">
                <b>{lookSpread.count}</b> {lookSpread.count === 1 ? "symbol matched" : "symbols matched"}
                {lookResult.reference ? ` · ${lookResult.reference}` : ""}
                {lookSpreadText ? ` · ${lookSpreadText}` : ""}
                {lookResult.as_of ? ` · as of ${lookResult.as_of}` : ""}
              </p>
              <LookalikeScoreChart rows={lookSpread.top} />
            </>
          )}
        </section>
        {lookalikes.length > 0 ? (
          <div className="chips">
            {lookalikes.map((row) => (
              <button key={row.id} type="button" className={row.id === selected ? "chip on" : "chip"} onClick={() => choose(row)}>
                {row.name}
                {row.enabled ? "" : " (off)"}
                <span className="chip-meta">{` · ${row.spec.min_score}`}</span>
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={() => {
                setSelected(null);
                setHits(null);
                setForm(emptyForm);
                setRefQ("");
                setRefHits([]);
                setLookTicker("");
                setAppliedLook("");
                setLookPage(0);
              }}
            >
              New
            </button>
          </div>
        ) : null}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            const body: PatternInput = {
              name: form.name.trim(),
              kind: "lookalike",
              reference: form.reference.trim(),
              min_score: Number(form.minScore),
              top_k: Number(form.topK),
              enabled: form.enabled,
            };
            try {
              const saved = await api.savePattern(body, selected ?? undefined);
              await loadPatterns(saved.id);
            } catch {
              setErr("Could not save pattern");
            }
          }}
        >
          <div className="scan-bar">
            <label className="field is-compact">
              Reference ticker
              <Input
                aria-label="Reference"
                value={refQ || form.reference}
                onChange={(e) => {
                  setRefQ(e.target.value);
                  setForm({ ...form, reference: e.target.value.toUpperCase() });
                }}
                required
                style={{ background: "var(--bg)", width: 140, fontFamily: "var(--font-num)", textTransform: "uppercase" }}
              />
            </label>
            <Button
              type="button"
              disabled={lookScanDisabled}
              onClick={() => {
                if (lookScanDisabled || selected == null) return;
                setLookScanning(true);
                setErr(null);
                api
                  .scanLookalike(selected)
                  .then((body) => {
                    setAppliedLook("");
                    setLookTicker("");
                    setLookPage(0);
                    setErr(null);
                    if (scanPending(body.status)) {
                      setHits((current) => (current ? { ...current, status: body.status, run_id: body.run_id } : body));
                    } else {
                      setLookEpoch((value) => value + 1);
                      setLookScanning(false);
                    }
                  })
                  .catch(() => {
                    setErr("Scan failed");
                    setLookScanning(false);
                  });
              }}
            >
              {lookScanning ? "Scanning" : "Scan"}
            </Button>
          </div>
          {formMatchesSaved ? null : (
            <div className="scan-bar">
              <label className="field">
                Name
                <Input aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ background: "var(--bg)", minWidth: 200 }} />
              </label>
              <label className="field">
                Minimum score
                <Input aria-label="Minimum score" value={form.minScore} onChange={(e) => setForm({ ...form, minScore: e.target.value })} style={{ background: "var(--bg)", width: 120, fontFamily: "var(--font-num)", textAlign: "right" }} />
              </label>
              <label className="field">
                Top K
                <Input aria-label="Top K" value={form.topK} onChange={(e) => setForm({ ...form, topK: e.target.value })} style={{ background: "var(--bg)", width: 100, fontFamily: "var(--font-num)", textAlign: "right" }} />
              </label>
              <label className="check-label">
                <Checkbox checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                Enabled
              </label>
              <Button type="submit">Save</Button>
            </div>
          )}
          {refHits.length > 0 ? (
            <div className="suggest">
              {refHits.map((row) => (
                <button
                  key={row.ticker}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, reference: row.ticker });
                    setRefQ("");
                    setRefHits([]);
                  }}
                >
                  <span className="ticker-cell">{row.ticker}</span> {row.name}
                </button>
              ))}
            </div>
          ) : null}
        </form>
        <form
          className="scan-bar"
          onSubmit={(event) => {
            event.preventDefault();
            const rightEdge = parseRightEdge(lookRightEdge);
            setLookRightEdge(String(rightEdge));
            setAppliedLook(lookTicker.trim());
            setAppliedLookEdge(rightEdge);
            setLookPage(0);
          }}
        >
          <label className="field">
            Ticker
            <Input
              aria-label="Look-alike ticker"
              value={lookTicker}
              onChange={(event) => setLookTicker(event.target.value)}
              style={{ background: "var(--bg)", width: 140, fontFamily: "var(--font-num)", textTransform: "uppercase" }}
            />
          </label>
          <label className="field">
            Right edge
            <Input
              aria-label="Right edge"
              type="number"
              min={0}
              step={1}
              value={lookRightEdge}
              onChange={(event) => setLookRightEdge(event.target.value)}
              style={{ background: "var(--bg)", width: 100, fontFamily: "var(--font-num)" }}
            />
          </label>
          <Button type="submit">Search</Button>
        </form>
        {selected != null && hits == null ? (
          <EmptyState text="Loading" />
        ) : lookResult == null ? (
          <EmptyState text="No patterns yet" />
        ) : lookResult.as_of == null ? (
          <EmptyState text="No successful run yet" />
        ) : lookResult.reference_compared === false ? (
          <EmptyState text="Reference was not compared" />
        ) : lookResult.hits.length === 0 ? (
          <EmptyState text="No names at or above the floor" />
        ) : lookRows.length === 0 ? (
          <EmptyState text="No matches" />
        ) : (
          <>
            <Table className="heads-up" aria-label="Look-alike hits">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Name</th>
                  <th className="num">Score</th>
                  <th>As of</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lookPageRows.map((hit) => (
                  <tr key={hit.ticker}>
                    <td className="ticker-cell">
                      <Link to={`/scans/${lookResult.pattern_id}/compare/${hit.ticker}`}>{hit.ticker}</Link>
                    </td>
                    <td>{hit.name}</td>
                    <td className="score-cell">
                      <span className="score-num">{hit.score.toFixed(4)}</span>
                      <span className="score-bar" aria-hidden="true">
                        <span style={{ width: `${Math.max(0, Math.min(100, hit.score * 100))}%` }} />
                      </span>
                    </td>
                    <td className="ticker-cell">{hit.window_end}</td>
                    <td className="center">
                      <Link className="text-btn" to={`/scans/${lookResult.pattern_id}/compare/${hit.ticker}`}>
                        Compare
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="pager">
              <span>
                {lookFrom}–{lookTo} of {lookRows.length}
              </span>
              <div className="pager-actions">
                <Button variant="ghost" type="button" disabled={lookPageIndex <= 0} onClick={() => setLookPage(lookPageIndex - 1)}>
                  Previous
                </Button>
                <Button variant="ghost" type="button" disabled={lookPageIndex + 1 >= lookPageCount} onClick={() => setLookPage(lookPageIndex + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
