import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { Bar } from "../api";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e6edf3";
}

export function PriceChart({ ticker, bars }: { ticker: string; bars: Bar[] }) {
  const option = useMemo(() => {
    const up = cssVar("--up");
    const down = cssVar("--down");
    const border = cssVar("--border");
    const bg = cssVar("--bg");
    const faint = cssVar("--text-faint");
    const elev = cssVar("--bg-elev");
    const text = cssVar("--text");
    return {
      backgroundColor: bg,
      animation: false,
      tooltip: {
        trigger: "axis",
        backgroundColor: elev,
        textStyle: { color: text, fontFamily: "IBM Plex Mono, monospace" },
      },
      grid: { left: 72, right: 16, top: 16, bottom: 32 },
      xAxis: {
        type: "category",
        data: bars.map((b) => b.date),
        axisLabel: { color: faint },
        axisLine: { lineStyle: { color: border } },
        splitLine: { show: false },
      },
      yAxis: {
        scale: true,
        axisLabel: {
          color: faint,
          fontFamily: "IBM Plex Mono, monospace",
          formatter: (value: number) => new Intl.NumberFormat("vi-VN").format(value),
        },
        splitLine: { lineStyle: { color: border } },
        axisLine: { lineStyle: { color: border } },
      },
      series: [
        {
          type: "candlestick",
          data: bars.map((b) => [b.open, b.close, b.low, b.high]),
          itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
        },
      ],
    };
  }, [bars]);
  return (
    <div>
      <div style={{ fontFamily: "var(--font-num)", marginBottom: 8 }}>{ticker}</div>
      <ReactECharts option={option} style={{ height: 360 }} />
    </div>
  );
}
