import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { Bar } from "../api";
import { IconButton, formatDong } from "../design-system";
import { ToolGlyph } from "../design-system/icons";
import { buildDailyOption, type ChartColors } from "./dailyOption";
import type { Drawing, DrawingTool } from "./drawings";
import { DEFAULT_INDICATOR_IDS } from "./indicators";
import { IndicatorPicker } from "./IndicatorPicker";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#e6edf3";
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
    return buildDailyOption({ bars, drawings, indicatorIds, indicatorData, refPrice, ceiling, floor, colors });
  }, [bars, drawings, indicatorIds, indicatorData, refPrice, ceiling, floor]);

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
        style={{ height: 520 }}
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
            const previous = drawings[drawings.length - 1];
            if (previous && previous.tool === tool && previous.points.length === 1) {
              const next = drawings.slice(0, -1);
              const pts = [...previous.points, { date: bar.date, price: Number(price) }];
              onDrawings([...next, { tool, points: pts }]);
              return;
            }
            onDrawings([...drawings, { tool, points: [{ date: bar.date, price: Number(price) }] }]);
          },
        }}
      />
    </div>
  );
}
