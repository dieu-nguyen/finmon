import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scans } from "./Scans";

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

  it("saves a named pattern without a reference and lists forming hits", async () => {
    const saved = {
      id: 7,
      name: "Bottoms",
      kind: "named",
      schedule: "daily",
      enabled: true,
      spec: { pattern: "double_bottom" },
    };
    const hits = {
      pattern_id: 7,
      name: "Bottoms",
      kind: "named",
      pattern: "double_bottom",
      reference: "",
      as_of: "2026-09-28",
      reference_compared: true,
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
    let patterns = [saved];
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/patterns") && init?.method === "POST") {
          posts.push(JSON.parse(String(init.body)));
          return json(saved);
        }
        if (url.endsWith("/api/patterns")) return json(patterns);
        if (url.endsWith("/hits")) return json(hits);
        return json({ items: [] });
      }),
    );

    render(
      <MemoryRouter>
        <Scans />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "VHM" })).toHaveAttribute("href", "/symbol/VHM?pattern=7");
    expect(screen.getByText("Forming")).toBeInTheDocument();
    expect(screen.getAllByText("Double bottom").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Reference$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Compare" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Kind" }), { target: { value: "named" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Tops" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Pattern" }), { target: { value: "double_top" } });
    expect(screen.queryByRole("textbox", { name: "Reference" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ name: "Tops", kind: "named", pattern: "double_top", enabled: true });
    expect(posts[0]).not.toHaveProperty("reference");
  });
});
