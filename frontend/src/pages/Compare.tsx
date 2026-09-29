import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Bar, type PatternHits } from "../api";
import { EmptyState, formatDong } from "../design-system";
import { PriceChart } from "../chart/PriceChart";

function tone(bars: Bar[]): "up" | "down" | "muted" {
  const first = bars[0]?.close;
  const last = bars.at(-1)?.close;
  if (first == null || last == null || first === last) return "muted";
  return last > first ? "up" : "down";
}

function ChartCard({ ticker, role, bars }: { ticker: string; role: string; bars: Bar[] }) {
  const last = bars.at(-1)?.close;
  const kind = tone(bars);
  return (
    <section className="chart-card">
      <div className="chart-card-head">
        <strong>
          {ticker || "—"} ({role})
        </strong>
        {last != null ? <span className={`tone-${kind}`}>{formatDong(last)} đ</span> : null}
      </div>
      <PriceChart ticker={ticker} bars={bars} />
    </section>
  );
}

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
      <Link to="/scans" className="back-link">
        Scans
      </Link>
      {hit ? (
        <div className="compare-head">
          <div className="compare-pair">
            <div>
              <div className="compare-kicker">Reference</div>
              <div className="compare-ticker">{hits?.reference ?? "—"}</div>
            </div>
            <span className="compare-vs">↔</span>
            <div>
              <div className="compare-kicker">Match</div>
              <div className="compare-ticker">{match}</div>
            </div>
          </div>
          <div>
            <div className="compare-kicker">Score</div>
            <div className="compare-score">{hit.score.toFixed(4)}</div>
            <div className="compare-window">
              {hit.window_start} – {hit.window_end}
            </div>
          </div>
        </div>
      ) : (
        <h1 className="page-title" style={{ marginTop: 12 }}>
          {hits?.reference ?? "—"} vs {match}
        </h1>
      )}
      {err ? <EmptyState text={err} /> : null}
      {hit ? (
        <div className="compare-grid">
          <ChartCard ticker={hits?.reference ?? ""} role="Reference" bars={left} />
          <ChartCard ticker={match} role="Match" bars={right} />
        </div>
      ) : null}
    </div>
  );
}
