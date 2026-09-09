import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { Bar } from "../api";
import { IconButton } from "../design-system";
import type { Drawing, DrawingTool } from "./drawings";
import { categoryIndex, FIB_LEVELS } from "./drawings";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e6edf3";
}

export function DailyChart({
  ticker,
  bars,
  sma20,
  showSma,
  onToggleSma,
  drawings,
  tool,
  onTool,
  onDrawings,
  refPrice,
  ceiling,
  floor,
}: {
  ticker: string;
  bars: Bar[];
  sma20?: (number | null)[];
  showSma: boolean;
  onToggleSma: () => void;
  drawings: Drawing[];
  tool: DrawingTool;
  onTool: (t: DrawingTool) => void;
  onDrawings: (d: Drawing[]) => void;
  refPrice?: number | null;
  ceiling?: number | null;
  floor?: number | null;
}) {
  const dates = bars.map((b) => b.date);
  const option = useMemo(() => {
    const up = cssVar("--up");
    const down = cssVar("--down");
    const border = cssVar("--border");
    const bg = cssVar("--bg");
    const faint = cssVar("--text-faint");
    const elev = cssVar("--bg-elev");
    const text = cssVar("--text");
    const accent = cssVar("--accent");
    const markLineData = [];
    if (refPrice) markLineData.push({ yAxis: refPrice, lineStyle: { color: faint }, label: { formatter: "ref" } });
    if (ceiling) markLineData.push({ yAxis: ceiling, lineStyle: { color: up }, label: { formatter: "ceil" } });
    if (floor) markLineData.push({ yAxis: floor, lineStyle: { color: down }, label: { formatter: "floor" } });
    for (const d of drawings) {
      if (d.tool === "horizontal" && d.points[0]) {
        markLineData.push({ yAxis: d.points[0].price, lineStyle: { color: accent } });
      }
    }
    const markPoint = drawings
      .filter((d) => d.tool === "pin" || d.tool === "text")
      .map((d) => ({
        coord: [d.points[0]?.date, d.points[0]?.price],
        value: d.tool === "text" ? "note" : "pin",
      }));
    const graphics: unknown[] = [];
    for (const d of drawings) {
      if (d.tool === "trend" && d.points.length >= 2) {
        graphics.push({
          type: "line",
          xAxis: categoryIndex(dates, d.points[0].date),
          yAxis: d.points[0].price,
          xAxis2: categoryIndex(dates, d.points[1].date),
          yAxis2: d.points[1].price,
        });
      }
    }
    return {
      backgroundColor: bg,
      animation: false,
      tooltip: {
        trigger: "axis",
        backgroundColor: elev,
        textStyle: { color: text, fontFamily: "IBM Plex Mono, monospace" },
      },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      grid: [
        { left: 60, right: 20, top: 24, height: "58%" },
        { left: 60, right: 20, top: "78%", height: "14%" },
      ],
      xAxis: [
        { type: "category", data: dates, gridIndex: 0, axisLabel: { color: faint }, axisLine: { lineStyle: { color: border } }, splitLine: { show: false } },
        { type: "category", data: dates, gridIndex: 1, axisLabel: { show: false }, axisLine: { lineStyle: { color: border } } },
      ],
      yAxis: [
        { scale: true, gridIndex: 0, axisLabel: { color: faint, fontFamily: "IBM Plex Mono, monospace" }, splitLine: { lineStyle: { color: border } }, axisLine: { lineStyle: { color: border } } },
        { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { color: faint }, splitLine: { lineStyle: { color: border } } },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1] },
        { type: "slider", xAxisIndex: [0, 1], bottom: 4, height: 18, borderColor: border, fillerColor: "rgba(110,168,254,0.15)", textStyle: { color: faint } },
      ],
      series: [
        {
          type: "candlestick",
          data: bars.map((b) => [b.open, b.close, b.low, b.high]),
          itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
          markLine: { symbol: "none", data: markLineData, label: { color: faint } },
          markPoint: { data: markPoint },
        },
        ...(showSma && sma20
          ? [
              {
                type: "line",
                data: sma20,
                showSymbol: false,
                lineStyle: { color: accent, width: 1 },
              },
            ]
          : []),
        {
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: bars.map((b) => ({
            value: b.volume,
            itemStyle: { color: b.close >= b.open ? "rgba(61,214,140,0.4)" : "rgba(248,113,113,0.4)" },
          })),
        },
      ],
    };
  }, [bars, sma20, showSma, drawings, dates, refPrice, ceiling, floor]);

  const tools: { id: DrawingTool; label: string }[] = [
    { id: "pan", label: "pan" },
    { id: "horizontal", label: "horizontal" },
    { id: "trend", label: "trend" },
    { id: "rectangle", label: "rectangle" },
    { id: "fib", label: "fib" },
    { id: "text", label: "text" },
    { id: "pin", label: "pin" },
    { id: "delete", label: "delete selected" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {tools.map((t) => (
          <IconButton key={t.id} label={t.label} active={tool === t.id} onClick={() => onTool(t.id)}>
            {t.label[0].toUpperCase()}
          </IconButton>
        ))}
        <label style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
          <input type="checkbox" checked={showSma} onChange={onToggleSma} /> SMA20
        </label>
      </div>
      <ReactECharts
        option={option}
        style={{ height: 480 }}
        onEvents={{
          click: (params: { dataIndex?: number; value?: unknown }) => {
            if (tool === "pan" || params.dataIndex == null) return;
            const bar = bars[params.dataIndex];
            if (!bar) return;
            const price = typeof params.value === "number" ? params.value : bar.close;
            if (tool === "delete") {
              onDrawings(drawings.slice(0, -1));
              return;
            }
            if (tool === "horizontal" || tool === "pin" || tool === "text") {
              onDrawings([...drawings, { tool, points: [{ date: bar.date, price: Number(price) }] }]);
              return;
            }
            const last = drawings[drawings.length - 1];
            if (last && last.tool === tool && last.points.length === 1) {
              const next = drawings.slice(0, -1);
              const pts = [...last.points, { date: bar.date, price: Number(price) }];
              if (tool === "fib") {
                onDrawings([...next, { tool, points: pts }]);
                return;
              }
              onDrawings([...next, { tool, points: pts }]);
              return;
            }
            onDrawings([...drawings, { tool, points: [{ date: bar.date, price: Number(price) }] }]);
          },
        }}
      />
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>{ticker}</div>
    </div>
  );
}
