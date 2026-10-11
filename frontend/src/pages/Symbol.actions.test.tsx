import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymbolPage } from "./Symbol";

vi.mock("../chart/DailyChart", () => ({
  DailyChart: ({
    onDrawings,
  }: {
    onDrawings: (drawings: { tool: string; points: { date: string; price: number }[] }[]) => void;
  }) => (
    <button
      type="button"
      onClick={() => onDrawings([{ tool: "horizontal", points: [{ date: "2026-09-28", price: 11 }] }])}
    >
      Draw horizontal
    </button>
  ),
}));

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
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

function stubFetch(extra?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined) {
  return vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const override = extra?.(url, init);
      if (override) return override;
      if (url.endsWith("/bars")) return json([{ date: "2026-09-28", open: 1, high: 2, low: 1, close: 2, volume: 10 }]);
      if (url.endsWith("/company")) return json({ ticker: "TIG", profile: [], statements: {}, ratios: [] });
      if (url.endsWith("/page-note")) return json({ body: "thesis" });
      if (url.includes("/indicators")) return json({ "sma:20": [null] });
      if (url.endsWith("/drawings")) return json([]);
      if (url.includes("/pattern-catalog")) return json([]);
      if (url.includes("/named-patterns")) return json({ ticker: "TIG", as_of: null, patterns: [], matches: [] });
      return json({
        ticker: "TIG",
        name: "Thang Long",
        board: "HNX",
        type: "stock",
        listed: true,
        last: 2,
        change: 0.01,
        volume: 10,
        watchlist: false,
      });
    }),
  );
}

describe("Symbol note, alert, and drawings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the page note and shows a toast", async () => {
    const puts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/page-note") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return json({ ticker: "TIG", body: "updated", updated_at: "2026-09-28T00:00:00" });
      }
    });
    renderSymbol();
    fireEvent.click(await screen.findByRole("button", { name: "Note" }));
    const box = screen.getByLabelText("Note");
    expect(box).toHaveValue("thesis");
    fireEvent.change(box, { target: { value: "updated thesis" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(puts).toEqual([{ body: "updated thesis" }]));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("creates an inline alert for the open ticker", async () => {
    const posts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/api/alerts") && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return json({ id: 4, ticker: "TIG", op: "lte", price: 1000, mode: "repeat", enabled: true, last_fired_at: null });
      }
    });
    renderSymbol();
    fireEvent.click(await screen.findByRole("button", { name: "Alert" }));
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "lte" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "repeat" } });
    fireEvent.click(screen.getByRole("button", { name: "Add alert" }));
    await waitFor(() => expect(posts).toEqual([{ ticker: "TIG", op: "lte", price: 1000, mode: "repeat" }]));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("persists a drawing after the debounce", async () => {
    const puts: unknown[] = [];
    stubFetch((url, init) => {
      if (url.endsWith("/drawings") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return json([{ tool: "horizontal", points: [{ date: "2026-09-28", price: 11 }] }]);
      }
    });
    renderSymbol();
    fireEvent.click(await screen.findByRole("button", { name: "Draw horizontal" }));
    expect(puts).toHaveLength(0);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual([{ tool: "horizontal", points: [{ date: "2026-09-28", price: 11 }] }]);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
