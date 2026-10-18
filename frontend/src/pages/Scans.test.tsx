import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PATTERN_GUIDE } from "../patterns/catalog";

vi.mock("echarts-for-react", () => ({
  default: ({
    option,
  }: {
    option: {
      backgroundColor?: string;
      legend?: { data?: string[] };
      xAxis?: { data?: string[] };
      series?: { name?: string; data?: number[]; itemStyle?: { color?: string } }[];
    };
  }) => (
    <div
      data-testid="named-summary-chart"
      data-background={option.backgroundColor ?? ""}
      data-legend={JSON.stringify(option.legend?.data ?? [])}
      data-categories={JSON.stringify(option.xAxis?.data ?? [])}
      data-series={JSON.stringify(
        (option.series ?? []).map((item) => ({ name: item.name, data: item.data, color: item.itemStyle?.color })),
      )}
    />
  ),
}));

const IMPLEMENTED = [
  "double_bottom",
  "double_top",
  "head_and_shoulders",
  "inverse_head_and_shoulders",
  "triple_top",
  "triple_bottom",
  "bull_flag",
  "bear_flag",
  "bull_pennant",
  "bear_pennant",
  "ascending_triangle",
  "descending_triangle",
  "symmetrical_triangle",
  "cup_and_handle",
  "rectangle",
  "rounding_bottom",
  "rounding_top",
  "falling_wedge",
  "rising_wedge",
  "broadening",
  "ascending_channel",
  "descending_channel",
] as const;
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

function namedScanPath(url: string): boolean {
  return (url.split("?")[0] ?? url).endsWith("/api/named-scans");
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
          run_id: 7,
          scanned_at: "2026-10-17T07:05:00",
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
        if (namedScanPath(url) && method === "POST") {
          posts.push(JSON.parse(String(init?.body)));
          return json({ ...stored, patterns: ["double_top"], hits: [] });
        }
        if (namedScanPath(url)) return json(stored);
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
    const chart = screen.getByRole("link", { name: "Chart" });
    expect(chart).toHaveAttribute("href", "/symbol/VHM?pattern=double_bottom");
    expect(chart).toHaveAttribute("target", "_blank");
    expect(chart).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByText("Forming").length).toBeGreaterThan(0);
    const named = within(screen.getByRole("region", { name: "Named patterns" }));
    const summary = within(named.getByRole("region", { name: "Named pattern summary" }));
    expect(named.queryByRole("heading", { name: "Matches" })).not.toBeInTheDocument();
    expect(named.getByRole("region", { name: "Named pattern summary" }).compareDocumentPosition(named.getByRole("button", { name: "Scan" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(named.getByRole("button", { name: "Scan" }).compareDocumentPosition(named.getByRole("table", { name: "Named matches" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary.getByTestId("named-summary-chart")).toHaveAttribute("data-background", "#0e1116");
    expect(summary.getByTestId("named-summary-chart")).toHaveAttribute("data-legend", JSON.stringify(["Forming", "Confirmed"]));
    expect(summary.getByTestId("named-summary-chart")).toHaveAttribute(
      "data-series",
      JSON.stringify([
        { name: "Forming", data: [1], color: "#6ea8fe" },
        { name: "Confirmed", data: [0], color: "#3dd68c" },
      ]),
    );
    expect(summary.getByRole("columnheader", { name: "Pattern" })).toBeInTheDocument();
    expect(summary.getByRole("columnheader", { name: "Confirmed" })).toBeInTheDocument();
    expect(summary.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    const summaryRow = summary.getByRole("row", { name: /Double bottom/ });
    expect(within(summaryRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Double bottom", "1", "0", "1"]);
    expect(screen.getByRole("columnheader", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Scanned" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("17 Oct 2026, 14:05")).toBeInTheDocument();
    expect(screen.getAllByText("Double bottom").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/All tickers/).length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.url.includes("/named-scans")).every((call) => call.method === "GET")).toBe(true);
    expect(screen.queryByRole("link", { name: "Compare" })).not.toBeInTheDocument();

    const lookalike = within(screen.getByRole("region", { name: (value) => value === "Look-alike" }));
    const lookSummary = within(lookalike.getByRole("region", { name: "Look-alike summary" }));
    expect(screen.getByRole("region", { name: "Named patterns" }).compareDocumentPosition(screen.getByRole("region", { name: (value) => value === "Look-alike" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lookalike.getByRole("heading", { name: "Look-alike" })).toBeInTheDocument();
    expect(lookSummary.getByText("No look-alike result")).toBeInTheDocument();
    expect(lookSummary.queryByText("Forming")).not.toBeInTheDocument();
    expect(lookalike.getByRole("region", { name: "Look-alike summary" }).compareDocumentPosition(lookalike.getByRole("button", { name: "Scan" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lookalike.getByRole("button", { name: "Scan" }).compareDocumentPosition(lookalike.getByRole("button", { name: "Search" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lookalike.queryByRole("combobox", { name: "Patterns" })).not.toBeInTheDocument();
    expect(lookalike.queryByRole("combobox", { name: "Ticker scope" })).not.toBeInTheDocument();
    expect(lookalike.getByRole("button", { name: "Scan" })).toBeDisabled();

    fireEvent.click(named.getByRole("button", { name: "Remove Double bottom" }));
    expect(named.getByRole("button", { name: "Scan" })).toBeDisabled();
    fireEvent.click(named.getByRole("combobox", { name: "Patterns" }));
    fireEvent.click(within(named.getByRole("listbox", { name: "Patterns" })).getByRole("option", { name: "Double top" }));
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

  it("does not show named empty copy while the scan request is in flight", async () => {
    let resolveNamed: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveNamed = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (namedScanPath(url)) return pending;
        if (url.endsWith("/api/patterns")) return json([]);
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    expect(screen.queryByText("No named pattern matches")).not.toBeInTheDocument();
    expect(screen.queryByText("No named pattern scan yet")).not.toBeInTheDocument();
    expect(await screen.findAllByText("Loading")).not.toHaveLength(0);

    resolveNamed({
      ok: true,
      json: async () => ({ as_of: null, patterns: [], scope: "all", tickers: [], hits: [] }),
    } as Response);

    expect(await screen.findByText("No named pattern matches")).toBeInTheDocument();
    expect(screen.getByText("No named pattern scan yet")).toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  });

  it("lists all 22 patterns as selectable and clears back to the full menu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (namedScanPath(url)) return json({ as_of: null, patterns: [], scope: "all", tickers: [], hits: [] });
        if (url.endsWith("/api/patterns")) return json([]);
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    const named = within(await screen.findByRole("region", { name: "Named patterns" }));
    const summary = within(screen.getByRole("region", { name: "Named pattern summary" }));
    expect(await summary.findByText("No named pattern matches")).toBeInTheDocument();
    expect(summary.queryByTestId("named-summary-chart")).not.toBeInTheDocument();
    expect(summary.queryByRole("columnheader", { name: "Pattern" })).not.toBeInTheDocument();
    fireEvent.click(named.getByRole("combobox", { name: "Patterns" }));
    const menu = () => screen.getByRole("listbox", { name: "Patterns" });

    const options = () => within(menu()).getAllByRole("option");
    const optionIds = options().map((option) => option.id);
    expect(PATTERN_GUIDE.map((pattern) => pattern.id).sort()).toEqual([...IMPLEMENTED].sort());
    expect(options()).toHaveLength(IMPLEMENTED.length);
    for (const id of IMPLEMENTED) {
      const option = options().find((row) => row.id.endsWith(`-${id}`));
      expect(optionIds.some((optionId) => optionId.endsWith(`-${id}`))).toBe(true);
      expect(option).toBeTruthy();
      expect(option).not.toHaveAttribute("aria-disabled");
      expect(option).not.toHaveTextContent("Not available yet");
    }

    const flag = within(menu()).getByRole("option", { name: "Bull flag" });
    fireEvent.click(flag);
    expect(flag).toHaveAttribute("aria-selected", "true");

    const box = named.getByRole("combobox", { name: "Patterns" });
    fireEvent.change(box, { target: { value: "flag" } });
    expect(within(menu()).getAllByRole("option").map((option) => option.textContent)).toEqual(["Bull flag", "Bear flag"]);
    fireEvent.change(box, { target: { value: "   " } });
    expect(within(menu()).getAllByRole("option")).toHaveLength(IMPLEMENTED.length);

    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(within(menu()).getByRole("option", { name: "Double top" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps summary counts when the match filter changes", async () => {
    const hits = [
      {
        ticker: "VHM",
        name: "Vinhomes",
        score: 0.9,
        window_start: "2026-09-20",
        window_end: "2026-09-28",
        state: "forming",
        pattern: "double_bottom",
        run_id: 8,
      },
      {
        ticker: "VNM",
        name: "Vinamilk",
        score: 0.8,
        window_start: "2026-09-20",
        window_end: "2026-09-28",
        state: "confirmed",
        pattern: "double_top",
        run_id: 4,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (namedScanPath(url)) return json({ as_of: "2026-09-28", patterns: ["double_bottom", "double_top"], scope: "all", tickers: [], hits });
        if (url.endsWith("/api/patterns")) return json([]);
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    const summary = within(await screen.findByRole("region", { name: "Named pattern summary" }));
    const matches = within(screen.getByRole("region", { name: "Named patterns" }));
    const chartSeries = () => summary.getByTestId("named-summary-chart").getAttribute("data-series");
    const before = chartSeries();
    expect(summary.getByTestId("named-summary-chart")).toHaveAttribute(
      "data-categories",
      JSON.stringify(["Double bottom", "Double top"]),
    );
    expect(before).toBe(
      JSON.stringify([
        { name: "Forming", data: [1, 0], color: "#6ea8fe" },
        { name: "Confirmed", data: [0, 1], color: "#3dd68c" },
      ]),
    );
    expect(matches.getByRole("link", { name: "VHM" })).toBeInTheDocument();
    expect(matches.getByRole("link", { name: "VNM" })).toBeInTheDocument();

    fireEvent.change(matches.getByRole("textbox", { name: "Ticker" }), { target: { value: "VNM" } });
    expect(matches.getByRole("link", { name: "VHM" })).toBeInTheDocument();
    expect(chartSeries()).toBe(before);

    fireEvent.click(matches.getByRole("button", { name: "Search" }));
    expect(matches.queryByRole("link", { name: "VHM" })).not.toBeInTheDocument();
    expect(matches.getByRole("link", { name: "VNM" })).toHaveAttribute("href", "/symbol/VNM?pattern=double_top");
    expect(chartSeries()).toBe(before);
    expect(within(summary.getByRole("row", { name: /Double bottom/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Double bottom",
      "1",
      "0",
      "1",
    ]);
    expect(within(summary.getByRole("row", { name: /Double top/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Double top",
      "0",
      "1",
      "1",
    ]);
  });

  it("changes the named chart when Right edge changes and leaves it when only State changes", async () => {
    const summaryHits = [
      {
        ticker: "VHM",
        name: "Vinhomes",
        score: 0.9,
        window_start: "2026-09-20",
        window_end: "2026-09-28",
        state: "forming",
        pattern: "double_bottom",
        run_id: 8,
      },
      {
        ticker: "VNM",
        name: "Vinamilk",
        score: 0.8,
        window_start: "2026-09-20",
        window_end: "2026-09-28",
        state: "confirmed",
        pattern: "double_top",
        run_id: 8,
      },
      {
        ticker: "OLD",
        name: "Aged",
        score: 0.7,
        window_start: "2026-09-01",
        window_end: "2026-09-28",
        state: "forming",
        pattern: "double_bottom",
        run_id: 8,
      },
      {
        ticker: "LATE",
        name: "Later",
        score: 0.75,
        window_start: "2026-09-01",
        window_end: "2026-09-28",
        state: "confirmed",
        pattern: "double_top",
        run_id: 6,
      },
    ];
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (namedScanPath(url)) {
          const params = new URLSearchParams(url.split("?")[1] ?? "");
          if (!params.has("right_edge")) {
            return json({ as_of: "2026-09-28", patterns: ["double_bottom", "double_top"], scope: "all", tickers: [], hits: summaryHits });
          }
          const edge = params.get("right_edge");
          const state = params.get("state") ?? "all";
          let hits = summaryHits.filter((hit) => hit.ticker !== "OLD" && hit.ticker !== "LATE");
          if (edge === "20") hits = summaryHits.filter((hit) => hit.ticker !== "OLD");
          if (state === "confirmed") hits = hits.filter((hit) => hit.state === "confirmed");
          return json({ as_of: "2026-09-28", patterns: ["double_bottom", "double_top"], scope: "all", tickers: [], hits });
        }
        if (url.endsWith("/api/patterns")) return json([]);
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    const summary = within(await screen.findByRole("region", { name: "Named pattern summary" }));
    const matches = within(screen.getByRole("region", { name: "Named patterns" }));
    const chartSeries = () => summary.getByTestId("named-summary-chart").getAttribute("data-series");
    expect(await matches.findByRole("link", { name: "VHM" })).toBeInTheDocument();
    expect(matches.getByRole("link", { name: "VNM" })).toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "OLD" })).not.toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "LATE" })).not.toBeInTheDocument();
    expect(matches.getByRole("combobox", { name: "State" })).toHaveValue("all");
    expect(matches.getByRole("spinbutton", { name: "Right edge" })).toHaveValue(10);
    expect(summary.queryByRole("combobox", { name: "State" })).not.toBeInTheDocument();
    expect(summary.queryByRole("spinbutton", { name: "Right edge" })).not.toBeInTheDocument();
    const lookalike = within(screen.getByRole("region", { name: (value) => value === "Look-alike" }));
    expect(lookalike.queryByRole("combobox", { name: "State" })).not.toBeInTheDocument();
    expect(lookalike.getByRole("spinbutton", { name: "Right edge" })).toHaveValue(10);
    const chartCalls = () => calls.filter((url) => namedScanPath(url) && url.includes("right_edge=") && !url.includes("state="));
    const before = chartSeries();
    expect(before).toBe(
      JSON.stringify([
        { name: "Forming", data: [1, 0], color: "#6ea8fe" },
        { name: "Confirmed", data: [0, 1], color: "#3dd68c" },
      ]),
    );
    expect(chartCalls().some((url) => url.includes("right_edge=10"))).toBe(true);
    const chartCallsBeforeState = chartCalls().length;

    fireEvent.change(matches.getByRole("combobox", { name: "State" }), { target: { value: "confirmed" } });
    expect(matches.getByRole("link", { name: "VHM" })).toBeInTheDocument();
    expect(chartSeries()).toBe(before);

    fireEvent.click(matches.getByRole("button", { name: "Search" }));
    expect(await matches.findByRole("link", { name: "VNM" })).toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "VHM" })).not.toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "OLD" })).not.toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "LATE" })).not.toBeInTheDocument();
    expect(calls.some((url) => url.includes("state=confirmed") && url.includes("right_edge=10"))).toBe(true);
    expect(chartCalls()).toHaveLength(chartCallsBeforeState);
    expect(chartSeries()).toBe(before);
    expect(within(summary.getByRole("row", { name: /Double bottom/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Double bottom",
      "1",
      "0",
      "1",
    ]);

    fireEvent.change(matches.getByRole("spinbutton", { name: "Right edge" }), { target: { value: "20" } });
    expect(chartSeries()).toBe(before);
    fireEvent.click(matches.getByRole("button", { name: "Search" }));
    expect(await matches.findByRole("link", { name: "LATE" })).toBeInTheDocument();
    expect(matches.getByRole("link", { name: "VNM" })).toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "VHM" })).not.toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "OLD" })).not.toBeInTheDocument();
    expect(calls.some((url) => url.includes("state=confirmed") && url.includes("right_edge=20"))).toBe(true);
    expect(chartCalls().some((url) => url.includes("right_edge=20"))).toBe(true);
    await waitFor(() =>
      expect(chartSeries()).toBe(
        JSON.stringify([
          { name: "Forming", data: [1, 0], color: "#6ea8fe" },
          { name: "Confirmed", data: [0, 2], color: "#3dd68c" },
        ]),
      ),
    );
    expect(within(summary.getByRole("row", { name: /Double top/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Double top",
      "0",
      "2",
      "2",
    ]);
  });

  it("pages every current match at 20, newest run first", async () => {
    const hits = [
      {
        ticker: "AAA",
        name: "Old",
        score: 1,
        window_start: "2026-09-20",
        window_end: "2026-09-28",
        state: "confirmed",
        pattern: "double_top",
        run_id: 2,
      },
      {
        ticker: "MMM",
        name: "Mid",
        score: 0.8,
        window_start: "2026-09-20",
        window_end: "2026-09-28",
        state: "forming",
        pattern: "double_bottom",
        run_id: 10,
      },
    ];
    for (let i = 18; i >= 0; i -= 1) {
      hits.push({
        ticker: `T${String(i).padStart(2, "0")}`,
        name: "Name",
        score: 0.9,
        window_start: "2026-09-20",
        window_end: "2026-09-28",
        state: "forming",
        pattern: "double_bottom",
        run_id: 10,
      });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (namedScanPath(url)) return json({ as_of: "2026-09-28", patterns: ["double_bottom"], scope: "all", tickers: [], hits });
        if (url.endsWith("/api/patterns")) return json([]);
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    const matches = within(await screen.findByRole("region", { name: "Named patterns" }));
    const tickers = () =>
      within(matches.getByRole("table", { name: "Named matches" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("link")[0]?.textContent);
    expect(tickers()).toEqual([...Array.from({ length: 19 }, (_, i) => `T${String(i).padStart(2, "0")}`), "MMM"]);
    expect(within(matches.getByRole("row", { name: /T00/ })).getByText("10")).toBeInTheDocument();
    expect(matches.queryByRole("link", { name: "AAA" })).not.toBeInTheDocument();
    expect(matches.getByRole("button", { name: "Next" })).toBeEnabled();

    fireEvent.click(matches.getByRole("button", { name: "Next" }));
    expect(tickers()).toEqual(["AAA"]);
    expect(within(matches.getByRole("row", { name: /AAA/ })).getByText("2")).toBeInTheDocument();
    expect(matches.getByRole("link", { name: "AAA" })).toHaveAttribute("href", "/symbol/AAA?pattern=double_top");

    fireEvent.click(matches.getByRole("button", { name: "Search" }));
    expect(tickers()[0]).toBe("T00");
    expect(matches.queryByRole("link", { name: "AAA" })).not.toBeInTheDocument();
  });

  it("charts the full look-alike list and pages the hits at 20", async () => {
    const hits = Array.from({ length: 21 }, (_, index) => ({
      ticker: `L${String(index).padStart(2, "0")}`,
      name: "Name",
      score: 0.8 + index / 1000,
      window_start: "2026-09-20",
      window_end: "2026-09-28",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/pattern-catalog")) return json(catalog);
        if (namedScanPath(url)) return json({ as_of: null, patterns: [], scope: "all", tickers: [], hits: [] });
        if (url.endsWith("/api/patterns")) {
          return json([
            {
              id: 3,
              name: "Like VCB",
              kind: "lookalike",
              schedule: "daily",
              enabled: true,
              spec: { reference: "VCB", min_score: 0.85, top_k: 20 },
            },
          ]);
        }
        if (url.includes("/api/patterns/3/hits")) {
          const edge = new URLSearchParams(url.split("?")[1] ?? "").get("right_edge");
          const visible =
            edge === "20"
              ? [{ ticker: "OLD", name: "Older", score: 0.99, window_start: "2026-08-01", window_end: "2026-08-01" }, ...hits]
              : hits;
          return json({
            pattern_id: 3,
            name: "Like VCB",
            kind: "lookalike",
            reference: "VCB",
            as_of: "2026-09-28",
            reference_compared: true,
            hits: visible,
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

    const section = within(await screen.findByRole("region", { name: (value) => value === "Look-alike" }));
    const summary = within(section.getByRole("region", { name: "Look-alike summary" }));
    expect(await summary.findByText(/symbols matched/)).toBeInTheDocument();
    expect(section.getByRole("region", { name: "Look-alike summary" }).compareDocumentPosition(section.getByRole("button", { name: "Scan" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.getByRole("spinbutton", { name: "Right edge" })).toHaveValue(10);
    expect(section.queryByRole("combobox", { name: "State" })).not.toBeInTheDocument();
    expect(summary.getByText("21")).toBeInTheDocument();
    expect(summary.getByText(/symbols matched/)).toBeInTheDocument();
    expect(summary.queryByText("Forming")).not.toBeInTheDocument();
    expect(summary.queryByText("Confirmed")).not.toBeInTheDocument();
    const chart = summary.getByTestId("named-summary-chart");
    expect(chart).toHaveAttribute("data-legend", JSON.stringify(["Score"]));
    expect(JSON.parse(chart.getAttribute("data-categories") ?? "[]")).toHaveLength(8);
    expect(JSON.parse(chart.getAttribute("data-categories") ?? "[]")[0]).toBe("L20");
    expect(section.getByRole("button", { name: "Scan" }).compareDocumentPosition(section.getByRole("table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.queryByRole("combobox", { name: "Patterns" })).not.toBeInTheDocument();

    const tickers = () =>
      within(section.getByRole("table"))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("link")[0]?.textContent);
    expect(tickers()).toHaveLength(20);
    expect(tickers()[0]).toBe("L20");
    expect(section.queryByRole("link", { name: "L00" })).not.toBeInTheDocument();

    fireEvent.change(section.getByRole("textbox", { name: "Look-alike ticker" }), { target: { value: "L00" } });
    expect(tickers()[0]).toBe("L20");
    expect(JSON.parse(chart.getAttribute("data-categories") ?? "[]")).toHaveLength(8);

    fireEvent.click(section.getByRole("button", { name: "Search" }));
    expect(tickers()).toEqual(["L00"]);
    expect(section.getByRole("link", { name: "L00" })).toHaveAttribute("href", "/scans/3/compare/L00");
    expect(JSON.parse(summary.getByTestId("named-summary-chart").getAttribute("data-categories") ?? "[]")).toHaveLength(8);

    fireEvent.change(section.getByRole("textbox", { name: "Look-alike ticker" }), { target: { value: "" } });
    fireEvent.click(section.getByRole("button", { name: "Search" }));
    expect(tickers()).toHaveLength(20);
    expect(section.queryByRole("link", { name: "L00" })).not.toBeInTheDocument();
    fireEvent.click(section.getByRole("button", { name: "Next" }));
    expect(tickers()).toEqual(["L00"]);

    fireEvent.change(section.getByRole("spinbutton", { name: "Right edge" }), { target: { value: "20" } });
    expect(summary.getByText("21")).toBeInTheDocument();
    expect(JSON.parse(summary.getByTestId("named-summary-chart").getAttribute("data-categories") ?? "[]")[0]).toBe("L20");
    fireEvent.click(section.getByRole("button", { name: "Search" }));
    expect(await summary.findByText("22")).toBeInTheDocument();
    expect(JSON.parse(summary.getByTestId("named-summary-chart").getAttribute("data-categories") ?? "[]")[0]).toBe("OLD");
    expect(tickers()[0]).toBe("OLD");
  });
});
