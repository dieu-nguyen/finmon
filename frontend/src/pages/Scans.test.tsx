import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PATTERN_GUIDE } from "../patterns/catalog";
import { Scans } from "./Scans";

const catalog = [
  { id: "double_bottom", label: "Double bottom" },
  { id: "double_top", label: "Double top" },
  { id: "head_and_shoulders", label: "Head and shoulders" },
  { id: "inverse_head_and_shoulders", label: "Inverse head and shoulders" },
];

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

describe("Scans named patterns", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the stored market run without scanning, then scans the selected patterns", async () => {
    const stored = {
      as_of: "2026-09-28",
      patterns: ["double_bottom"],
      scope: "all",
      tickers: [],
      hits: [
        {
          ticker: "VHM",
          name: "Vinhomes",
          score: 1,
          window_start: "2026-09-20",
          window_end: "2026-09-28",
          state: "forming",
          pattern: "double_bottom",
          swings: { points: [{ role: "low", date: "2026-09-20", price: 90 }], neckline: [] },
        },
      ],
    };
    const posts: unknown[] = [];
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (url.endsWith("/api/named-scans") && method === "POST") {
          posts.push(JSON.parse(String(init?.body)));
          return json({ ...stored, patterns: ["double_top"], hits: [] });
        }
        if (url.endsWith("/api/named-scans")) return json(stored);
        if (url.endsWith("/api/patterns")) return json([]);
        if (url.includes("/api/symbols?")) {
          return json({
            items: [{ ticker: "VHM", name: "Vinhomes", board: "HOSE", type: "stock", listed: true, last: 1, change: 0, volume: 1, watchlist: false }],
            total: 1,
            limit: 50,
            offset: 0,
          });
        }
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "VHM" })).toHaveAttribute("href", "/symbol/VHM?pattern=double_bottom");
    expect(screen.getByText("Forming")).toBeInTheDocument();
    expect(screen.getAllByText("Double bottom").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/All tickers/).length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.url.includes("/named-scans")).every((call) => call.method === "GET")).toBe(true);
    expect(screen.queryByRole("link", { name: "Compare" })).not.toBeInTheDocument();

    const named = within(screen.getByRole("region", { name: "Named pattern scan" }));
    const lookalike = within(screen.getByRole("region", { name: "Look-alike" }));
    expect(lookalike.queryByRole("combobox", { name: "Patterns" })).not.toBeInTheDocument();
    expect(lookalike.queryByRole("combobox", { name: "Ticker scope" })).not.toBeInTheDocument();
    expect(lookalike.getByRole("button", { name: "Scan" })).toBeDisabled();

    fireEvent.click(named.getByRole("button", { name: "Remove Double bottom" }));
    expect(named.getByRole("button", { name: "Scan" })).toBeDisabled();
    fireEvent.click(named.getByRole("combobox", { name: "Patterns" }));
    fireEvent.click(named.getByRole("option", { name: "Double top" }));
    fireEvent.change(named.getByRole("combobox", { name: "Ticker scope" }), { target: { value: "subset" } });
    expect(named.getByRole("button", { name: "Scan" })).toBeDisabled();

    fireEvent.click(screen.getByRole("combobox", { name: "Tickers" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Tickers" }), { target: { value: "VH" } });
    fireEvent.click(await screen.findByRole("option", { name: /VHM/ }));
    expect(named.getByRole("button", { name: "Scan" })).toBeEnabled();
    fireEvent.click(named.getByRole("button", { name: "Scan" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ patterns: ["double_top"], scope: "subset", tickers: ["VHM"] });
  });

  it("lists every catalog pattern, keeps an unscannable pattern visible, and clears back to the full menu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (url.endsWith("/api/named-scans")) return json({ as_of: null, patterns: [], scope: "all", tickers: [], hits: [] });
        if (url.endsWith("/api/patterns")) return json([]);
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    const named = within(await screen.findByRole("region", { name: "Named pattern scan" }));
    fireEvent.click(named.getByRole("combobox", { name: "Patterns" }));
    const menu = () => screen.getByRole("listbox", { name: "Patterns" });

    const optionIds = within(menu()).getAllByRole("option").map((option) => option.id);
    for (const pattern of PATTERN_GUIDE) {
      expect(optionIds.some((id) => id.endsWith(`-${pattern.id}`))).toBe(true);
    }

    const blocked = within(menu()).getByRole("option", { name: /Bull flag/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).toHaveTextContent("Not available yet");
    fireEvent.click(blocked);
    expect(blocked).toHaveAttribute("aria-selected", "false");
    fireEvent.keyDown(named.getByRole("combobox", { name: "Patterns" }), { key: "Enter" });
    expect(blocked).toHaveAttribute("aria-selected", "false");

    const box = named.getByRole("combobox", { name: "Patterns" });
    fireEvent.change(box, { target: { value: "flag" } });
    expect(within(menu()).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Bull flagNot available yet",
      "Bear flagNot available yet",
    ]);
    fireEvent.change(box, { target: { value: "   " } });
    expect(within(menu()).getAllByRole("option")).toHaveLength(PATTERN_GUIDE.length);

    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(within(menu()).getByRole("option", { name: "Double top" })).toHaveAttribute("aria-selected", "true");
  });
});
