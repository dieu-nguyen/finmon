import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scans } from "./Scans";

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

const catalog = [
  { id: "double_bottom", label: "Double bottom" },
  { id: "double_top", label: "Double top" },
];

const saved = {
  id: 3,
  name: "Rise",
  kind: "lookalike",
  schedule: "daily",
  enabled: true,
  spec: { reference: "VCB", min_score: 0.85, top_k: 20 },
};

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
      score: 0.91,
      window_start: "2026-06-01",
      window_end: "2026-09-28",
    },
  ],
};

const vcbRow = {
  ticker: "VCB",
  name: "Vietcombank",
  board: "HOSE",
  type: "stock",
  listed: true,
  last: 1,
  change: 0,
  volume: 1,
  watchlist: false,
};

describe("Scans look-alike", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a saved pattern, scans it, and links Compare", async () => {
    const posts: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (url.endsWith("/api/named-scans")) return json({ as_of: null, patterns: [], scope: "all", tickers: [], hits: [] });
        if (url.endsWith("/api/patterns") && method === "GET") return json([saved]);
        if (url.endsWith("/api/patterns/3/hits")) return json(hits);
        if (url.endsWith("/api/patterns/3/scan") && method === "POST") {
          posts.push({ url, body: null });
          return json(hits);
        }
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    const lookalike = within(await screen.findByRole("region", { name: "Look-alike" }));
    expect(await lookalike.findByRole("button", { name: /Rise/ })).toBeInTheDocument();
    expect(lookalike.getByLabelText("Name")).toHaveValue("Rise");
    expect(lookalike.getByLabelText("Reference")).toHaveValue("VCB");
    expect(lookalike.getByRole("button", { name: "Scan" })).toBeEnabled();
    expect(await screen.findByRole("link", { name: "Compare" })).toHaveAttribute("href", "/scans/3/compare/VHM");
    expect(screen.getByRole("link", { name: "VHM" })).toHaveAttribute("href", "/scans/3/compare/VHM");

    fireEvent.click(lookalike.getByRole("button", { name: "Scan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe("/api/patterns/3/scan");
  });

  it("saves a new pattern and picks a reference from search", async () => {
    const savedBodies: unknown[] = [];
    let patterns: object[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (url.endsWith("/api/named-scans")) return json({ as_of: null, patterns: [], scope: "all", tickers: [], hits: [] });
        if (url.endsWith("/api/patterns") && method === "POST") {
          const body = JSON.parse(String(init?.body));
          savedBodies.push(body);
          const row = { id: 9, name: body.name, kind: "lookalike", schedule: "daily", enabled: body.enabled, spec: { reference: body.reference, min_score: body.min_score, top_k: body.top_k } };
          patterns = [row];
          return json(row);
        }
        if (url.endsWith("/api/patterns")) return json(patterns);
        if (url.includes("/api/symbols?") && url.includes("q=VC")) {
          return json({ items: [vcbRow], total: 1, limit: 50, offset: 0 });
        }
        if (url.includes("/api/patterns/9/hits")) return json({ ...hits, pattern_id: 9, hits: [] });
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    const lookalike = within(await screen.findByRole("region", { name: "Look-alike" }));
    expect(await lookalike.findByText("No patterns yet")).toBeInTheDocument();
    expect(lookalike.getByRole("button", { name: "Scan" })).toBeDisabled();

    fireEvent.change(lookalike.getByLabelText("Name"), { target: { value: "Like VCB" } });
    fireEvent.change(lookalike.getByLabelText("Reference"), { target: { value: "VC" } });
    fireEvent.click(await screen.findByRole("button", { name: /VCB/ }));
    expect(lookalike.getByLabelText("Reference")).toHaveValue("VCB");
    fireEvent.click(lookalike.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(savedBodies).toHaveLength(1));
    expect(savedBodies[0]).toEqual({
      name: "Like VCB",
      kind: "lookalike",
      reference: "VCB",
      min_score: 0.85,
      top_k: 20,
      enabled: true,
    });
    expect(await lookalike.findByRole("button", { name: /Like VCB/ })).toBeInTheDocument();
    expect(lookalike.getByRole("button", { name: "Scan" })).toBeEnabled();
  });
});
