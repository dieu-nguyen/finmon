import type { ECharts } from "echarts";
import ReactECharts from "echarts-for-react";
import { useMemo, useRef } from "react";
import type { Bar } from "../api";
import { IconButton, formatDong } from "../design-system";
import { ToolGlyph } from "../design-system/icons";
import { buildDailyOption, type ChartColors } from "./dailyOption";
import { drawingsAfterClick, type Drawing, type DrawingTool } from "./drawings";
import { DEFAULT_INDICATOR_IDS } from "./indicators";
import { IndicatorPicker } from "./IndicatorPicker";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e6edf3";
}

type DrawState = {
  tool: DrawingTool;
  drawings: Drawing[];
  bars: Bar[];
  onDrawings: (d: Drawing[]) => void;
};

const boundCharts = new WeakSet<object>();

function bindDrawingClicks(chart: ECharts, stateRef: { current: DrawState }) {
  if (boundCharts.has(chart)) return;
  boundCharts.add(chart);
  chart.getZr().on("click", (event) => {
    const { offsetX, offsetY } = event as { offsetX?: number; offsetY?: number };
    if (offsetX == null || offsetY == null) return;
    const { tool, drawings, bars, onDrawings } = stateRef.current;
    if (tool === "pan") return;
    const pixel: [number, number] = [offsetX, offsetY];
    if (!chart.containPixel({ gridIndex: 0 }, pixel)) return;
    let raw: unknown = null;
    try {
      raw = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pixel);
    } catch {
      raw = null;
    }
    const next = drawingsAfterClick(drawings, tool, bars, raw);
    if (next !== null) onDrawings(next);
  });
}

export function DailyChart({
  ticker,
  bars,
  indicatorIds = DEFAULT_INDICATOR_IDS,
  indicatorData = null,
  onIndicator,
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
  indicatorIds?: string[];
  indicatorData?: Record<string, unknown> | null;
  onIndicator: (ids: string[]) => void;
  drawings: Drawing[];
  tool: DrawingTool;
  onTool: (t: DrawingTool) => void;
  onDrawings: (d: Drawing[]) => void;
  refPrice?: number | null;
  ceiling?: number | null;
  floor?: number | null;
}) {
  const view = useMemo(() => {
    const colors: ChartColors = {
      up: cssVar("--up"),
      down: cssVar("--down"),
      border: cssVar("--border"),
      faint: cssVar("--text-faint"),
      elev: cssVar("--bg-elev"),
      text: cssVar("--text"),
      accent: cssVar("--accent"),
      warn: cssVar("--warn"),
    };
    return buildDailyOption({ bars, drawings, indicatorIds, indicatorData, refPrice, ceiling, floor, colors, tool });
  }, [bars, drawings, indicatorIds, indicatorData, refPrice, ceiling, floor, tool]);

  const stateRef = useRef<DrawState>({ tool, drawings, bars, onDrawings });
  stateRef.current = { tool, drawings, bars, onDrawings };

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
  const last = bars.at(-1);
  const volClass = last && last.close >= last.open ? "up" : "down";

  return (
    <div className="chart-stack" data-ticker={ticker}>
      <div className="tool-row">
        {tools.map((item) => (
          <IconButton key={item.id} label={item.label} active={tool === item.id} onClick={() => onTool(item.id)}>
            <ToolGlyph name={item.id} />
          </IconButton>
        ))}
        <span className="tool-sep" />
        <IndicatorPicker value={indicatorIds} onChange={onIndicator} />
      </div>
      {last ? (
        <div className="ohlc">
          <span>
            O <b>{formatDong(last.open)}</b>
          </span>
          <span>
            H <b>{formatDong(last.high)}</b>
          </span>
          <span>
            L <b>{formatDong(last.low)}</b>
          </span>
          <span>
            C <b>{formatDong(last.close)}</b>
          </span>
          <span className={volClass}>Vol {formatDong(last.volume)}</span>
          {view.readouts.map((item) => (
            <span key={item.label}>
              {item.label} <b>{item.value}</b>
            </span>
          ))}
        </div>
      ) : null}
      <ReactECharts
        option={view.option}
        notMerge
        style={{ height: 520, cursor: tool === "pan" ? "default" : "crosshair" }}
        onChartReady={(chart) => bindDrawingClicks(chart as ECharts, stateRef)}
      />
    </div>
  );
}
