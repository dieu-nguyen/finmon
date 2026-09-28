import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Bar, type PatternHits } from "../api";
import { EmptyState } from "../design-system";
import { PriceChart } from "../chart/PriceChart";

export function Compare() {
  const { patternId = "", ticker = "" } = useParams();
  const match = ticker.toUpperCase();
  const [hits, setHits] = useState<PatternHits | null>(null);
  const [left, setLeft] = useState<Bar[]>([]);
  const [right, setRight] = useState<Bar[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const body = await api.patternHits(Number(patternId));
        const hit = body.hits.find((row) => row.ticker === match);
        if (!active) return;
        setHits(body);
        if (!hit) {
          setErr("That hit is not on the latest successful run");
          return;
        }
        const range = { from: hit.window_start, to: hit.window_end };
        const [refBars, matchBars] = await Promise.all([api.bars(body.reference, range), api.bars(match, range)]);
        if (!active) return;
        setLeft(refBars);
        setRight(matchBars);
        setErr(null);
      } catch {
        if (active) setErr("Failed to load compare");
      }
    })();
    return () => {
      active = false;
    };
  }, [patternId, match]);

  const hit = hits?.hits.find((row) => row.ticker === match);
  return (
    <div>
      <Link to="/scans" style={{ color: "var(--accent)" }}>
        Scans
      </Link>
      <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>
        {hits?.reference ?? "—"} vs {match}
        {hit ? <span style={{ fontFamily: "var(--font-num)" }}> · {hit.score.toFixed(4)}</span> : null}
      </h1>
      {hit ? (
        <div style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)", marginBottom: 12 }}>
          {hit.window_start} – {hit.window_end}
        </div>
      ) : null}
      {err ? <EmptyState text={err} /> : null}
      {hit ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <PriceChart ticker={hits?.reference ?? ""} bars={left} />
          <PriceChart ticker={match} bars={right} />
        </div>
      ) : null}
    </div>
  );
}
