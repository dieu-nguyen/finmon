import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymbolPage } from "./Symbol";

vi.mock("echarts-for-react", () => ({
  default: ({
    option,
  }: {
    option: {
      series?: { type?: string; markPoint?: { data?: { coord?: string[] }[] }; markLine?: { data?: unknown[] } }[];
    };
  }) => {
    const price = option.series?.find((item) => item.type === "candlestick");
    return (
      <div
        data-testid="chart-option"
        data-marks={JSON.stringify(price?.markPoint?.data ?? [])}
        data-lines={JSON.stringify(price?.markLine?.data ?? [])}
      />
    );
  },
}));

const bars = [{ date: "2026-09-28", open: 10, high: 12, low: 9, close: 11, volume: 100 }];
const catalog = [
  { id: "double_bottom", label: "Double bottom" },
  { id: "double_top", label: "Double top" },
  { id: "head_and_shoulders", label: "Head and shoulders" },
  { id: "inverse_head_and_shoulders", label: "Inverse head and shoulders" },
];

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

function renderSymbol(path = "/symbol/VHM") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/symbol/:ticker" element={<SymbolPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Symbol named-pattern readout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a stored result on open and does not scan until Scan is clicked", async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url.includes("/pattern-catalog")) return json(catalog);
        if (url.includes("/bars")) return json(bars);
        if (url.includes("/named-patterns") && method === "POST") {
          return json({
            ticker: "VHM",
            as_of: "2026-09-28",
            patterns: ["double_bottom"],
            matches: [
              {
                pattern: "double_bottom",
                state: "forming",
                score: 0.8,
                window_start: "2026-09-20",
                window_end: "2026-09-28",
                swings: { pattern: "double_bottom", points: [{ role: "low", date: "2026-09-20", price: 90 }], neckline: [] },
              },
            ],
          });
        }
        if (url.includes("/named-patterns")) return json({ ticker: "VHM", as_of: null, patterns: [], matches: [] });
        if (url.endsWith("/company")) return json({ ticker: "VHM", profile: [], statements: {}, ratios: [] });
        if (url.endsWith("/page-note")) return json({ body: "" });
        if (url.endsWith("/drawings")) return json([]);
        if (url.includes("/indicators")) return json({ dates: ["2026-09-28"], "sma:20": [10] });
        return json({ ticker: "VHM", name: "Vinhomes", board: "HOSE", type: "stock", listed: true, last: 11, change: 0, volume: 100, watchlist: false });
      }),
    );

    renderSymbol();
    expect(await screen.findByText("No named pattern scan yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scan" })).toBeDisabled();
    const namedCalls = calls.filter((call) => call.url.includes("/named-patterns"));
    expect(namedCalls.length).toBeGreaterThan(0);
    expect(namedCalls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(screen.queryByText("Failed to load symbol")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Company" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Patterns" }));
    fireEvent.click(screen.getByRole("option", { name: "Double bottom" }));
    expect(screen.getByRole("button", { name: "Scan" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    expect(await screen.findByRole("button", { name: /Forming/ })).toHaveTextContent("Double bottom");
    const posts = calls.filter((call) => call.url.includes("/named-patterns") && call.method === "POST");
    expect(posts).toHaveLength(1);
  });

  it("shows the stored match and keeps swing marks when the indicator changes", async () => {
    const match = {
      pattern: "double_bottom",
      state: "confirmed",
      score: 0.91,
      window_start: "2026-09-20",
      window_end: "2026-09-28",
      swings: {
        pattern: "double_bottom",
        points: [
          { role: "low", date: "2026-09-20", price: 90 },
          { role: "peak", date: "2026-09-24", price: 120 },
          { role: "low", date: "2026-09-28", price: 91 },
        ],
        neckline: [
          { date: "2026-09-24", price: 120 },
          { date: "2026-09-28", price: 120 },
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/pattern-catalog")) return json(catalog);
        if (url.includes("/bars")) return json(bars);
        if (url.includes("/named-patterns")) {
          expect(init?.method ?? "GET").toBe("GET");
          return json({ ticker: "VHM", as_of: "2026-09-28", patterns: ["double_bottom"], matches: [match] });
        }
        if (url.endsWith("/company")) return json({ ticker: "VHM", profile: [], statements: {}, ratios: [] });
        if (url.endsWith("/page-note")) return json({ body: "" });
        if (url.endsWith("/drawings")) return json([]);
        if (url.includes("/indicators")) return json({ dates: ["2026-09-28"], "sma:20": [10], "rsi:14": [40] });
        return json({ ticker: "VHM", name: "Vinhomes", board: "HOSE", type: "stock", listed: true, last: 11, change: 0, volume: 100, watchlist: false });
      }),
    );

    renderSymbol();
    expect(await screen.findByRole("button", { name: /Confirmed/ })).toHaveTextContent("Double bottom");
    expect(screen.getByRole("button", { name: /Confirmed/ })).toHaveTextContent("0.91");

    await waitFor(() => {
      const marks = JSON.parse(screen.getByTestId("chart-option").getAttribute("data-marks") || "[]") as { coord?: string[] }[];
      expect(marks.some((mark) => mark.coord?.[0] === "2026-09-20")).toBe(true);
      const lines = JSON.parse(screen.getByTestId("chart-option").getAttribute("data-lines") || "[]") as unknown[];
      expect(lines.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Indicator" }));
    fireEvent.click(screen.getByRole("option", { name: "RSI (14)" }));

    await waitFor(() => {
      const marks = JSON.parse(screen.getByTestId("chart-option").getAttribute("data-marks") || "[]") as { coord?: string[] }[];
      expect(marks.some((mark) => mark.coord?.[0] === "2026-09-20")).toBe(true);
    });
  });
});
