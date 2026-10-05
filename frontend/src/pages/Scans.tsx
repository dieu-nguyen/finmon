import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type NamedScan, type Pattern, type PatternCatalogItem, type PatternHits, type PatternInput, type SymbolRow } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { patternLabel, stateLabel } from "../chart/patternMarks";
import { Banner, Button, Checkbox, EmptyState, Input, Select, Table } from "../design-system";

const emptyForm = {
  name: "",
  reference: "",
  minScore: "0.85",
  topK: "20",
  enabled: true,
};

const emptyScan: NamedScan = { as_of: null, patterns: [], scope: "all", tickers: [], hits: [] };

function asCatalog(body: unknown): PatternCatalogItem[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as { id?: unknown; label?: unknown };
    if (typeof item.id !== "string" || typeof item.label !== "string") return [];
    return [{ id: item.id, label: item.label }];
  });
}

function asScan(body: unknown): NamedScan {
  const row = body && typeof body === "object" ? (body as Partial<NamedScan>) : {};
  const scope = row.scope === "subset" ? "subset" : "all";
  return {
    as_of: typeof row.as_of === "string" ? row.as_of : null,
    patterns: Array.isArray(row.patterns) ? row.patterns.filter((item): item is string => typeof item === "string") : [],
    scope,
    tickers: Array.isArray(row.tickers) ? row.tickers.filter((item): item is string => typeof item === "string") : [],
    hits: Array.isArray(row.hits) ? row.hits : [],
  };
}

export function Scans() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hits, setHits] = useState<PatternHits | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [refQ, setRefQ] = useState("");
  const [refHits, setRefHits] = useState<SymbolRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<PatternCatalogItem[]>([]);
  const [named, setNamed] = useState<NamedScan>(emptyScan);
  const [pickedPatterns, setPickedPatterns] = useState<string[]>([]);
  const [scope, setScope] = useState<"all" | "subset">("all");
  const [pickedTickers, setPickedTickers] = useState<string[]>([]);
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerOptions, setTickerOptions] = useState<PatternCatalogItem[]>([]);
  const [scanning, setScanning] = useState(false);

  const lookalikes = patterns.filter((row) => row.kind !== "named");

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
    const ctrl = new AbortController();
    Promise.allSettled([api.patternCatalog({ signal: ctrl.signal }), api.namedScan({ signal: ctrl.signal })]).then((settled) => {
      if (ctrl.signal.aborted) return;
      const catalogResult = settled[0];
      const scanResult = settled[1];
      if (catalogResult.status === "fulfilled") setCatalog(asCatalog(catalogResult.value));
      if (scanResult.status === "fulfilled") {
        const stored = asScan(scanResult.value);
        setNamed(stored);
        setPickedPatterns(stored.patterns);
        setScope(stored.scope);
        setPickedTickers(stored.tickers);
      }
    });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (selected == null) {
      setHits(null);
      return;
    }
    const ctrl = new AbortController();
    api
      .patternHits(selected, { signal: ctrl.signal })
      .then((body) => {
        setHits(body);
        setErr(null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setErr("Load error");
      });
    return () => ctrl.abort();
  }, [selected]);

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
    if (scope !== "subset") return;
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
  }, [tickerQuery, scope]);

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
  }

  const scanDisabled = pickedPatterns.length === 0 || scanning || (scope === "subset" && pickedTickers.length === 0);
  const scopeText = named.scope === "subset" ? named.tickers.join(", ") || "Subset" : "All tickers";

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Scans</h1>
      </div>
      {err ? <Banner kind="error">{err}</Banner> : null}
      <section className="form-panel" aria-label="Named pattern scan">
        <h2 className="section-label">Named patterns</h2>
        <div className="scan-bar">
          <MultiSelect label="Patterns" placeholder="Patterns" options={catalog} value={pickedPatterns} onChange={setPickedPatterns} />
          <label className="field">
            Tickers
            <Select
              aria-label="Ticker scope"
              value={scope}
              onChange={(event) => setScope(event.target.value === "subset" ? "subset" : "all")}
              style={{ background: "var(--bg)", minWidth: 140 }}
            >
              <option value="all">All tickers</option>
              <option value="subset">Subset</option>
            </Select>
          </label>
          {scope === "subset" ? (
            <MultiSelect
              label="Tickers"
              placeholder="Search tickers"
              options={tickerOptions}
              value={pickedTickers}
              onChange={setPickedTickers}
              onQuery={setTickerQuery}
            />
          ) : null}
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
                  setNamed(stored);
                  setPickedPatterns(stored.patterns);
                  setScope(stored.scope);
                  setPickedTickers(stored.tickers);
                })
                .catch(() => setErr("Scan failed"))
                .finally(() => setScanning(false));
            }}
          >
            {scanning ? "Scanning" : "Scan"}
          </Button>
        </div>
        {named.as_of ? (
          <div className="scan-summary">
            {named.patterns.map((id) => patternLabel(id, catalog)).join(", ") || "Patterns"} · {scopeText} · as of {named.as_of}
          </div>
        ) : (
          <EmptyState text="No named pattern scan yet" />
        )}
        {named.as_of && named.hits.length === 0 ? <EmptyState text="No names at or above the floor" /> : null}
        {named.hits.length > 0 ? (
          <Table className="heads-up">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Pattern</th>
                <th>State</th>
                <th className="num">Score</th>
                <th>As of</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {named.hits.map((hit) => (
                <tr key={`${hit.ticker}-${hit.pattern ?? ""}`}>
                  <td className="ticker-cell">
                    <Link to={`/symbol/${hit.ticker}?pattern=${hit.pattern ?? ""}`}>{hit.ticker}</Link>
                  </td>
                  <td>{hit.name}</td>
                  <td>{patternLabel(hit.pattern, catalog)}</td>
                  <td>{stateLabel(hit.state)}</td>
                  <td className="score-cell">
                    <span className="score-num">{hit.score.toFixed(4)}</span>
                    <span className="score-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(0, Math.min(100, hit.score * 100))}%` }} />
                    </span>
                  </td>
                  <td className="ticker-cell">{hit.window_end}</td>
                  <td className="center">
                    <Link className="text-btn" to={`/symbol/${hit.ticker}?pattern=${hit.pattern ?? ""}`}>
                      Chart
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </section>
      <h2 className="section-label">Look-alike</h2>
      {lookalikes.length === 0 ? <EmptyState text="No patterns yet" /> : null}
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
          }}
        >
          New
        </button>
      </div>
      <form
        className="form-panel"
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
        <div className="form-row">
          <label className="field">
            Name
            <Input aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ background: "var(--bg)", minWidth: 200 }} />
          </label>
          <label className="field">
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
          <div className="form-actions">
            <Button type="submit">Save</Button>
          </div>
        </div>
        {refHits.length > 0 ? (
          <div className="suggest" style={{ marginTop: 8 }}>
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
      {hits && hits.kind !== "named" ? (
        <div className="table-panel">
          <div className="hits-head">
            <div className="hits-ref">
              Reference
              <span className="ticker-cell" style={{ textTransform: "none", letterSpacing: 0, fontSize: 14 }}>
                {hits.reference || "—"}
              </span>
            </div>
            {hits.as_of ? <span className="board-pill">as of {hits.as_of}</span> : null}
          </div>
          {hits.as_of == null ? <EmptyState text="No successful run yet" /> : null}
          {hits.as_of != null && hits.reference_compared === false ? <EmptyState text="Reference was not compared" /> : null}
          {hits.as_of != null && hits.reference_compared !== false && hits.hits.length === 0 ? <EmptyState text="No names at or above the floor" /> : null}
          {hits.hits.length > 0 ? (
            <Table className="heads-up">
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
                {hits.hits.map((hit) => (
                  <tr key={hit.ticker}>
                    <td className="ticker-cell">
                      <Link to={`/scans/${hits.pattern_id}/compare/${hit.ticker}`}>{hit.ticker}</Link>
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
                      <Link className="text-btn" to={`/scans/${hits.pattern_id}/compare/${hit.ticker}`}>
                        Compare
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
