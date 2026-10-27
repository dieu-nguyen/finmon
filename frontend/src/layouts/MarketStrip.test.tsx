import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketSummary } from "../api";
import { AppShell } from "./AppShell";
import { formatPoints, formatTurnover } from "./MarketStrip";

function json(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body } as Response);
}

const summary: MarketSummary = {
  sessions: 7,
  as_of: "2026-10-23",
  index: { close: 1774.15, change: 15.52, change_pct: 0.88, closes: [1758.63, 1774.15] },
  days: [
    { date: "2026-10-22", up: 100, down: 120, flat: 10, value: 10_000_000_000_000 },
    { date: "2026-10-23", up: 152, down: 154, flat: 70, value: 18_500_000_000_000 },
  ],
};

const zeros: MarketSummary = {
  ...summary,
  days: summary.days.map((day) => ({ ...day, value: 0 })),
};

function renderShell(path = "/market") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/market" element={<h1 className="page-title">Market</h1>} />
          <Route path="/scans" element={<h1 className="page-title">Scans</h1>} />
          <Route path="/patterns" element={<h1 className="page-title">Patterns</h1>} />
          <Route path="/symbol/:ticker" element={<h1 className="page-title">Symbol</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("market strip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pins the three cells and an empty slot above the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/health")) return json({ status: "ok", as_of: null, watermarks: [] });
        if (url.includes("/api/market/summary")) return json(summary);
        return json({});
      }),
    );
    renderShell("/scans");
    expect(screen.getByRole("heading", { name: "Scans" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /VN-Index/ })).toHaveAttribute("href", "/symbol/VNINDEX");
    expect(screen.getByTestId("strip-index")).toHaveClass("up");
    expect(screen.getByText(formatPoints(1774.15))).toBeInTheDocument();
    expect(screen.getByText(/152 up/)).toBeInTheDocument();
    expect(screen.getByText(formatTurnover(18_500_000_000_000))).toBeInTheDocument();
    expect(screen.getByText(/above average/)).toBeInTheDocument();
    expect(screen.getByText("session 2026-10-23")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 sessions" })).toHaveAttribute("aria-pressed", "true");
    const slot = screen.getByTestId("strip-slot");
    expect(slot).toBeEmptyDOMElement();
    expect(document.body.textContent).not.toMatch(/foreign|coming soon/i);
    expect(screen.getByTestId("strip-index-line")).toBeInTheDocument();
    expect(screen.getByTestId("strip-value-bars")).toBeInTheDocument();
  });

  it("says turnover was not stored when every session value is zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/market/summary")) return json(zeros);
        return json({ status: "ok", as_of: null, watermarks: [] });
      }),
    );
    renderShell();
    expect(await screen.findByText("Turnover was not stored")).toBeInTheDocument();
    expect(screen.queryByTestId("strip-value-bars")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Market" })).toBeInTheDocument();
  });

  it("keeps the page when the summary fails and cancels the previous window", async () => {
    const signals: AbortSignal[] = [];
    let summaryCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/health")) return json({ status: "ok", as_of: null, watermarks: [] });
        if (!url.includes("/api/market/summary")) return json({});
        summaryCalls += 1;
        if (summaryCalls === 1) return Promise.reject(Object.assign(new Error("down"), { name: "TypeError" }));
        const signal = init?.signal;
        if (signal) signals.push(signal);
        return new Promise((_resolve, reject) => {
          const fail = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          if (signal?.aborted) {
            fail();
            return;
          }
          signal?.addEventListener("abort", fail, { once: true });
        });
      }),
    );
    renderShell("/patterns");
    expect(screen.getByRole("heading", { name: "Patterns" })).toBeInTheDocument();
    expect(await screen.findByText("Summary unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Patterns" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "30 sessions" }));
    await waitFor(() => expect(signals.length).toBe(1));
    expect(signals[0].aborted).toBe(false);
    expect(String(vi.mocked(fetch).mock.calls.find((call) => String(call[0]).includes("sessions=30")))).toContain("sessions=30");
    fireEvent.click(screen.getByRole("button", { name: "7 sessions" }));
    await waitFor(() => expect(signals.length).toBe(2));
    expect(signals[0].aborted).toBe(true);
    expect(screen.getByRole("heading", { name: "Patterns" })).toBeInTheDocument();
  });

  it("shows the strip on a symbol route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/market/summary")) return json(summary);
        return json({ status: "ok", as_of: null, watermarks: [] });
      }),
    );
    renderShell("/symbol/VHM");
    expect(screen.getByRole("heading", { name: "Symbol" })).toBeInTheDocument();
    expect(await screen.findByText("HOSE breadth")).toBeInTheDocument();
    expect(screen.getByTestId("strip-slot")).toBeEmptyDOMElement();
  });
});
