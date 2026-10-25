import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymbolPage } from "../pages/Symbol";
import { BAR_OPTIONS, DEFAULT_BAR_SIZE, RANGE_OPTIONS } from "./chartWindow";

vi.mock("echarts-for-react", () => ({
  default: () => <div data-testid="chart-option" />,
}));

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

const bars = [{ date: "2026-01-02", open: 10, high: 12, low: 9, close: 11, volume: 100 }];

function stubFetch(barsFetch?: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/bars")) return barsFetch ? barsFetch(url, init) : json(bars);
      if (url.includes("/indicators")) return json({ dates: ["2026-01-02"], "sma:20": [10] });
      if (url.endsWith("/company")) return json({ ticker: "TIG", profile: [], statements: {}, ratios: [] });
      if (url.endsWith("/page-note")) return json({ body: "" });
      if (url.endsWith("/drawings")) return json([]);
      if (url.includes("/named-patterns")) return json({ as_of: null, patterns: [], matches: [] });
      return json({
        ticker: "TIG",
        name: "Thang Long",
        board: "HNX",
        type: "stock",
        listed: true,
        last: 11,
        change: 0.01,
        volume: 100,
        watchlist: false,
      });
    }),
  );
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

describe("symbol chart window", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists 1 year through later ranges and defaults the bars to Day", async () => {
    const labels: string[] = RANGE_OPTIONS.map((option) => option.label);
    expect(labels).toEqual(expect.arrayContaining(["1 year", "15 months", "2 years", "3 years"]));
    expect(labels).not.toContain("6 months");
    expect(labels.some((label) => label.includes("6 month"))).toBe(false);
    expect(DEFAULT_BAR_SIZE).toBe("day");
    expect(BAR_OPTIONS[0]).toEqual({ id: "day", label: "Day" });

    stubFetch();
    renderSymbol();

    const range = await screen.findByRole("combobox", { name: "Range" });
    const barSize = screen.getByRole("combobox", { name: "Bars" });
    expect(range.closest(".tool-row")).not.toBeNull();
    expect(Array.from(range.querySelectorAll("option")).map((option) => option.textContent)).toEqual(labels);
    expect((range as HTMLSelectElement).value).toBe("12");
    expect(Array.from(barSize.querySelectorAll("option")).map((option) => option.textContent)).toEqual(["Day", "Week", "Month"]);
    expect((barSize as HTMLSelectElement).value).toBe("day");
  });

  it("cancels the previous candle request when the range changes", async () => {
    const signals: AbortSignal[] = [];
    let calls = 0;
    stubFetch((_url, init) => {
      calls += 1;
      if (calls === 1) return json(bars);
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
    });
    renderSymbol();
    const range = await screen.findByRole("combobox", { name: "Range" });
    fireEvent.change(range, { target: { value: "15" } });
    await waitFor(() => expect(signals.length).toBe(1));
    fireEvent.change(screen.getByRole("combobox", { name: "Range" }), { target: { value: "18" } });
    await waitFor(() => expect(signals.length).toBe(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });
});
