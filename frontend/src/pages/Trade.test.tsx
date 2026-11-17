import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addCivilDays, ictYmd } from "../time";
import { Trade } from "./Trade";

function json(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => body,
  } as Response);
}

const empty = {
  starting_cash: 1_000_000_000,
  cash: 1_000_000_000,
  equity: 1_000_000_000,
  market_value: 0,
  realized_pnl: 0,
  unrealized_pnl: 0,
  total_pnl: 0,
  positions: [],
  fills: [],
};

const long = {
  starting_cash: 1_000_000_000,
  cash: 991_000_000,
  equity: 1_000_900_000,
  market_value: 9_900_000,
  realized_pnl: 0,
  unrealized_pnl: 900_000,
  total_pnl: 900_000,
  positions: [
    {
      ticker: "VCB",
      name: "Vietcombank",
      quantity: 100,
      avg_cost: 90000,
      last: 99000,
      market_value: 9_900_000,
      unrealized_pnl: 900_000,
      change_pct: 10,
    },
  ],
  fills: [{ id: 1, ticker: "VCB", side: "buy", quantity: 100, price: 90000, realized_pnl: 0, created_at: "2026-11-14T08:00:00" }],
};

function renderTrade() {
  return render(
    <MemoryRouter>
      <Trade />
    </MemoryRouter>,
  );
}

describe("Trade", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows starting cash and an empty book", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json(empty)),
    );
    renderTrade();
    expect((await screen.findAllByText("1.000.000.000")).length).toBeGreaterThan(0);
    expect(screen.getByText("No positions. Fill a buy at last price.")).toBeInTheDocument();
  });

  it("fills a buy at last and shows the position with profit", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/paper") && !init?.method) return json(empty);
      if (url.endsWith("/api/paper/orders")) return json(long);
      return json(empty);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderTrade();
    await screen.findAllByText("1.000.000.000");
    fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "vcb" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect((await screen.findAllByRole("link", { name: "VCB" })).length).toBeGreaterThan(0);
    expect(screen.getAllByText("+900.000").length).toBeGreaterThan(0);
    const order = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/api/paper/orders"));
    expect(order?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(order?.[1]?.body))).toEqual({ side: "buy", ticker: "VCB", quantity: 100 });
  });

  it("shows the API error when a fill is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        if (String(input).endsWith("/api/paper/orders") && init?.method === "POST") {
          return json({ detail: "insufficient cash" }, false, 400);
        }
        return json(empty);
      }),
    );
    renderTrade();
    await screen.findAllByText("1.000.000.000");
    fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "VCB" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(await screen.findByText("insufficient cash")).toBeInTheDocument();
  });

  it("resets the book back to starting cash", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      if (String(input).endsWith("/api/paper/reset") && init?.method === "POST") return json(empty);
      if (String(input).endsWith("/api/paper")) return json(long);
      return json(long);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderTrade();
    expect((await screen.findAllByRole("link", { name: "VCB" })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByText("No positions. Fill a buy at last price.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/api/paper/reset") && call[1]?.method === "POST")).toBe(true);
  });

  it("narrows fills by range, symbol, and win or lose", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        urls.push(String(input));
        return json({ ...empty, fills: long.fills });
      }),
    );
    renderTrade();
    await screen.findByText("Fills");
    fireEvent.click(screen.getByRole("button", { name: "Win" }));
    await waitFor(() => expect(urls.some((url) => url.includes("result=win"))).toBe(true));
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "vhm" } });
    await waitFor(() => expect(urls.some((url) => url.includes("ticker=VHM"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    const from = addCivilDays(ictYmd(), -6);
    const to = ictYmd();
    await waitFor(() => expect(urls.some((url) => url.includes(`from=${from}`) && url.includes(`to=${to}`))).toBe(true));
  });
});
