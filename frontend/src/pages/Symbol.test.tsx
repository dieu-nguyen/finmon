import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SymbolPage } from "./Symbol";

vi.mock("../chart/DailyChart", () => ({
  DailyChart: ({ ticker }: { ticker: string }) => <div data-testid="daily-chart">{ticker}</div>,
}));

const company = {
  ticker: "TIG",
  profile: [{ organ_name: "Công ty Cổ phần Tập đoàn Đầu tư Thăng Long", com_group_code: "HNXIndex" }],
  statements: {
    income: [{ item_id: "net_sales", "2024": 1000, "2025": 2000 }],
    balance: [],
    cashflow: [],
  },
  ratios: [],
};

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  } as Response);
}

function renderSymbol() {
  return render(
    <MemoryRouter initialEntries={["/symbol/tig"]}>
      <Routes>
        <Route path="/symbol/:ticker" element={<SymbolPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Symbol side panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on Company inside the rail, with Note second and the chart in the main column", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/bars")) return json([{ date: "2026-01-02", open: 1, high: 2, low: 1, close: 2, volume: 10 }]);
        if (url.endsWith("/company")) return json(company);
        if (url.endsWith("/page-note")) return json({ body: "thesis" });
        if (url.includes("/indicators")) return json({ "sma:20": [null] });
        if (url.endsWith("/drawings")) return json([]);
        return json({ ticker: "TIG", name: "Thang Long", board: "HNX", type: "stock", listed: true, last: 2, change: 0.01, volume: 10, watchlist: false });
      }),
    );

    renderSymbol();

    const name = await screen.findByText("Công ty Cổ phần Tập đoàn Đầu tư Thăng Long");
    expect(name.closest(".rail")).not.toBeNull();
    expect(name.closest(".chart-frame")).toBeNull();
    expect(document.querySelector(".company-screen")).toBeNull();
    expect(screen.getByText("Revenue").closest(".rail")).not.toBeNull();
    expect(screen.getByTestId("daily-chart").closest(".chart-frame")).not.toBeNull();

    const tabs = screen.getAllByRole("button").filter((button) => ["Company", "Note", "Alert", "Scan"].includes(button.textContent ?? ""));
    expect(tabs.map((button) => button.textContent)).toEqual(["Company", "Note", "Alert", "Scan"]);
    expect(tabs[0]).toHaveTextContent("Company");
    expect(tabs[0]).not.toHaveTextContent("Scan");
    expect(tabs[tabs.length - 1]).toHaveTextContent("Scan");
    expect(tabs[0]).toHaveStyle({ fontWeight: "600" });
    expect(screen.queryByRole("combobox", { name: "Patterns" })).not.toBeInTheDocument();
    expect(urls.some((url) => url.endsWith("/company"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.getByLabelText("Note")).toHaveValue("thesis");
    expect(screen.getByRole("button", { name: "Save note" })).toBeInTheDocument();
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Alert" }));
    expect(screen.getByRole("button", { name: "Add alert" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Note")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    const scan = within(document.querySelector(".rail-body") as HTMLElement);
    expect(scan.getByRole("combobox", { name: "Patterns" }).closest(".rail")).not.toBeNull();
    expect(scan.getByRole("combobox", { name: "Patterns" }).closest(".chart-frame")).toBeNull();
    expect(document.querySelector(".symbol-page > .scan-bar")).toBeNull();
  });
});
