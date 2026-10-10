import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATTERN_GUIDE } from "../patterns/catalog";
import { Patterns } from "./Patterns";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/patterns"]}>
      <Routes>
        <Route path="/patterns" element={<Patterns />} />
        <Route path="/scans" element={<h1>Scans result</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function names() {
  return screen.getAllByRole("article").map((row) => row.getAttribute("aria-label"));
}

describe("Patterns catalog", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("filters name and description, and an empty query shows the full list", () => {
    renderPage();
    expect(names()).toHaveLength(PATTERN_GUIDE.length);
    expect(names()[0]).toBe("Double bottom");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search patterns" }), { target: { value: "flag" } });
    expect(names()).toEqual(["Bull flag", "Bear flag"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search patterns" }), { target: { value: "small dip" } });
    expect(names()).toEqual(["Cup and handle"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search patterns" }), { target: { value: "   " } });
    expect(names()).toHaveLength(PATTERN_GUIDE.length);
    expect(screen.queryByText("No patterns match")).not.toBeInTheDocument();
  });

  it("pins a favorite to the top and keeps that order after reload", () => {
    const first = renderPage();
    expect(names()[0]).toBe("Double bottom");
    fireEvent.click(screen.getByRole("button", { name: "Favorite Cup and handle" }));
    expect(names()[0]).toBe("Cup and handle");
    expect(names()[1]).toBe("Double bottom");
    expect(screen.getByRole("button", { name: "Favorited Cup and handle" })).toHaveAttribute("aria-pressed", "true");
    first.unmount();

    renderPage();
    expect(names()[0]).toBe("Cup and handle");
    expect(names()[1]).toBe("Double bottom");
  });

  it("enables Scan for every pattern in the catalog", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    expect(PATTERN_GUIDE.length).toBeGreaterThanOrEqual(20);
    for (const pattern of PATTERN_GUIDE) {
      expect(pattern.scan, pattern.id).toBe(true);
      const button = screen.getByRole("button", { name: `Scan ${pattern.name}` });
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent("Scan");
      expect(screen.getByRole("article", { name: pattern.name }).querySelector(".pattern-scan-note")).toBeNull();
    }
  });

  it("starts one market scan for double bottom and opens the Scans result", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      expect(String(input)).toBe("/api/named-scans");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ patterns: ["double_bottom"], scope: "all", tickers: [] });
      return Promise.resolve({
        ok: true,
        json: async () => ({ as_of: "2026-09-28", patterns: ["double_bottom"], scope: "all", tickers: [], hits: [] }),
      } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Scan Double bottom" }));
    expect(await screen.findByRole("heading", { name: "Scans result" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
