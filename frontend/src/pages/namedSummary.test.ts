import { describe, expect, it } from "vitest";
import { filterLookalikeHits, filterNamedHits, orderNamedHits, summarizeLookalikeHits, summarizeNamedHits } from "./namedSummary";

describe("summarizeNamedHits", () => {
  it("counts each pattern once per symbol and splits forming from confirmed", () => {
    const rows = summarizeNamedHits([
      { ticker: "VHM", pattern: "double_bottom", state: "forming" },
      { ticker: "VHM", pattern: "head_and_shoulders", state: "confirmed" },
      { ticker: "VNM", pattern: "double_bottom", state: "confirmed" },
      { ticker: "VHM", pattern: "double_bottom", state: "confirmed" },
    ]);

    expect(rows).toEqual([
      { id: "double_bottom", name: "Double bottom", forming: 1, confirmed: 1, total: 2 },
      { id: "head_and_shoulders", name: "Head and shoulders", forming: 0, confirmed: 1, total: 1 },
    ]);
  });

  it("returns nothing when there are no visible hits", () => {
    expect(summarizeNamedHits([])).toEqual([]);
  });

  it("orders by run id, then score, then ticker", () => {
    expect(
      orderNamedHits([
        { ticker: "AAA", score: 1, pattern: "double_top", run_id: 2 },
        { ticker: "MMM", score: 0.8, pattern: "double_bottom", run_id: 10 },
        { ticker: "T01", score: 0.9, pattern: "double_bottom", run_id: 10 },
        { ticker: "T00", score: 0.9, pattern: "double_bottom", run_id: 10 },
      ]).map((hit) => hit.ticker),
    ).toEqual(["T00", "T01", "MMM", "AAA"]);
  });

  it("keeps every hit when the match filter is empty", () => {
    const hits = [
      { ticker: "VHM", pattern: "double_bottom" },
      { ticker: "VNM", pattern: "double_top" },
    ];
    expect(filterNamedHits(hits, { pattern: "", ticker: "  " })).toEqual(hits);
    expect(filterNamedHits(hits, { pattern: "double_top", ticker: "vn" }).map((hit) => hit.ticker)).toEqual(["VNM"]);
  });

  it("summarizes the full look-alike list without forming or confirmed", () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({ ticker: `T${index}`, score: 0.8 + index / 100 }));
    const summary = summarizeLookalikeHits(rows);
    expect(summary.count).toBe(9);
    expect(summary.min).toBeCloseTo(0.8);
    expect(summary.max).toBeCloseTo(0.88);
    expect(summary.top).toHaveLength(8);
    expect(summary.top[0]?.ticker).toBe("T8");
    expect(filterLookalikeHits(rows, "  ")).toHaveLength(9);
    expect(filterLookalikeHits(rows, "t1").map((hit) => hit.ticker)).toEqual(["T1"]);
  });
});
