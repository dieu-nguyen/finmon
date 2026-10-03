import { formatDong } from "../design-system";

/** Chart indicators. Add a row here to offer another series in the picker. */
export type DrawKind = "price-line" | "bollinger" | "volume-line" | "rsi" | "macd" | "atr";
export type LineColor = "accent" | "warn" | "up";

export type IndicatorSpec = {
  id: string;
  label: string;
  apiName: string;
  search: string[];
  draw: DrawKind;
  /** Primary stroke so overlapping price lines stay distinct. */
  line: LineColor;
};

export const MAX_INDICATORS = 5;
export const MAX_INDICATORS_REASON = "5 indicators maximum";

export const INDICATORS: IndicatorSpec[] = [
  { id: "sma", label: "SMA (20)", apiName: "sma:20", search: ["sma", "simple moving average"], draw: "price-line", line: "accent" },
  { id: "ema", label: "EMA (20)", apiName: "ema:20", search: ["ema", "exponential moving average"], draw: "price-line", line: "warn" },
  { id: "bollinger", label: "Bollinger (20, 2)", apiName: "bollinger:20", search: ["bollinger", "bb", "bands"], draw: "bollinger", line: "up" },
  { id: "volume_ma", label: "Volume MA (20)", apiName: "volume_ma:20", search: ["volume", "volume ma", "vma"], draw: "volume-line", line: "accent" },
  { id: "rsi", label: "RSI (14)", apiName: "rsi:14", search: ["rsi", "relative strength"], draw: "rsi", line: "accent" },
  { id: "macd", label: "MACD (12, 26, 9)", apiName: "macd", search: ["macd", "moving average convergence"], draw: "macd", line: "accent" },
  { id: "atr", label: "ATR (14)", apiName: "atr:14", search: ["atr", "average true range"], draw: "atr", line: "warn" },
];

export const DEFAULT_INDICATOR_IDS = ["sma"];

export function findIndicator(id: string): IndicatorSpec | undefined {
  return INDICATORS.find((item) => item.id === id);
}

/** Drop a checked id, or append one until the cap. A full list is returned unchanged. */
export function toggleIndicator(selected: readonly string[], id: string): string[] {
  if (!findIndicator(id) || (selected.length >= MAX_INDICATORS && !selected.includes(id))) return selected as string[];
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  return [...selected, id];
}

/** Comma-separated `names` query for the selected set, in selection order. */
export function indicatorQuery(ids: readonly string[]): string {
  return ids
    .map((id) => findIndicator(id)?.apiName)
    .filter((name): name is string => Boolean(name))
    .join(",");
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

function lineSeries(name: string, data: Nums, color: string, dashed = false) {
  return {
    name,
    type: "line" as const,
    data,
    showSymbol: false,
    lineStyle: { color, width: 1, type: dashed ? "dashed" : "solid" },
  };
}

function stroke(spec: IndicatorSpec, colors: PlotColors): string {
  if (spec.line === "warn") return colors.warn;
  if (spec.line === "up") return colors.up;
  return colors.accent;
}

export type PlotPane = "price" | "volume" | "separate";

export type IndicatorPlot = {
  pane: PlotPane;
  series: Record<string, unknown>[];
  axis: PlotAxis | null;
  readout: IndicatorReadout | null;
};

function assertNever(value: never): never {
  throw new Error(`Unknown indicator draw: ${String(value)}`);
}

export function indicatorPlot(spec: IndicatorSpec, payload: unknown, colors: PlotColors): IndicatorPlot {
  const empty: IndicatorPlot = { pane: "price", series: [], axis: null, readout: null };
  if (payload == null) return empty;
  const color = stroke(spec, colors);

  if (spec.draw === "price-line") {
    const data = asNums(payload);
    if (!data) return empty;
    const last = lastOf(data);
    return {
      pane: "price",
      series: [lineSeries(spec.label, data, color)],
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
      pane: "price",
      series: [
        lineSeries("Mid", mid, color),
        lineSeries("Upper", upper, colors.faint, true),
        lineSeries("Lower", lower, colors.faint, true),
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
      pane: "volume",
      series: [lineSeries(spec.label, data, color)],
      axis: null,
      readout: last == null ? null : { label: spec.label, value: formatDong(last) },
    };
  }

  if (spec.draw === "rsi") {
    const data = asNums(payload);
    if (!data) return empty;
    const last = lastOf(data);
    return {
      pane: "separate",
      series: [
        {
          ...lineSeries(spec.label, data, color),
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
      pane: "separate",
      series: [
        lineSeries("MACD", macd, color),
        lineSeries("Signal", signal, colors.warn),
        {
          name: "Histogram",
          type: "bar",
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
      pane: "separate",
      series: [lineSeries(spec.label, data, color)],
      axis: { scale: true },
      readout: last == null ? null : { label: spec.label, value: formatDong(last) },
    };
  }

  return assertNever(spec.draw);
}
