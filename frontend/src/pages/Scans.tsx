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
      <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>Scans</h1>
      {err ? <Banner kind="error">{err}</Banner> : null}
      <form
        style={{ display: "grid", gap: 8, maxWidth: 420, margin: "var(--space-3) 0" }}
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
        <Input placeholder="Name" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input
          placeholder="Reference ticker"
          aria-label="Reference"
          value={refQ || form.reference}
          onChange={(e) => {
            setRefQ(e.target.value);
            setForm({ ...form, reference: e.target.value.toUpperCase() });
          }}
          required
        />
        {refHits.length > 0 ? (
          <div style={{ border: "1px solid var(--border)", background: "var(--bg-elev)" }}>
            {refHits.map((row) => (
              <button
                key={row.ticker}
                type="button"
                onClick={() => {
                  setForm({ ...form, reference: row.ticker });
                  setRefQ("");
                  setRefHits([]);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  color: "var(--text)",
                  height: 32,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: "var(--font-num)" }}>{row.ticker}</span> {row.name}
              </button>
            ))}
          </div>
        ) : null}
        <Input aria-label="Minimum score" value={form.minScore} onChange={(e) => setForm({ ...form, minScore: e.target.value })} />
        <Input aria-label="Top K" value={form.topK} onChange={(e) => setForm({ ...form, topK: e.target.value })} />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Checkbox checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Enabled
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="submit">Save</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSelected(null);
              setHits(null);
              setForm(emptyForm);
              setRefQ("");
              setRefHits([]);
            }}
          >
            New
          </Button>
        </div>
      </form>
      {patterns.length === 0 ? <EmptyState text="No patterns yet" /> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        {patterns.map((row) => (
          <button
            key={row.id}
            onClick={() => choose(row)}
            style={{
              height: 32,
              background: row.id === selected ? "var(--bg-selected)" : "transparent",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderLeft: row.id === selected ? "2px solid var(--accent)" : "1px solid var(--border)",
              cursor: "pointer",
              padding: "0 var(--space-3)",
            }}
          >
            {row.name}
            {row.enabled ? "" : " (off)"}
          </button>
        ))}
      </div>
      {hits ? (
        <div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: "var(--font-num)" }}>{hits.reference || "—"}</span>
            {hits.as_of ? <span style={{ color: "var(--text-muted)" }}> · as of {hits.as_of}</span> : null}
          </div>
          {hits.as_of == null ? <EmptyState text="No successful run yet" /> : null}
          {hits.as_of != null && hits.reference_compared === false ? <EmptyState text="Reference was not compared" /> : null}
          {hits.as_of != null && hits.reference_compared !== false && hits.hits.length === 0 ? (
            <EmptyState text="No names at or above the floor" />
          ) : null}
          {hits.hits.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  {["Ticker", "Name", "Score", "As of"].map((h) => (
                    <th key={h} style={{ textAlign: h === "Score" ? "right" : "left", borderBottom: "1px solid var(--border)", height: 36 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hits.hits.map((hit) => (
                  <tr key={hit.ticker} style={{ height: 36 }}>
                    <td style={{ fontFamily: "var(--font-num)" }}>
                      <Link to={`/scans/${hits.pattern_id}/compare/${hit.ticker}`} style={{ color: "var(--accent)" }}>
                        {hit.ticker}
                      </Link>
                    </td>
                    <td>{hit.name}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-num)" }}>{hit.score.toFixed(4)}</td>
                    <td style={{ fontFamily: "var(--font-num)" }}>{hit.window_end}</td>
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
