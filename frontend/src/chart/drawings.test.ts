import { describe, expect, it } from "vitest";
import type { Bar } from "../api";
import { buildDailyOption } from "./dailyOption";
import { barIndexFromPixel, drawingsAfterClick, FIB_LEVELS, type Drawing } from "./drawings";

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
  { date: "2026-01-05", open: 11, high: 14, low: 10, close: 13, volume: 80 },
  { date: "2026-01-06", open: 13, high: 15, low: 12, close: 14, volume: 90 },
];

function view(drawings: Drawing[], indicatorIds: string[] = [], indicatorData: Record<string, unknown> | null = null) {
  return buildDailyOption({
    bars,
    drawings,
    indicatorIds,
    indicatorData,
    refPrice: null,
    ceiling: null,
    floor: null,
    colors,
  });
}

function candle(drawings: Drawing[], indicatorIds: string[] = [], indicatorData: Record<string, unknown> | null = null) {
  const series = view(drawings, indicatorIds, indicatorData).option.series.find((item) => item.type === "candlestick");
  if (!series) throw new Error("missing candles");
  return series;
}

function segments(drawings: Drawing[], indicatorIds: string[] = [], indicatorData: Record<string, unknown> | null = null) {
  const data = candle(drawings, indicatorIds, indicatorData).markLine?.data ?? [];
  return data.filter((item) => Array.isArray(item));
}

describe("chart drawings", () => {
  it("anchors a trend line to both dates and prices on the candles", () => {
    const drawings: Drawing[] = [
      { tool: "trend", points: [{ date: "2026-01-02", price: 10 }, { date: "2026-01-06", price: 15 }] },
    ];
    const option = view(drawings).option;
    expect(Object.hasOwn(option, "graphic")).toBe(false);
    expect(segments(drawings)).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({ coord: ["2026-01-02", 10] }),
          expect.objectContaining({ coord: ["2026-01-06", 15] }),
        ],
      ]),
    );
  });

  it("keeps the trend line on the candle series when an oscillator pane is added", () => {
    const drawings: Drawing[] = [
      { tool: "trend", points: [{ date: "2026-01-02", price: 10 }, { date: "2026-01-06", price: 15 }] },
    ];
    const option = view(drawings, ["rsi"], { "rsi:14": [30, 40, 50] }).option;
    const series = option.series.find((item) => item.type === "candlestick");
    const rsi = option.series.find((item) => item.name === "RSI (14)");
    expect(series?.yAxisIndex ?? 0).toBe(0);
    expect(JSON.stringify(series?.markLine ?? {})).toContain("2026-01-06");
    expect(JSON.stringify(rsi?.markLine ?? {})).not.toContain("2026-01-06");
    expect(Object.hasOwn(option, "graphic")).toBe(false);
  });

  it("draws a rectangle from the two price-and-date corners", () => {
    const drawings: Drawing[] = [
      { tool: "rectangle", points: [{ date: "2026-01-02", price: 9 }, { date: "2026-01-06", price: 14 }] },
    ];
    expect(candle(drawings).markArea?.data).toEqual([
      [
        expect.objectContaining({ xAxis: "2026-01-02", yAxis: 9 }),
        expect.objectContaining({ xAxis: "2026-01-06", yAxis: 14 }),
      ],
    ]);
  });

  it("draws fibonacci levels between the two anchors", () => {
    const drawings: Drawing[] = [
      { tool: "fib", points: [{ date: "2026-01-02", price: 10 }, { date: "2026-01-06", price: 20 }] },
    ];
    const lines = segments(drawings);
    for (const level of FIB_LEVELS) {
      const price = 10 + (20 - 10) * level;
      expect(lines).toEqual(
        expect.arrayContaining([
          [
            expect.objectContaining({ coord: ["2026-01-02", price], label: expect.objectContaining({ formatter: String(level) }) }),
            expect.objectContaining({ coord: ["2026-01-06", price] }),
          ],
        ]),
      );
    }
  });

  it("shows the first trend click before the line is finished", () => {
    const drawings: Drawing[] = [{ tool: "trend", points: [{ date: "2026-01-05", price: 13 }] }];
    expect(candle(drawings).markPoint?.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ coord: ["2026-01-05", 13] })]),
    );
    expect(segments(drawings)).toEqual([]);
  });

  it("keeps a horizontal line and a pin on the candle series", () => {
    const drawings: Drawing[] = [
      { tool: "horizontal", points: [{ date: "2026-01-05", price: 12 }] },
      { tool: "pin", points: [{ date: "2026-01-02", price: 11 }] },
      { tool: "text", points: [{ date: "2026-01-06", price: 14 }] },
    ];
    const series = candle(drawings);
    expect(series.markLine?.data).toEqual(expect.arrayContaining([expect.objectContaining({ yAxis: 12 })]));
    expect(series.markPoint?.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ coord: ["2026-01-02", 11], value: "pin" }),
        expect.objectContaining({ coord: ["2026-01-06", 14], value: "note" }),
      ]),
    );
  });

  it("keeps an off-window anchor on its date instead of the first candle", () => {
    const drawings: Drawing[] = [
      { tool: "trend", points: [{ date: "1999-01-01", price: 10 }, { date: "2026-01-06", price: 15 }] },
    ];
    const encoded = JSON.stringify(view(drawings).option);
    expect(encoded).toContain("1999-01-01");
    expect(encoded).not.toContain('"xAxis":0');
  });

  it("pins the hover tooltip instead of following the pointer", () => {
    const tooltip = view([]).option.tooltip;
    expect(tooltip.trigger).toBe("axis");
    expect(tooltip.show).toBe(false);
    expect(tooltip.position).toEqual([0, 0]);
  });

  it("reads indicator values for the hovered bar", () => {
    const built = buildDailyOption({
      bars,
      drawings: [],
      indicatorIds: ["sma"],
      indicatorData: { "sma:20": [10, 11, 14] },
      refPrice: null,
      ceiling: null,
      floor: null,
      colors,
    });
    expect(built.readoutAt(0)).toEqual([{ label: "SMA (20)", value: "10" }]);
    expect(built.readoutAt(null)).toEqual([{ label: "SMA (20)", value: "14" }]);
  });

  it("stops the chart from dragging while a drawing tool is selected", () => {
    const option = buildDailyOption({
      bars,
      drawings: [],
      indicatorIds: [],
      indicatorData: null,
      refPrice: null,
      ceiling: null,
      floor: null,
      colors,
      tool: "horizontal",
    }).option;
    expect(option.dataZoom[0]).toMatchObject({ type: "inside", moveOnMouseMove: false });
  });
});

describe("drawing clicks", () => {
  const clickBars = [{ date: "2026-01-02" }, { date: "2026-01-05" }];

  it("places the point at the clicked price on the nearest bar", () => {
    expect(drawingsAfterClick([], "trend", clickBars, [0.2, 10500.6])).toEqual([
      { tool: "trend", points: [{ date: "2026-01-02", price: 10501 }] },
    ]);
  });

  it("finishes a two-point tool on the second click and can remove it", () => {
    const first = drawingsAfterClick([], "trend", clickBars, [0, 10]);
    const done = drawingsAfterClick(first ?? [], "trend", clickBars, [1, 12]);
    expect(done).toEqual([
      {
        tool: "trend",
        points: [
          { date: "2026-01-02", price: 10 },
          { date: "2026-01-05", price: 12 },
        ],
      },
    ]);
    expect(drawingsAfterClick(done ?? [], "delete", clickBars, [0, 1])).toEqual([]);
  });

  it("maps a pointer to a bar index without using the price", () => {
    expect(barIndexFromPixel(3, [1.2, 999])).toBe(1);
    expect(barIndexFromPixel(3, 0.4)).toBe(0);
    expect(barIndexFromPixel(3, [-2, 10])).toBeNull();
    expect(barIndexFromPixel(3, [9, 10])).toBeNull();
  });

  it("ignores pan and clicks that miss the bars", () => {
    const existing: Drawing[] = [{ tool: "horizontal", points: [{ date: "2026-01-02", price: 10 }] }];
    expect(drawingsAfterClick(existing, "pan", clickBars, [0, 10])).toBeNull();
    expect(drawingsAfterClick(existing, "horizontal", clickBars, [9, 10])).toBeNull();
    expect(drawingsAfterClick(existing, "horizontal", clickBars, "nope")).toBeNull();
  });
});
