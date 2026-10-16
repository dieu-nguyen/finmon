import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { PatternMatchSummary } from "./namedSummary";

const FORMING = "#6ea8fe";
const CONFIRMED = "#3dd68c";

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function namedMatchChartOption(rows: readonly PatternMatchSummary[]): EChartsOption {
  const background = cssVar("--bg", "#0e1116");
  const text = cssVar("--text", "#e6edf3");
  const muted = cssVar("--text-muted", "#8b9bb4");
  const faint = cssVar("--text-faint", "#5c6b82");
  const border = cssVar("--border", "#2a3340");
  const elev = cssVar("--bg-elev", "#161b22");
  return {
    backgroundColor: background,
    animation: false,
    color: [FORMING, CONFIRMED],
    legend: {
      data: ["Forming", "Confirmed"],
      top: 0,
      textStyle: { color: text, fontFamily: "IBM Plex Sans, sans-serif" },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: elev,
      borderColor: border,
      textStyle: { color: text, fontFamily: "IBM Plex Sans, sans-serif" },
    },
    grid: { left: 12, right: 12, top: 36, bottom: rows.length > 4 ? 8 : 4, containLabel: true },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.name),
      axisTick: { alignWithLabel: true },
      axisLine: { lineStyle: { color: border } },
      axisLabel: {
        color: muted,
        interval: 0,
        rotate: rows.length > 4 ? 32 : 0,
        fontFamily: "IBM Plex Sans, sans-serif",
      },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: faint, fontFamily: "IBM Plex Mono, monospace" },
      splitLine: { lineStyle: { color: border } },
    },
    series: [
      {
        name: "Forming",
        type: "bar",
        data: rows.map((row) => row.forming),
        itemStyle: { color: FORMING },
        barMaxWidth: 28,
      },
      {
        name: "Confirmed",
        type: "bar",
        data: rows.map((row) => row.confirmed),
        itemStyle: { color: CONFIRMED },
        barMaxWidth: 28,
      },
    ],
  };
}

export function NamedMatchChart({ rows }: { rows: readonly PatternMatchSummary[] }) {
  const option = useMemo(() => namedMatchChartOption(rows), [rows]);
  return (
    <div className="named-summary-chart" aria-label="Pattern match chart">
      <ReactECharts option={option} notMerge lazyUpdate style={{ height: 280, width: "100%" }} />
    </div>
  );
}
