import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Market } from "./Market";

function page(items: object[], total = items.length, offset = 0) {
  return { items, total, limit: 50, offset };
}

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

const etf = {
  ticker: "E1VFVN30",
  name: "VN30 ETF",
  board: "HOSE",
  type: "etf",
  listed: true,
  last: null,
  change: null,
  volume: null,
  watchlist: false,
};

const stock = {
  ticker: "VCB",
  name: "Vietcombank",
  board: "HOSE",
  type: "stock",
  listed: true,
  last: 91000,
  change: 1.2,
  volume: 1000,
  watchlist: false,
};

function renderMarket() {
  return render(
    <MemoryRouter initialEntries={["/market"]}>
      <Routes>
        <Route path="/market" element={<Market />} />
        <Route path="/symbol/:ticker" element={<SymbolStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

function SymbolStub() {
  const { ticker } = useParams();
  return <div>chart {ticker}</div>;
}

describe("Market list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("widens to all types when the stock board has no match", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("q=E1VFVN30") && url.includes("type=stock")) return json(page([]));
        if (url.includes("type=all") && url.includes("q=E1VFVN30")) return json(page([etf]));
        return json(page([]));
      }),
    );
    renderMarket();
    fireEvent.click(screen.getByRole("button", { name: "HNX" }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "E1VFVN30" } });
    expect(await screen.findByText("E1VFVN30")).toBeInTheDocument();
    expect(screen.getByText("These matches are outside the current filter.")).toBeInTheDocument();
    expect(screen.getByText(/· ETF/)).toBeInTheDocument();
    const searched = urls.filter((url) => url.includes("q=E1VFVN30"));
    expect(searched[0]).toContain("type=stock");
    expect(searched[0]).toContain("board=HNX");
    expect(searched[1]).toContain("type=all");
    expect(searched[1]).not.toContain("board=");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("switches to funds, hides boards, and pages the stock list", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("type=etf")) return json(page([etf]));
        const offset = new URL(url, "http://local").searchParams.get("offset");
        if (offset === "50") return json(page([stock], 60, 50));
        return json(page([stock], 60, 0));
      }),
    );
    renderMarket();
    expect(await screen.findByText("VCB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HOSE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByText("1–1 of 60")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(urls.some((url) => url.includes("offset=50"))).toBe(true));
    expect(await screen.findByText("51–51 of 60")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Funds" }));
    expect(await screen.findByText("E1VFVN30")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "HOSE" })).not.toBeInTheDocument();
    expect(urls.some((url) => url.includes("type=etf"))).toBe(true);
  });

  it("pins and unpins without opening the chart, then opens a row", async () => {
    let pinned = false;
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.includes("/watchlist/VCB") && method === "POST") {
          methods.push("POST");
          pinned = true;
          return json({ ...stock, watchlist: true });
        }
        if (url.includes("/watchlist/VCB") && method === "DELETE") {
          methods.push("DELETE");
          pinned = false;
          return json({ status: "ok" });
        }
        return json(page([{ ...stock, watchlist: pinned }]));
      }),
    );
    renderMarket();
    expect(await screen.findByText("VCB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    expect(await screen.findByRole("button", { name: "Unpin" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("chart VCB")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
    expect(await screen.findByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
    expect(methods).toEqual(["POST", "DELETE"]);

    fireEvent.click(screen.getByText("Vietcombank"));
    expect(await screen.findByText("chart VCB")).toBeInTheDocument();
  });

  it("filters the watchlist and retries after a load error", async () => {
    const urls: string[] = [];
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (fail) {
          fail = false;
          return json({}, false);
        }
        return json(page([stock]));
      }),
    );
    renderMarket();
    expect(await screen.findByText("Load error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("VCB")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(urls.some((url) => url.includes("watchlist=true"))).toBe(true));
  });
});
