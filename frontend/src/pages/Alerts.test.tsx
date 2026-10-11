import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alerts } from "./Alerts";

function json(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

const vcb = {
  id: 1,
  ticker: "VCB",
  op: "gte",
  price: 91000,
  mode: "once",
  enabled: true,
  last_fired_at: null,
};

describe("Alerts page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists alerts, creates one, and deletes it", async () => {
    let rows = [vcb];
    const posts: unknown[] = [];
    const deleted: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/alerts") && method === "POST") {
          const body = JSON.parse(String(init?.body));
          posts.push(body);
          const created = { id: 2, ...body, ticker: String(body.ticker).toUpperCase(), enabled: true, last_fired_at: null };
          rows = [...rows, created];
          return json(created);
        }
        if (url.match(/\/api\/alerts\/\d+$/) && method === "DELETE") {
          const id = Number(url.split("/").pop());
          deleted.push(id);
          rows = rows.filter((row) => row.id !== id);
          return json({ status: "ok" });
        }
        if (url.endsWith("/api/alerts")) return json(rows);
        return json({});
      }),
    );

    render(<Alerts />);
    expect(await screen.findByText("VCB")).toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
    expect(screen.getByText("91.000")).toBeInTheDocument();
    expect(screen.getByText("enabled")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "hpg" } });
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "lte" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "26500" } });
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "repeat" } });
    fireEvent.click(screen.getByRole("button", { name: "Add alert" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ ticker: "hpg", op: "lte", price: 26500, mode: "repeat" });
    expect(await screen.findByText("HPG")).toBeInTheDocument();
    expect(screen.getByLabelText("Ticker")).toHaveValue("");
    expect(screen.getByText("2 active")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete VCB" }));
    await waitFor(() => expect(deleted).toEqual([1]));
    expect(screen.queryByText("VCB")).not.toBeInTheDocument();
    expect(screen.getByText("HPG")).toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
  });

  it("shows an error when the list cannot load and when delete fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/alerts") && method === "GET") return json([vcb]);
        if (url.endsWith("/api/alerts/1") && method === "DELETE") return json({}, false);
        return json({}, false);
      }),
    );

    render(<Alerts />);
    expect(await screen.findByText("VCB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete VCB" }));
    expect(await screen.findByText("Failed to delete alert")).toBeInTheDocument();
  });

  it("shows a load error when the alerts request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => json({}, false)),
    );
    render(<Alerts />);
    expect(await screen.findByText("Failed to load alerts")).toBeInTheDocument();
  });
});
