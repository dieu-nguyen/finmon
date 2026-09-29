import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompanyPanel } from "./CompanyPanel";

const payload = {
  ticker: "TIG",
  fetched_at: "2026-09-29T00:17:36.269285+00:00",
  profile: [
    {
      organ_name: "Công ty Cổ phần Tập đoàn Đầu tư Thăng Long",
      organ_short_name: "Tập đoàn Đầu tư Thăng Long",
      sector: "Real Estate",
      com_group_code: "HNXIndex",
      symbol: "TIG",
      organ_code: "TIG",
      icb_code_lv2: "8600",
    },
  ],
  statements: {
    income: [
      {
        item_id: "net_sales",
        item_en: "Net sales",
        item: "Doanh thu thuần",
        "2024": 1495660143817,
        "2025": 1072169475948,
      },
      {
        item_id: "cost_of_sales",
        item_en: "Cost of sales",
        item: "Giá vốn hàng bán",
        "2024": -1239733978963,
        "2025": -864747901224,
      },
    ],
    balance: [],
    cashflow: [],
  },
  ratios: [],
};

describe("Company panel", () => {
  it("shows the company name and revenue without dumping JSON", () => {
    render(<CompanyPanel payload={payload} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Công ty Cổ phần Tập đoàn Đầu tư Thăng Long")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain('"item_id"');
    expect(text).not.toContain("Doanh thu thuần");
    expect(text).not.toContain("organ_code");
    expect(text).not.toContain("Giá vốn hàng bán");
    expect(text.replace(/\s/g, "")).toMatch(/1\.?072\.?169\.?475\.?948|1072169475948/);
  });
});
