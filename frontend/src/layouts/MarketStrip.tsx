import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MarketSummary } from "../api";
import { Segmented } from "../design-system";

const TY = 1_000_000_000;

export function formatPoints(n: number): string {
  return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/** `daily_bar.value` is the DNSE OHLC integer, stored with no price scale. tỷ đồng is that sum / 1e9. */
export function formatTurnover(dong: number): string {
  const ty = dong / TY;
  const abs = Math.abs(ty);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const formatted = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ty);
  return `${formatted} tỷ`;
}

function formatPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;
}

function versusAverage(values: number[]): { text: string; tone: "up" | "down" | "flat" } | null {
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average === 0) return null;
  const pct = ((latest - average) / average) * 100;
  if (Math.abs(pct) < 0.05) return { text: "at the average", tone: "flat" };
  const formatted = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(pct));
  return pct > 0 ? { text: `${formatted}% above average`, tone: "up" } : { text: `${formatted}% below average`, tone: "down" };
}

function Line({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 140;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="strip-series" data-testid="strip-index-line" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Bars({ values, signed, testId }: { values: number[]; signed: boolean; testId: string }) {
  if (values.length === 0) return null;
  const width = 140;
  const height = 28;
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  const gap = 1;
  const barWidth = (width - gap * (values.length - 1)) / values.length;
  const mid = height / 2;
  return (
    <svg className="strip-series" data-testid={testId} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true">
      {values.map((value, index) => {
        const magnitude = (Math.abs(value) / max) * (signed ? mid - 1 : height - 2);
        const x = index * (barWidth + gap);
        const y = signed ? (value >= 0 ? mid - magnitude : mid) : height - 1 - magnitude;
        const color = !signed ? "var(--accent)" : value > 0 ? "var(--up)" : value < 0 ? "var(--down)" : "var(--text-faint)";
        return <rect key={index} x={x} y={y} width={Math.max(barWidth, 0.5)} height={Math.max(magnitude, value === 0 ? 1 : 0.5)} fill={color} />;
      })}
    </svg>
  );
}

function toneOf(change: number | null): "up" | "down" | "flat" {
  if (change == null || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

export function MarketStrip() {
  const [sessions, setSessions] = useState<7 | 30>(7);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    let active = true;
    api
      .marketSummary(sessions, { signal: ctrl.signal })
      .then((body) => {
        if (!active) return;
        setSummary(body);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setFailed(true);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [sessions]);

  const change = summary?.index.change ?? null;
  const tone = toneOf(change);
  const latest = summary && summary.days.length > 0 ? summary.days[summary.days.length - 1] : null;
  const values = summary?.days.map((day) => day.value) ?? [];
  const valueMissing = summary != null && summary.days.length > 0 && values.every((value) => value === 0);
  const versus = valueMissing ? null : versusAverage(values);

  return (
    <div className="market-strip">
      {failed ? (
        <p className="strip-quiet">Summary unavailable</p>
      ) : (
        <>
          <Link to="/symbol/VNINDEX" className={`strip-cell ${tone}`} data-testid="strip-index">
            <span className="strip-kicker">VN-Index</span>
            <span className="strip-close">{summary?.index.close == null ? "—" : formatPoints(summary.index.close)}</span>
            <span className="strip-change">
              {change == null ? "—" : `${change > 0 ? "+" : ""}${formatPoints(change)}  ${summary?.index.change_pct == null ? "" : formatPercent(summary.index.change_pct)}`}
            </span>
            <Line values={summary?.index.closes ?? []} />
          </Link>
          <div className="strip-cell" data-testid="strip-breadth">
            <span className="strip-kicker">HOSE breadth</span>
            <span className="strip-close">
              {latest ? `${latest.up} up · ${latest.down} down · ${latest.flat} flat` : "—"}
            </span>
            <Bars values={summary?.days.map((day) => day.up - day.down) ?? []} signed testId="strip-breadth-bars" />
          </div>
          <div className="strip-cell" data-testid="strip-value">
            <span className="strip-kicker">HOSE value</span>
            {valueMissing ? (
              <span className="strip-missing">Turnover was not stored</span>
            ) : (
              <>
                <span className="strip-close">{latest ? formatTurnover(latest.value) : "—"}</span>
                {versus ? <span className={`strip-meta ${versus.tone}`}>{versus.text}</span> : null}
                <Bars values={values} signed={false} testId="strip-value-bars" />
              </>
            )}
          </div>
        </>
      )}
      <div className="strip-cell strip-cell-empty" data-testid="strip-slot" aria-hidden="true" />
      <div className="strip-side">
        <span className="strip-asof">{summary?.as_of ? `session ${summary.as_of}` : "session —"}</span>
        <Segmented
          label="Sessions"
          value={String(sessions)}
          options={[
            { value: "7", label: "7 sessions" },
            { value: "30", label: "30 sessions" },
          ]}
          onChange={(value) => setSessions(value === "30" ? 30 : 7)}
        />
      </div>
    </div>
  );
}
