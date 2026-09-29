import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Pattern, type PatternHits, type SymbolRow } from "../api";
import { Banner, Button, Checkbox, EmptyState, Input, Table } from "../design-system";

const emptyForm = { name: "", reference: "", minScore: "0.85", topK: "20", enabled: true };

export function Scans() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hits, setHits] = useState<PatternHits | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [refQ, setRefQ] = useState("");
  const [refHits, setRefHits] = useState<SymbolRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const loadPatterns = async (prefer?: number) => {
    const rows = await api.patterns();
    setPatterns(rows);
    const next = prefer ?? selected ?? rows[0]?.id ?? null;
    setSelected(next);
    const chosen = rows.find((row) => row.id === next);
    if (chosen) fill(chosen);
    else setForm(emptyForm);
  };

  useEffect(() => {
    loadPatterns().catch(() => setErr("Load error"));
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

  function fill(row: Pattern) {
    setForm({
      name: row.name,
      reference: row.spec.reference,
      minScore: String(row.spec.min_score),
      topK: String(row.spec.top_k),
      enabled: row.enabled,
    });
    setRefQ("");
    setRefHits([]);
  }

  function choose(row: Pattern) {
    setSelected(row.id);
    fill(row);
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Scans</h1>
      </div>
      {err ? <Banner kind="error">{err}</Banner> : null}
      {patterns.length === 0 ? <EmptyState text="No patterns yet" /> : null}
      <div className="chips">
        {patterns.map((row) => (
          <button key={row.id} type="button" className={row.id === selected ? "chip on" : "chip"} onClick={() => choose(row)}>
            {row.name}
            {row.enabled ? "" : " (off)"}
            <span className="chip-meta"> · {row.spec.min_score}</span>
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
          try {
            const saved = await api.savePattern(
              {
                name: form.name.trim(),
                reference: form.reference.trim(),
                min_score: Number(form.minScore),
                top_k: Number(form.topK),
                enabled: form.enabled,
              },
              selected ?? undefined,
            );
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
      {hits ? (
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
