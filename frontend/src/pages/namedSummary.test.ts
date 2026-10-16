import { describe, expect, it } from "vitest";
import { summarizeNamedHits } from "./namedSummary";

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
});
