import type { Bar } from "../api";
import type { Drawing } from "./drawings";
import { categoryIndex } from "./drawings";
import { findIndicator, indicatorPlot, type IndicatorPlot, type IndicatorReadout, type PlotColors } from "./indicators";
import type { PatternMark } from "./patternMarks";

export type ChartColors = PlotColors & {
  border: string;
  elev: string;
  text: string;
};

type AxisMark = { yAxis?: number; lineStyle?: { color?: string; type?: string }; label?: { formatter?: string } };
type SegmentMark = [
  { coord: [string, number]; lineStyle?: { color?: string; type?: string } },
  { coord: [string, number] },
];

export type DailySeries = {
  type: string;
  name?: string;
  yAxisIndex?: number;
  xAxisIndex?: number;
  data?: unknown;
  markLine?: {
    symbol?: string;
    data?: Array<AxisMark | SegmentMark>;
    label?: { color?: string };
  };
  markPoint?: { data: unknown[]; label?: { color?: string; fontSize?: number } };
  itemStyle?: unknown;
  showSymbol?: boolean;
  lineStyle?: unknown;
};

export type DailyAxis = {
  scale?: boolean;
  min?: number;
  max?: number;
  interval?: number;
  gridIndex?: number;
  splitNumber?: number;
  axisLabel?: unknown;
  splitLine?: unknown;
  axisLine?: unknown;
};

export type DailyOption = {
  backgroundColor: string;
  animation: boolean;
  tooltip: unknown;
  axisPointer: unknown;
  grid: { left: number; right: number; top: number | string; height: string }[];
  xAxis: unknown[];
  yAxis: DailyAxis[];
  dataZoom: { type: string; xAxisIndex: number[]; bottom?: number; height?: number; borderColor?: string; fillerColor?: string; textStyle?: unknown }[];
  series: DailySeries[];
  graphic?: unknown[];
};

function place(series: Record<string, unknown>[], x: number, y: number): DailySeries[] {
  return series.map((item) => ({ ...item, xAxisIndex: x, yAxisIndex: y })) as DailySeries[];
}

function layoutPanes(count: number): { left: number; right: number; top: number | string; height: string }[] {
  if (count <= 0) {
    return [
      { left: 60, right: 20, top: 24, height: "58%" },
      { left: 60, right: 20, top: "78%", height: "14%" },
    ];
  }
  if (count === 1) {
    return [
      { left: 60, right: 20, top: 16, height: "42%" },
      { left: 60, right: 20, top: "52%", height: "18%" },
      { left: 60, right: 20, top: "74%", height: "12%" },
    ];
  }
  const slider = 8;
  const volume = 10;
  const gap = 1.5;
  const start = 1;
  const gaps = (count + 1) * gap;
  const budget = 100 - slider - volume - start - gaps;
  const osc = Math.min(14, Math.max(9, (budget * 0.45) / count));
  const price = budget - osc * count;
  const round = (value: number) => Math.round(value * 10) / 10;
  const grids: { left: number; right: number; top: string; height: string }[] = [];
  let cursor = start;
  grids.push({ left: 60, right: 20, top: `${round(cursor)}%`, height: `${round(price)}%` });
  cursor += price + gap;
  for (let i = 0; i < count; i += 1) {
    grids.push({ left: 60, right: 20, top: `${round(cursor)}%`, height: `${round(osc)}%` });
    cursor += osc + gap;
  }
  grids.push({ left: 60, right: 20, top: `${round(cursor)}%`, height: `${volume}%` });
  return grids;
}

function categoryAxis(dates: string[], gridIndex: number, colors: ChartColors, showLabels: boolean) {
  return {
    type: "category",
    data: dates,
    gridIndex,
    axisLabel: showLabels ? { color: colors.faint } : { show: false },
    axisLine: { lineStyle: { color: colors.border } },
    splitLine: { show: false },
  };
}

export function buildDailyOption(input: {
  bars: Bar[];
  drawings: Drawing[];
  patternMark?: PatternMark | null;
  indicatorIds: string[];
  indicatorData: Record<string, unknown> | null;
  refPrice?: number | null;
  ceiling?: number | null;
  floor?: number | null;
  colors: ChartColors;
}): { option: DailyOption; readouts: IndicatorReadout[] } {
  const { bars, drawings, colors } = input;
  const dates = bars.map((bar) => bar.date);
  const plots: IndicatorPlot[] = [];
  for (const id of input.indicatorIds) {
    const spec = findIndicator(id);
    if (!spec) continue;
    const payload = input.indicatorData?.[spec.apiName];
    const plot = indicatorPlot(spec, payload, colors);
    if (plot.series.length > 0) plots.push(plot);
  }
  const separates = plots.filter((plot) => plot.pane === "separate");
  const volumeIndex = 1 + separates.length;

  const markLineData: Array<AxisMark | SegmentMark> = [];
  if (input.refPrice) markLineData.push({ yAxis: input.refPrice, lineStyle: { color: colors.faint }, label: { formatter: "ref" } });
  if (input.ceiling) markLineData.push({ yAxis: input.ceiling, lineStyle: { color: colors.up }, label: { formatter: "ceil" } });
  if (input.floor) markLineData.push({ yAxis: input.floor, lineStyle: { color: colors.down }, label: { formatter: "floor" } });
  for (const drawing of drawings) {
    if (drawing.tool === "horizontal" && drawing.points[0]) {
      markLineData.push({ yAxis: drawing.points[0].price, lineStyle: { color: colors.accent } });
    }
  }
  const neck = input.patternMark?.neckline ?? [];
  for (let i = 0; i + 1 < neck.length; i += 2) {
    const segment: SegmentMark = [
      { coord: [neck[i].date, neck[i].price], lineStyle: { color: colors.warn, type: "dashed" } },
      { coord: [neck[i + 1].date, neck[i + 1].price] },
    ];
    markLineData.push(segment);
  }
  const markPoint = [
    ...drawings
      .filter((drawing) => drawing.tool === "pin" || drawing.tool === "text")
      .map((drawing) => ({
        coord: [drawing.points[0]?.date, drawing.points[0]?.price],
        value: drawing.tool === "text" ? "note" : "pin",
      })),
    ...(input.patternMark?.points ?? []).map((point) => ({
      coord: [point.date, point.price],
      value: point.role || "swing",
      symbol: "circle",
      symbolSize: 9,
      itemStyle: { color: colors.warn },
    })),
  ];
  const graphics: unknown[] = [];
  for (const drawing of drawings) {
    if (drawing.tool === "trend" && drawing.points.length >= 2) {
      graphics.push({
        type: "line",
        xAxis: categoryIndex(dates, drawing.points[0].date),
        yAxis: drawing.points[0].price,
        xAxis2: categoryIndex(dates, drawing.points[1].date),
        yAxis2: drawing.points[1].price,
      });
    }
  }

  const priceAxis: DailyAxis = {
    scale: true,
    gridIndex: 0,
    axisLabel: { color: colors.faint, fontFamily: "IBM Plex Mono, monospace" },
    splitLine: { lineStyle: { color: colors.border } },
    axisLine: { lineStyle: { color: colors.border } },
  };
  const volumeAxis: DailyAxis = {
    scale: true,
    gridIndex: volumeIndex,
    splitNumber: 2,
    axisLabel: { color: colors.faint },
    splitLine: { lineStyle: { color: colors.border } },
  };
  const yAxis: DailyAxis[] = [priceAxis];
  separates.forEach((plot, index) => {
    yAxis.push({
      ...(plot.axis ?? { scale: true }),
      gridIndex: index + 1,
      axisLabel: { color: colors.faint, fontFamily: "IBM Plex Mono, monospace" },
      splitLine: { lineStyle: { color: colors.border } },
    });
  });
  yAxis.push(volumeAxis);

  const xAxis = [
    categoryAxis(dates, 0, colors, separates.length === 0),
    ...separates.map((_, index) => categoryAxis(dates, index + 1, colors, false)),
    categoryAxis(dates, volumeIndex, colors, separates.length > 0),
  ];
  const grid = layoutPanes(separates.length);
  const xIndexes = xAxis.map((_, index) => index);
  const priceLines = plots.filter((plot) => plot.pane === "price").flatMap((plot) => place(plot.series, 0, 0));
  const volumeLines = plots.filter((plot) => plot.pane === "volume").flatMap((plot) => place(plot.series, volumeIndex, volumeIndex));
  const separateLines = separates.flatMap((plot, index) => place(plot.series, index + 1, index + 1));
  const readouts = plots.flatMap((plot) => (plot.readout ? [plot.readout] : []));

  const option: DailyOption = {
    backgroundColor: "transparent",
    animation: false,
    tooltip: {
      trigger: "axis",
      backgroundColor: colors.elev,
      textStyle: { color: colors.text, fontFamily: "IBM Plex Mono, monospace" },
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid,
    xAxis,
    yAxis,
    dataZoom: [
      { type: "inside", xAxisIndex: xIndexes },
      {
        type: "slider",
        xAxisIndex: xIndexes,
        bottom: 4,
        height: 18,
        borderColor: colors.border,
        fillerColor: "rgba(110,168,254,0.15)",
        textStyle: { color: colors.faint },
      },
    ],
    series: [
      {
        type: "candlestick",
        data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
        itemStyle: { color: colors.up, color0: colors.down, borderColor: colors.up, borderColor0: colors.down },
        markLine: { symbol: "none", data: markLineData, label: { color: colors.faint } },
        markPoint: { data: markPoint, label: { color: colors.text, fontSize: 10 } },
      },
      ...priceLines,
      {
        type: "bar",
        xAxisIndex: volumeIndex,
        yAxisIndex: volumeIndex,
        data: bars.map((bar) => ({
          value: bar.volume,
          itemStyle: { color: bar.close >= bar.open ? "rgba(61,214,140,0.4)" : "rgba(248,113,113,0.4)" },
        })),
      },
      ...volumeLines,
      ...separateLines,
    ],
    graphic: graphics,
  };

  return { option, readouts };
}
