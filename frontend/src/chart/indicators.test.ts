import { describe, expect, it } from "vitest";
import type { Bar } from "../api";
import { buildDailyOption } from "./dailyOption";
import { filterIndicators, INDICATORS, indicatorQuery, toggleIndicator } from "./indicators";

const colors = {
  up: "#3dd68c",
  down: "#f87171",
  border: "#2a3340",
  faint: "#5c6b82",
  elev: "#161b22",
  text: "#e6edf3",
  accent: "#6ea8fe",
  warn: "#e3b341",
};

const bars: Bar[] = [
  { date: "2026-01-02", open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { date: "2026-01-03", open: 11, high: 13, low: 10, close: 12, volume: 120 },
];

function optionFor(indicatorIds: string[], indicatorData: Record<string, unknown> | null, extra?: { refPrice?: number }) {
  return buildDailyOption({
    bars,
    drawings: [{ tool: "horizontal", points: [{ date: "2026-01-02", price: 11 }] }],
    indicatorIds,
    indicatorData,
    refPrice: extra?.refPrice ?? null,
    ceiling: null,
    floor: null,
    colors,
  });
}

function seriesOf(option: ReturnType<typeof buildDailyOption>) {
  return option.option.series;
}

describe("indicator catalog", () => {
  it("lists one extendable definition for each chart indicator", () => {
    expect(INDICATORS.map((item) => [item.label, item.apiName])).toEqual([
      ["SMA (20)", "sma:20"],
      ["EMA (20)", "ema:20"],
      ["Bollinger (20, 2)", "bollinger:20"],
      ["Volume MA (20)", "volume_ma:20"],
      ["RSI (14)", "rsi:14"],
      ["MACD (12, 26, 9)", "macd"],
      ["ATR (14)", "atr:14"],
    ]);
  });

  it("toggles a set of ids and refuses a sixth", () => {
    const five = ["sma", "ema", "bollinger", "volume_ma", "rsi"];
    expect(toggleIndicator(["sma"], "rsi")).toEqual(["sma", "rsi"]);
    expect(toggleIndicator(["sma", "rsi"], "sma")).toEqual(["rsi"]);
    expect(toggleIndicator(five, "macd")).toBe(five);
    expect(toggleIndicator(five, "rsi")).toEqual(["sma", "ema", "bollinger", "volume_ma"]);
    expect(indicatorQuery(["sma", "rsi"])).toBe("sma:20,rsi:14");
    expect(indicatorQuery([])).toBe("");
  });

  it("filters by name and abbreviation and shows the full list when the query is empty", () => {
    expect(filterIndicators("").map((item) => item.id)).toEqual(INDICATORS.map((item) => item.id));
    expect(filterIndicators("   ").map((item) => item.id)).toEqual(INDICATORS.map((item) => item.id));
    expect(filterIndicators("rsi").map((item) => item.id)).toEqual(["rsi"]);
    expect(filterIndicators("RSI").map((item) => item.id)).toEqual(["rsi"]);
    expect(filterIndicators("bb").map((item) => item.id)).toEqual(["bollinger"]);
  });
});

describe("indicator drawing", () => {
  it("draws SMA on the price pane and keeps candles, volume, and price levels", () => {
    const view = optionFor(["sma"], { "sma:20": [null, 11.5] }, { refPrice: 10 });
    const series = seriesOf(view);
    const candle = series.find((item) => item.type === "candlestick");
    const line = series.find((item) => item.name === "SMA (20)");
    const volume = series.find((item) => item.type === "bar");
    expect(view.option.grid).toHaveLength(2);
    expect(line).toMatchObject({ type: "line", yAxisIndex: 0, xAxisIndex: 0, data: [null, 11.5] });
    expect(candle?.yAxisIndex ?? 0).toBe(0);
    expect(candle?.markLine?.data?.some((item) => !Array.isArray(item) && item.label?.formatter === "ref")).toBe(true);
    expect(candle?.markLine?.data?.some((item) => !Array.isArray(item) && item.yAxis === 11)).toBe(true);
    expect(volume).toMatchObject({ yAxisIndex: 1, xAxisIndex: 1 });
    expect(view.option.dataZoom[0].xAxisIndex).toEqual([0, 1]);
    expect(view.readouts.map((item) => item.label)).toEqual(["SMA (20)"]);
    expect((line?.lineStyle as { color?: string } | undefined)?.color).toBe("#6ea8fe");
  });

  it("draws SMA and EMA on the price pane in different colors", () => {
    const view = optionFor(["sma", "ema"], { "sma:20": [10, 11], "ema:20": [9, 10] });
    const sma = seriesOf(view).find((item) => item.name === "SMA (20)");
    const ema = seriesOf(view).find((item) => item.name === "EMA (20)");
    expect(view.option.grid).toHaveLength(2);
    expect(sma).toMatchObject({ yAxisIndex: 0 });
    expect(ema).toMatchObject({ yAxisIndex: 0 });
    expect((sma?.lineStyle as { color?: string } | undefined)?.color).toBe("#6ea8fe");
    expect((ema?.lineStyle as { color?: string } | undefined)?.color).toBe("#e3b341");
  });

  it("draws SMA and RSI together without putting RSI on the price scale", () => {
    const view = optionFor(["sma", "rsi"], { "sma:20": [10, 11], "rsi:14": [30, 70] }, { refPrice: 10 });
    const series = seriesOf(view);
    expect(view.option.grid).toHaveLength(3);
    expect(series.find((item) => item.name === "SMA (20)")).toMatchObject({ yAxisIndex: 0 });
    expect(series.find((item) => item.name === "RSI (14)")).toMatchObject({ yAxisIndex: 1, data: [30, 70] });
    expect(series.find((item) => item.type === "candlestick")?.yAxisIndex ?? 0).toBe(0);
    expect(series.find((item) => item.type === "bar")).toMatchObject({ yAxisIndex: 2 });
    expect(view.option.yAxis[1]).toMatchObject({ min: 0, max: 100 });
    expect(view.option.yAxis[0]?.min).toBeUndefined();
  });

  it("draws Bollinger mid, upper, and lower on the price pane", () => {
    const view = optionFor(["bollinger"], {
      "bollinger:20": {
        mid: [10, 11],
        upper: [12, 13],
        lower: [8, 9],
      },
    });
    const lines = seriesOf(view).filter((item) => item.type === "line");
    expect(view.option.grid).toHaveLength(2);
    expect(lines.map((item) => item.name)).toEqual(["Mid", "Upper", "Lower"]);
    expect(lines.every((item) => item.yAxisIndex === 0)).toBe(true);
  });

  it("draws Volume MA on the volume pane", () => {
    const view = optionFor(["volume_ma"], { "volume_ma:20": [80, 90] });
    const line = seriesOf(view).find((item) => item.name === "Volume MA (20)");
    const volume = seriesOf(view).find((item) => item.type === "bar");
    expect(view.option.grid).toHaveLength(2);
    expect(line).toMatchObject({ yAxisIndex: 1, xAxisIndex: 1, data: [80, 90] });
    expect(volume?.yAxisIndex).toBe(1);
  });

  it("puts RSI on its own 0–100 pane so it does not share the price scale", () => {
    const view = optionFor(["rsi"], { "rsi:14": [30, 70] }, { refPrice: 10 });
    const series = seriesOf(view);
    const candle = series.find((item) => item.type === "candlestick");
    const rsi = series.find((item) => item.name === "RSI (14)");
    const volume = series.find((item) => item.type === "bar");
    expect(view.option.grid).toHaveLength(3);
    expect(rsi).toMatchObject({ type: "line", yAxisIndex: 1, xAxisIndex: 1, data: [30, 70] });
    expect(candle?.yAxisIndex ?? 0).toBe(0);
    expect(volume).toMatchObject({ yAxisIndex: 2, xAxisIndex: 2 });
    expect(view.option.yAxis[1]).toMatchObject({ min: 0, max: 100, scale: false, gridIndex: 1 });
    expect(view.option.yAxis[0]?.min).toBeUndefined();
    expect(candle?.markLine?.data?.some((item) => !Array.isArray(item) && item.yAxis === 30)).toBe(false);
    expect(view.option.dataZoom[0].xAxisIndex).toEqual([0, 1, 2]);
    expect(view.readouts.map((item) => item.label)).toEqual(["RSI (14)"]);
  });

  it("stacks RSI and MACD on separate panes", () => {
    const view = optionFor(["rsi", "macd"], {
      "rsi:14": [40, 60],
      macd: { macd: [1, 2], signal: [0.5, 1.5], hist: [0.5, -0.5] },
    });
    const series = seriesOf(view);
    expect(view.option.grid).toHaveLength(4);
    expect(series.find((item) => item.name === "RSI (14)")).toMatchObject({ yAxisIndex: 1 });
    expect(series.find((item) => item.name === "MACD")).toMatchObject({ yAxisIndex: 2 });
    expect(series.find((item) => item.name === "Histogram")).toMatchObject({ yAxisIndex: 2 });
    expect(series.find((item) => item.type === "candlestick")?.yAxisIndex ?? 0).toBe(0);
    expect(view.option.yAxis[1]).toMatchObject({ min: 0, max: 100 });
    expect(view.option.yAxis[2]?.min).toBeUndefined();
    expect(view.option.yAxis[0]?.min).toBeUndefined();
    expect(series.find((item) => item.type === "bar" && !item.name)).toMatchObject({ yAxisIndex: 3 });
  });

  it("draws MACD, signal, and histogram on a separate pane", () => {
    const view = optionFor(["macd"], {
      macd: {
        macd: [1, 2],
        signal: [0.5, 1.5],
        hist: [0.5, -0.5],
      },
    });
    const names = seriesOf(view).map((item) => item.name).filter(Boolean);
    const histogram = seriesOf(view).find((item) => item.name === "Histogram");
    expect(view.option.grid).toHaveLength(3);
    expect(names).toEqual(expect.arrayContaining(["MACD", "Signal", "Histogram"]));
    expect(histogram).toMatchObject({ type: "bar", yAxisIndex: 1 });
    expect(seriesOf(view).find((item) => item.type === "candlestick")?.yAxisIndex ?? 0).toBe(0);
    expect(seriesOf(view).filter((item) => item.name === "MACD" || item.name === "Signal").every((item) => item.yAxisIndex === 1)).toBe(true);
    expect(view.option.yAxis[1]?.min).toBeUndefined();
    expect(view.option.yAxis[1]?.max).toBeUndefined();
    expect(view.option.yAxis[1]?.scale).toBe(true);
  });

  it("draws ATR on its own pane", () => {
    const view = optionFor(["atr"], { "atr:14": [1.2, 1.4] });
    const atr = seriesOf(view).find((item) => item.name === "ATR (14)");
    expect(view.option.grid).toHaveLength(3);
    expect(atr).toMatchObject({ type: "line", yAxisIndex: 1, data: [1.2, 1.4] });
    expect(view.option.yAxis[1]?.scale).toBe(true);
    expect(view.option.yAxis[1]?.min).toBeUndefined();
    expect(seriesOf(view).find((item) => item.type === "bar")?.yAxisIndex).toBe(2);
  });

  it("draws candles and volume only when nothing is selected", () => {
    const view = optionFor([], { "sma:20": [1, 2], "rsi:14": [30, 70] });
    const series = seriesOf(view);
    expect(view.option.grid).toHaveLength(2);
    expect(series.map((item) => item.type)).toEqual(["candlestick", "bar"]);
    expect(view.option.yAxis.some((axis) => axis.min === 0 && axis.max === 100)).toBe(false);
    expect(view.readouts).toEqual([]);
  });
});
