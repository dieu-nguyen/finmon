import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Compare } from "./Compare";

vi.mock("../chart/PriceChart", () => ({
  PriceChart: ({ ticker, bars }: { ticker: string; bars: { date: string }[] }) => (
    <div data-testid={`price-chart-${ticker}`}>{bars.length} bars</div>
  ),
}));

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

const hits = {
  pattern_id: 3,
  name: "Rise",
  kind: "lookalike",
  reference: "VCB",
  as_of: "2026-09-28",
  reference_compared: true,
  hits: [
    {
      ticker: "VHM",
      name: "Vinhomes",
      score: 0.9123,
      window_start: "2026-06-01",
      window_end: "2026-09-28",
    },
  ],
};

const bars = [
  { date: "2026-06-01", open: 10, high: 11, low: 9, close: 10, volume: 1 },
  { date: "2026-09-28", open: 11, high: 12, low: 10, close: 12, volume: 1 },
];

function renderCompare(path = "/scans/3/compare/vhm") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scans/:patternId/compare/:ticker" element={<Compare />} />
        <Route path="/scans" element={<h1>Scans list</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Compare page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the latest hit and draws both windows", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/api/patterns/3/hits")) return json(hits);
        if (url.includes("/api/symbols/VCB/bars")) return json(bars);
        if (url.includes("/api/symbols/VHM/bars")) return json(bars.slice(0, 1));
        return json({}, false);
      }),
    );

    renderCompare();
    expect(await screen.findByRole("link", { name: "Scans" })).toHaveAttribute("href", "/scans");
    expect(screen.getByText("VCB")).toBeInTheDocument();
    expect(screen.getByText("VHM")).toBeInTheDocument();
    expect(screen.getByText("0.9123")).toBeInTheDocument();
    expect(screen.getByText("2026-06-01 – 2026-09-28")).toBeInTheDocument();
    expect(screen.getByTestId("price-chart-VCB")).toHaveTextContent("2 bars");
    expect(screen.getByTestId("price-chart-VHM")).toHaveTextContent("1 bars");
    expect(urls.some((url) => url.includes("from=2026-06-01") && url.includes("to=2026-09-28"))).toBe(true);
  });

  it("shows an empty state when the ticker is not on the latest run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/patterns/3/hits")) return json({ ...hits, hits: [] });
        return json([]);
      }),
    );
    renderCompare();
    expect(await screen.findByText("That hit is not on the latest successful run")).toBeInTheDocument();
    expect(screen.queryByTestId("price-chart-VCB")).not.toBeInTheDocument();
  });

  it("shows an empty state when the compare request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json({}, false)),
    );
    renderCompare();
    expect(await screen.findByText("Failed to load compare")).toBeInTheDocument();
  });
});
