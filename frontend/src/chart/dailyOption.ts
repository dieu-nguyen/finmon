import type { Bar } from "../api";
import type { Drawing } from "./drawings";
import { categoryIndex } from "./drawings";
import { indicatorById, indicatorPlot, type IndicatorReadout, type PlotColors } from "./indicators";

export type ChartColors = PlotColors & {
  border: string;
  elev: string;
  text: string;
};

type Mark = { yAxis: number; lineStyle: { color: string }; label?: { formatter: string } };

export type DailySeries = {
  type: string;
  name?: string;
  yAxisIndex?: number;
  xAxisIndex?: number;
  data?: unknown;
  markLine?: { symbol?: string; data?: Mark[]; label?: { color?: string } };
  markPoint?: { data: unknown[] };
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
  indicatorId: string;
  indicatorData: unknown;
  refPrice?: number | null;
  ceiling?: number | null;
  floor?: number | null;
  colors: ChartColors;
}): { option: DailyOption; readout: IndicatorReadout | null } {
  const { bars, drawings, colors } = input;
  const dates = bars.map((bar) => bar.date);
  const spec = indicatorById(input.indicatorId);
  const plot = indicatorPlot(spec, input.indicatorData, colors);
  const separate = plot.separate;
  const volumeIndex = separate ? 2 : 1;

  const markLineData: Mark[] = [];
  if (input.refPrice) markLineData.push({ yAxis: input.refPrice, lineStyle: { color: colors.faint }, label: { formatter: "ref" } });
  if (input.ceiling) markLineData.push({ yAxis: input.ceiling, lineStyle: { color: colors.up }, label: { formatter: "ceil" } });
  if (input.floor) markLineData.push({ yAxis: input.floor, lineStyle: { color: colors.down }, label: { formatter: "floor" } });
  for (const drawing of drawings) {
    if (drawing.tool === "horizontal" && drawing.points[0]) {
      markLineData.push({ yAxis: drawing.points[0].price, lineStyle: { color: colors.accent } });
    }
  }
  const markPoint = drawings
    .filter((drawing) => drawing.tool === "pin" || drawing.tool === "text")
    .map((drawing) => ({
      coord: [drawing.points[0]?.date, drawing.points[0]?.price],
      value: drawing.tool === "text" ? "note" : "pin",
    }));
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
  if (separate && plot.axis) {
    yAxis.push({
      ...plot.axis,
      gridIndex: 1,
      axisLabel: { color: colors.faint, fontFamily: "IBM Plex Mono, monospace" },
      splitLine: { lineStyle: { color: colors.border } },
    });
  }
  yAxis.push(volumeAxis);

  const xAxis = separate
    ? [categoryAxis(dates, 0, colors, false), categoryAxis(dates, 1, colors, false), categoryAxis(dates, volumeIndex, colors, true)]
    : [categoryAxis(dates, 0, colors, true), categoryAxis(dates, 1, colors, false)];

  const grid = separate
    ? [
        { left: 60, right: 20, top: 16, height: "42%" },
        { left: 60, right: 20, top: "52%", height: "18%" },
        { left: 60, right: 20, top: "74%", height: "12%" },
      ]
    : [
        { left: 60, right: 20, top: 24, height: "58%" },
        { left: 60, right: 20, top: "78%", height: "14%" },
      ];

  const xIndexes = separate ? [0, 1, 2] : [0, 1];
  const priceLines = plot.series.filter((series) => (series.yAxisIndex as number) === 0);
  const otherLines = plot.series.filter((series) => (series.yAxisIndex as number) !== 0);

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
        markPoint: { data: markPoint },
      },
      ...(priceLines as DailySeries[]),
      {
        type: "bar",
        xAxisIndex: volumeIndex,
        yAxisIndex: volumeIndex,
        data: bars.map((bar) => ({
          value: bar.volume,
          itemStyle: { color: bar.close >= bar.open ? "rgba(61,214,140,0.4)" : "rgba(248,113,113,0.4)" },
        })),
      },
      ...(otherLines as DailySeries[]),
    ],
    graphic: graphics,
  };

  return { option, readout: plot.readout };
}
