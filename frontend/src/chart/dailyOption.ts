import type { Bar } from "../api";
import { FIB_LEVELS, type Drawing, type DrawingTool, type Point } from "./drawings";
import { findIndicator, indicatorPlot, type IndicatorPlot, type IndicatorReadout, type PlotColors } from "./indicators";
import type { PatternMark } from "./patternMarks";

export type ChartColors = PlotColors & {
  border: string;
  elev: string;
  text: string;
};

type MarkEndpoint = {
  yAxis?: number;
  xAxis?: string;
  coord?: [string, number];
  symbol?: string;
  lineStyle?: { color?: string; width?: number; type?: string };
  label?: { formatter?: string; color?: string; show?: boolean; position?: string };
};

type Mark = MarkEndpoint | [MarkEndpoint, MarkEndpoint];

type AreaCorner = { xAxis: string; yAxis: number };

export type DailySeries = {
  type: string;
  name?: string;
  yAxisIndex?: number;
  xAxisIndex?: number;
  data?: unknown;
  markLine?: { symbol?: string; silent?: boolean; data?: Mark[]; label?: { color?: string } };
  markPoint?: { itemStyle?: { color?: string }; label?: { color?: string; fontSize?: number }; data: unknown[] };
  markArea?: { silent?: boolean; itemStyle?: { color?: string; opacity?: number; borderColor?: string; borderWidth?: number }; data: [AreaCorner, AreaCorner][] };
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
  tooltip: {
    show: boolean;
    trigger: string;
    position: [number, number];
    backgroundColor: string;
    textStyle: { color: string; fontFamily: string };
  };
  axisPointer: unknown;
  grid: { left: number; right: number; top: number | string; height: string }[];
  xAxis: unknown[];
  yAxis: DailyAxis[];
  dataZoom: {
    type: string;
    xAxisIndex: number[];
    bottom?: number;
    height?: number;
    borderColor?: string;
    fillerColor?: string;
    textStyle?: unknown;
    moveOnMouseMove?: boolean;
  }[];
  series: DailySeries[];
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

const CHANNEL_PATTERNS = new Set(["ascending_channel", "descending_channel"]);
const CHANNEL_FORWARD_SESSIONS = 10;
const DAY_MS = 86400000;

function utcDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function isoFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function medianGapDays(dates: string[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const gap = Math.round((utcDay(dates[i]) - utcDay(dates[i - 1])) / DAY_MS);
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 1;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor((gaps.length - 1) / 2)];
}

/** Next `count` bar slots after the last plotted date. Daily charts skip weekends. */
function appendSessions(dates: string[], count: number): string[] {
  if (dates.length === 0 || count <= 0) return dates.slice();
  const step = medianGapDays(dates);
  const daily = step <= 3;
  const out = dates.slice();
  let cursor = out[out.length - 1];
  let added = 0;
  let guard = 0;
  while (added < count && guard < count * 8) {
    guard += 1;
    cursor = isoFromUtc(utcDay(cursor) + (daily ? 1 : step) * DAY_MS);
    if (daily) {
      const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
    }
    out.push(cursor);
    added += 1;
  }
  return out;
}

/**
 * Both channel rails, continued at their own slope to the last bar and
 * `CHANNEL_FORWARD_SESSIONS` slots past it. Returns null unless the pattern
 * is a channel and at least one stored rail lands on the plotted dates.
 */
function projectChannel(
  pattern: string | undefined,
  dates: string[],
  neck: Point[],
): { dates: string[]; segments: [Point, Point][] } | null {
  if (!pattern || !CHANNEL_PATTERNS.has(pattern) || dates.length === 0 || neck.length < 2) return null;
  const axis = appendSessions(dates, CHANNEL_FORWARD_SESSIONS);
  const index = new Map(axis.map((date, i) => [date, i]));
  const endIndex = axis.length - 1;
  const endDate = axis[endIndex];
  const segments: [Point, Point][] = [];
  let extended = false;
  for (let i = 0; i + 1 < neck.length; i += 2) {
    const from = neck[i];
    const to = neck[i + 1];
    const i0 = index.get(from.date);
    const i1 = index.get(to.date);
    if (i0 == null || i1 == null || i0 === i1 || !Number.isFinite(from.price) || !Number.isFinite(to.price)) {
      segments.push([from, to]);
      continue;
    }
    const price = from.price + ((to.price - from.price) / (i1 - i0)) * (endIndex - i0);
    segments.push([from, { date: endDate, price }]);
    extended = true;
  }
  return extended ? { dates: axis, segments } : null;
}

function finiteNumbers(value: unknown, into: number[]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.push(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) finiteNumbers(item, into);
}

function coverPriceScale(axis: DailyAxis, dataPrices: number[], railPrices: number[]) {
  const rails = railPrices.filter((price) => Number.isFinite(price));
  const data = dataPrices.filter((price) => Number.isFinite(price));
  if (rails.length === 0 || data.length === 0) return;
  const dataLow = Math.min(...data);
  const dataHigh = Math.max(...data);
  const low = Math.min(dataLow, ...rails);
  const high = Math.max(dataHigh, ...rails);
  if (low >= dataLow && high <= dataHigh) return;
  const pad = (high - low) * 0.04 || 1;
  axis.min = low - pad;
  axis.max = high + pad;
}

function priceSegment(from: Point, to: Point, color: string, label?: string, lineType?: string): [MarkEndpoint, MarkEndpoint] {
  return [
    {
      coord: [from.date, from.price],
      symbol: "none",
      lineStyle: { color, width: 1.5, ...(lineType ? { type: lineType } : {}) },
      ...(label ? { label: { formatter: label, position: "middle", color } } : {}),
    },
    { coord: [to.date, to.price], symbol: "none" },
  ];
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
  tool?: DrawingTool;
}): { option: DailyOption; readouts: IndicatorReadout[]; readoutAt: (index: number | null) => IndicatorReadout[] } {
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

  const markLineData: Mark[] = [];
  if (input.refPrice) markLineData.push({ yAxis: input.refPrice, lineStyle: { color: colors.faint }, label: { formatter: "ref" } });
  if (input.ceiling) markLineData.push({ yAxis: input.ceiling, lineStyle: { color: colors.up }, label: { formatter: "ceil" } });
  if (input.floor) markLineData.push({ yAxis: input.floor, lineStyle: { color: colors.down }, label: { formatter: "floor" } });
  const markPoint: {
    coord: [string, number];
    value: string;
    symbol: string;
    symbolSize: number;
    label?: { show: boolean };
    itemStyle?: { color?: string };
  }[] = [];
  const areas: [AreaCorner, AreaCorner][] = [];
  for (const drawing of drawings) {
    const points = drawing.points ?? [];
    const [start, end] = points;
    if (!start) continue;
    if (drawing.tool === "horizontal") {
      markLineData.push({ yAxis: start.price, lineStyle: { color: colors.accent, width: 1.5 }, label: { show: false } });
      continue;
    }
    if (drawing.tool === "pin" || drawing.tool === "text") {
      markPoint.push({
        coord: [start.date, start.price],
        value: drawing.tool === "text" ? "note" : "pin",
        symbol: "pin",
        symbolSize: 36,
      });
      continue;
    }
    if (drawing.tool !== "trend" && drawing.tool !== "rectangle" && drawing.tool !== "fib") continue;
    if (!end) {
      markPoint.push({ coord: [start.date, start.price], value: "", symbol: "circle", symbolSize: 8, label: { show: false } });
      continue;
    }
    if (drawing.tool === "trend") {
      markLineData.push(priceSegment(start, end, colors.accent));
      continue;
    }
    if (drawing.tool === "rectangle") {
      areas.push([
        { xAxis: start.date, yAxis: start.price },
        { xAxis: end.date, yAxis: end.price },
      ]);
      continue;
    }
    for (const level of FIB_LEVELS) {
      const price = start.price + (end.price - start.price) * level;
      markLineData.push(priceSegment({ date: start.date, price }, { date: end.date, price }, colors.accent, String(level)));
    }
  }
  const neck = input.patternMark?.neckline ?? [];
  const channel = projectChannel(input.patternMark?.pattern, dates, neck);
  const plotDates = channel?.dates ?? dates;
  const railSegments = channel?.segments ?? [];
  if (channel) {
    for (const [from, to] of railSegments) {
      markLineData.push(priceSegment(from, to, colors.warn, undefined, "dashed"));
    }
  } else {
    for (let i = 0; i + 1 < neck.length; i += 2) {
      markLineData.push(priceSegment(neck[i], neck[i + 1], colors.warn, undefined, "dashed"));
    }
  }
  for (const point of input.patternMark?.points ?? []) {
    markPoint.push({
      coord: [point.date, point.price],
      value: point.role || "swing",
      symbol: "circle",
      symbolSize: 9,
      itemStyle: { color: colors.warn },
    });
  }

  const priceAxis: DailyAxis = {
    scale: true,
    gridIndex: 0,
    axisLabel: { color: colors.faint, fontFamily: "IBM Plex Mono, monospace" },
    splitLine: { lineStyle: { color: colors.border } },
    axisLine: { lineStyle: { color: colors.border } },
  };
  if (channel) {
    const dataPrices: number[] = [];
    for (const bar of bars) {
      dataPrices.push(bar.low, bar.high);
    }
    for (const plot of plots) {
      if (plot.pane !== "price") continue;
      for (const series of plot.series) finiteNumbers(series.data, dataPrices);
    }
    const railPrices = railSegments.flatMap(([from, to]) => [from.price, to.price]);
    coverPriceScale(priceAxis, dataPrices, railPrices);
  }
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
    categoryAxis(plotDates, 0, colors, separates.length === 0),
    ...separates.map((_, index) => categoryAxis(plotDates, index + 1, colors, false)),
    categoryAxis(plotDates, volumeIndex, colors, separates.length > 0),
  ];
  const grid = layoutPanes(separates.length);
  const xIndexes = xAxis.map((_, index) => index);
  const priceLines = plots.filter((plot) => plot.pane === "price").flatMap((plot) => place(plot.series, 0, 0));
  const volumeLines = plots.filter((plot) => plot.pane === "volume").flatMap((plot) => place(plot.series, volumeIndex, volumeIndex));
  const separateLines = separates.flatMap((plot, index) => place(plot.series, index + 1, index + 1));
  const readoutAt = (index: number | null) => plots.flatMap((plot) => {
    const item = plot.readoutAt(index);
    return item ? [item] : [];
  });
  const readouts = readoutAt(null);

  const option: DailyOption = {
    backgroundColor: "transparent",
    animation: false,
    tooltip: {
      show: false,
      trigger: "axis",
      position: [0, 0],
      backgroundColor: colors.elev,
      textStyle: { color: colors.text, fontFamily: "IBM Plex Mono, monospace" },
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid,
    xAxis,
    yAxis,
    dataZoom: [
      { type: "inside", xAxisIndex: xIndexes, moveOnMouseMove: (input.tool ?? "pan") === "pan" },
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
        markLine: { symbol: "none", silent: true, data: markLineData, label: { color: colors.faint } },
        markPoint: { itemStyle: { color: colors.accent }, label: { color: colors.text, fontSize: 11 }, data: markPoint },
        ...(areas.length
          ? {
              markArea: {
                silent: true,
                itemStyle: { color: colors.accent, opacity: 0.12, borderColor: colors.accent, borderWidth: 1 },
                data: areas,
              },
            }
          : {}),
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
  };

  return { option, readouts, readoutAt };
}
