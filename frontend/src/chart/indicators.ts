import { formatDong } from "../design-system";

/** Chart indicators. Add a row here to offer another series in the picker. */
export type DrawKind = "price-line" | "bollinger" | "volume-line" | "rsi" | "macd" | "atr" | "none";

export type IndicatorSpec = {
  id: string;
  label: string;
  apiName: string | null;
  search: string[];
  draw: DrawKind;
};

export const INDICATORS: IndicatorSpec[] = [
  { id: "sma", label: "SMA (20)", apiName: "sma:20", search: ["sma", "simple moving average"], draw: "price-line" },
  { id: "ema", label: "EMA (20)", apiName: "ema:20", search: ["ema", "exponential moving average"], draw: "price-line" },
  { id: "bollinger", label: "Bollinger (20, 2)", apiName: "bollinger:20", search: ["bollinger", "bb", "bands"], draw: "bollinger" },
  { id: "volume_ma", label: "Volume MA (20)", apiName: "volume_ma:20", search: ["volume", "volume ma", "vma"], draw: "volume-line" },
  { id: "rsi", label: "RSI (14)", apiName: "rsi:14", search: ["rsi", "relative strength"], draw: "rsi" },
  { id: "macd", label: "MACD (12, 26, 9)", apiName: "macd", search: ["macd", "moving average convergence"], draw: "macd" },
  { id: "atr", label: "ATR (14)", apiName: "atr:14", search: ["atr", "average true range"], draw: "atr" },
  { id: "none", label: "None", apiName: null, search: ["none", "hide", "off"], draw: "none" },
];

export const DEFAULT_INDICATOR_ID = "sma";

export function indicatorById(id: string): IndicatorSpec {
  return INDICATORS.find((item) => item.id === id) ?? INDICATORS[0];
}

export function filterIndicators(query: string): IndicatorSpec[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return INDICATORS;
  return INDICATORS.filter((item) => {
    const haystack = [item.label, item.apiName ?? "", ...item.search].join("\n").toLowerCase();
    return haystack.includes(needle);
  });
}

export type PlotColors = {
  up: string;
  down: string;
  accent: string;
  warn: string;
  faint: string;
};

export type PlotAxis = {
  min?: number;
  max?: number;
  scale: boolean;
  interval?: number;
};

export type IndicatorReadout = {
  label: string;
  value: string;
};

type Nums = (number | null)[];

function asNums(value: unknown): Nums | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : null));
}

function lastOf(values: Nums): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value != null) return value;
  }
  return null;
}

function formatOsc(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

function lineSeries(name: string, data: Nums, color: string, x: number, y: number, dashed = false) {
  return {
    name,
    type: "line" as const,
    data,
    xAxisIndex: x,
    yAxisIndex: y,
    showSymbol: false,
    lineStyle: { color, width: 1, type: dashed ? "dashed" : "solid" },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unknown indicator draw: ${String(value)}`);
}

export function indicatorPlot(spec: IndicatorSpec, payload: unknown, colors: PlotColors): {
  separate: boolean;
  series: Record<string, unknown>[];
  axis: PlotAxis | null;
  readout: IndicatorReadout | null;
} {
  const empty = { separate: false, series: [] as Record<string, unknown>[], axis: null, readout: null };
  if (spec.draw === "none" || payload == null) return empty;

  if (spec.draw === "price-line") {
    const data = asNums(payload);
    if (!data) return empty;
    const last = lastOf(data);
    return {
      separate: false,
      series: [lineSeries(spec.label, data, colors.accent, 0, 0)],
      axis: null,
      readout: last == null ? null : { label: spec.label, value: formatDong(last) },
    };
  }

  if (spec.draw === "bollinger") {
    if (!payload || typeof payload !== "object") return empty;
    const record = payload as Record<string, unknown>;
    const mid = asNums(record.mid);
    const upper = asNums(record.upper);
    const lower = asNums(record.lower);
    if (!mid || !upper || !lower) return empty;
    const last = lastOf(mid);
    return {
      separate: false,
      series: [
        lineSeries("Mid", mid, colors.accent, 0, 0),
        lineSeries("Upper", upper, colors.faint, 0, 0, true),
        lineSeries("Lower", lower, colors.faint, 0, 0, true),
      ],
      axis: null,
      readout: last == null ? null : { label: spec.label, value: formatDong(last) },
    };
  }

  if (spec.draw === "volume-line") {
    const data = asNums(payload);
    if (!data) return empty;
    const last = lastOf(data);
    return {
      separate: false,
      series: [lineSeries(spec.label, data, colors.accent, 1, 1)],
      axis: null,
      readout: last == null ? null : { label: spec.label, value: formatDong(last) },
    };
  }

  if (spec.draw === "rsi") {
    const data = asNums(payload);
    if (!data) return empty;
    const last = lastOf(data);
    return {
      separate: true,
      series: [
        {
          ...lineSeries(spec.label, data, colors.accent, 1, 1),
          markLine: {
            symbol: "none",
            label: { color: colors.faint },
            data: [
              { yAxis: 30, lineStyle: { color: colors.faint, type: "dashed" }, label: { formatter: "30" } },
              { yAxis: 70, lineStyle: { color: colors.faint, type: "dashed" }, label: { formatter: "70" } },
            ],
          },
        },
      ],
      axis: { min: 0, max: 100, scale: false, interval: 50 },
      readout: last == null ? null : { label: spec.label, value: formatOsc(last) },
    };
  }

  if (spec.draw === "macd") {
    if (!payload || typeof payload !== "object") return empty;
    const record = payload as Record<string, unknown>;
    const macd = asNums(record.macd);
    const signal = asNums(record.signal);
    const hist = asNums(record.hist);
    if (!macd || !signal || !hist) return empty;
    const last = lastOf(macd);
    const lastSignal = lastOf(signal);
    return {
      separate: true,
      series: [
        lineSeries("MACD", macd, colors.accent, 1, 1),
        lineSeries("Signal", signal, colors.warn, 1, 1),
        {
          name: "Histogram",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: hist.map((value) => ({
            value,
            itemStyle: { color: value != null && value >= 0 ? colors.up : colors.down },
          })),
        },
      ],
      axis: { scale: true },
      readout:
        last == null
          ? null
          : { label: "MACD", value: lastSignal == null ? formatDong(last) : `${formatDong(last)} / ${formatDong(lastSignal)}` },
    };
  }

  if (spec.draw === "atr") {
    const data = asNums(payload);
    if (!data) return empty;
    const last = lastOf(data);
    return {
      separate: true,
      series: [lineSeries(spec.label, data, colors.accent, 1, 1)],
      axis: { scale: true },
      readout: last == null ? null : { label: spec.label, value: formatDong(last) },
    };
  }

  return assertNever(spec.draw);
}
