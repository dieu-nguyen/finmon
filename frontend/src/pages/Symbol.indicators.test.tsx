import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymbolPage } from "./Symbol";

vi.mock("echarts-for-react", () => ({
  default: ({
    option,
    notMerge,
  }: {
    option: {
      grid?: unknown[];
      series?: { type?: string; name?: string; yAxisIndex?: number }[];
      yAxis?: { min?: number; max?: number }[];
    };
    notMerge?: boolean;
  }) => (
    <div
      data-testid="chart-option"
      data-not-merge={String(Boolean(notMerge))}
      data-grid={String(option.grid?.length ?? 0)}
      data-series={JSON.stringify((option.series ?? []).map((item) => ({ type: item.type, name: item.name ?? "", y: item.yAxisIndex ?? 0 })))}
      data-yaxis={JSON.stringify((option.yAxis ?? []).map((axis) => ({ min: axis.min ?? null, max: axis.max ?? null })))}
    />
  ),
}));

const bars = [{ date: "2026-01-02", open: 10, high: 12, low: 9, close: 11, volume: 100 }];

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

function namesFrom(url: string): string | null {
  return new URL(url, "http://localhost").searchParams.get("names");
}

function chartState() {
  const node = screen.getByTestId("chart-option");
  return {
    grid: node.getAttribute("data-grid"),
    series: JSON.parse(node.getAttribute("data-series") || "[]") as { type: string; name: string; y: number }[],
    yaxis: JSON.parse(node.getAttribute("data-yaxis") || "[]") as { min: number | null; max: number | null }[],
  };
}

function renderSymbol() {
  return render(
    <MemoryRouter initialEntries={["/symbol/tig"]}>
      <Routes>
        <Route path="/symbol/:ticker" element={<SymbolPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Symbol indicator picker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to SMA (20), filters the list, and requests the indicator that is selected", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("/bars")) return json(bars);
        if (url.includes("/indicators")) {
          const names = namesFrom(url) ?? "";
          const body: Record<string, unknown> = { dates: ["2026-01-02"] };
          if (names.includes("sma:20")) body["sma:20"] = [10.5];
          if (names.includes("rsi:14")) body["rsi:14"] = [62];
          return json(body);
        }
        if (url.endsWith("/company")) return json({ ticker: "TIG", profile: [], statements: {}, ratios: [] });
        if (url.endsWith("/page-note")) return json({ body: "" });
        if (url.endsWith("/drawings")) return json([]);
        return json({ ticker: "TIG", name: "Thang Long", board: "HNX", type: "stock", listed: true, last: 11, change: 0.01, volume: 100, watchlist: false });
      }),
    );

    renderSymbol();

    const box = await screen.findByRole("combobox", { name: "Indicator" });
    expect(screen.getByRole("button", { name: "Remove SMA (20)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "None" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SMA 20" })).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-option")).toHaveAttribute("data-not-merge", "true");
    await waitFor(() => {
      const indicatorUrls = urls.filter((url) => url.includes("/indicators"));
      expect(indicatorUrls).toHaveLength(1);
      expect(namesFrom(indicatorUrls[0])).toBe("sma:20");
      expect(indicatorUrls[0]).not.toContain("from=");
      expect(indicatorUrls[0]).not.toContain("to=");
      expect(chartState().series.some((item) => item.name === "SMA (20)" && item.y === 0)).toBe(true);
    });

    fireEvent.click(box);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "SMA (20)",
      "EMA (20)",
      "Bollinger (20, 2)",
      "Volume MA (20)",
      "RSI (14)",
      "MACD (12, 26, 9)",
      "ATR (14)",
    ]);
    fireEvent.change(screen.getByRole("combobox", { name: "Indicator" }), { target: { value: "rsi" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["RSI (14)"]);
    fireEvent.click(screen.getByRole("option", { name: "RSI (14)" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await waitFor(() => {
      const requested = urls.filter((url) => url.includes("/indicators")).map((url) => namesFrom(url));
      expect(requested).toEqual(["sma:20", "sma:20,rsi:14"]);
      const state = chartState();
      expect(state.grid).toBe("3");
      expect(state.series.find((item) => item.name === "SMA (20)")?.y).toBe(0);
      expect(state.series.find((item) => item.name === "RSI (14)")?.y).toBe(1);
      expect(state.series.find((item) => item.type === "candlestick")?.y).toBe(0);
      expect(state.yaxis.some((axis) => axis.min === 0 && axis.max === 100)).toBe(true);
      expect(state.yaxis[0]?.min).toBeNull();
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Indicator" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("option", { name: "SMA (20)" }));
    await waitFor(() => {
      const requested = urls.filter((url) => url.includes("/indicators")).map((url) => namesFrom(url));
      expect(requested).toEqual(["sma:20", "sma:20,rsi:14", "rsi:14"]);
      const state = chartState();
      expect(state.grid).toBe("3");
      expect(state.series.some((item) => item.name === "SMA (20)")).toBe(false);
      expect(state.series.find((item) => item.name === "RSI (14)")?.y).toBe(1);
      expect(state.series.find((item) => item.type === "candlestick")?.y).toBe(0);
    });
  });

  it("aborts the previous indicator request when the selection changes", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/bars")) return json(bars);
        if (url.includes("/indicators")) {
          const signal = init?.signal;
          if (signal) signals.push(signal);
          return new Promise((resolve, reject) => {
            const fail = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
            if (signal?.aborted) {
              fail();
              return;
            }
            signal?.addEventListener("abort", fail, { once: true });
          });
        }
        if (url.endsWith("/company")) return json(null);
        if (url.endsWith("/page-note")) return json({ body: "" });
        if (url.endsWith("/drawings")) return json([]);
        return json({ ticker: "TIG", name: "Thang Long", board: "HNX", type: "stock", listed: true, last: 11, change: null, volume: 100, watchlist: false });
      }),
    );

    renderSymbol();
    const box = await screen.findByRole("combobox", { name: "Indicator" });
    await waitFor(() => expect(signals.length).toBe(1));
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("option", { name: "RSI (14)" }));
    await waitFor(() => expect(signals.length).toBe(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });
});
