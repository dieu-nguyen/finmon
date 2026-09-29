import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Market } from "./Market";

function page(items: object[], total = items.length) {
  return { items, total, limit: 50, offset: 0 };
}

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

const row = {
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

describe("Market search", () => {
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
        if (url.includes("type=all") && url.includes("q=E1VFVN30")) return json(page([row]));
        return json(page([]));
      }),
    );
    render(
      <MemoryRouter>
        <Market />
      </MemoryRouter>,
    );
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
  });
});
