import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { Bar } from "../api";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e6edf3";
}

export function PriceChart({ bars }: { ticker: string; bars: Bar[] }) {
  const option = useMemo(() => {
    const up = cssVar("--up");
    const down = cssVar("--down");
    const border = cssVar("--border");
    const faint = cssVar("--text-faint");
    const elev = cssVar("--bg-elev");
    const text = cssVar("--text");
    const dates = bars.map((b) => b.date);
    return {
      backgroundColor: "transparent",
      animation: false,
      tooltip: {
        trigger: "axis",
        backgroundColor: elev,
        textStyle: { color: text, fontFamily: "IBM Plex Mono, monospace" },
      },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: [
        { left: 72, right: 12, top: 12, height: "68%" },
        { left: 72, right: 12, top: "82%", height: "12%" },
      ],
      xAxis: [
        { type: "category", data: dates, gridIndex: 0, axisLabel: { color: faint }, axisLine: { lineStyle: { color: border } }, splitLine: { show: false } },
        { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false }, axisLine: { lineStyle: { color: border } } },
      ],
      yAxis: [
        {
          scale: true,
          gridIndex: 0,
          axisLabel: {
            color: faint,
            fontFamily: "IBM Plex Mono, monospace",
            formatter: (value: number) => new Intl.NumberFormat("vi-VN").format(value),
          },
          splitLine: { lineStyle: { color: border } },
          axisLine: { lineStyle: { color: border } },
        },
        { scale: true, gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false } },
      ],
      series: [
        {
          type: "candlestick",
          data: bars.map((b) => [b.open, b.close, b.low, b.high]),
          itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
        },
        {
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: bars.map((b) => ({
            value: b.volume,
            itemStyle: { color: b.close >= b.open ? "rgba(61,214,140,0.45)" : "rgba(248,113,113,0.45)" },
          })),
        },
      ],
    };
  }, [bars]);
  return <ReactECharts option={option} style={{ height: 320 }} />;
}
