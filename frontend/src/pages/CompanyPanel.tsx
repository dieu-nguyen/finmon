import type { CSSProperties } from "react";
import { EmptyState, Table } from "../design-system";

type Row = Record<string, unknown>;

type LineSpec = { ids: string[]; label: string };

const INCOME: LineSpec[] = [
  { ids: ["net_sales", "sales", "revenue"], label: "Revenue" },
  { ids: ["gross_profit"], label: "Gross profit" },
  { ids: ["operating_profit_loss", "operating_profit"], label: "Operating profit" },
  { ids: ["net_profit_loss_after_tax", "net_profit"], label: "Net profit" },
];

const BALANCE: LineSpec[] = [
  { ids: ["total_assets"], label: "Total assets" },
  { ids: ["liabilities"], label: "Liabilities" },
  { ids: ["owners_equity"], label: "Equity" },
];

const CASHFLOW: LineSpec[] = [
  { ids: ["net_cash_inflows_outflows_from_operating_activities"], label: "Operating cash flow" },
  { ids: ["purchases_of_fixed_assets_and_other_long_term_assets"], label: "Capex" },
  { ids: ["cash_and_cash_equivalents_at_the_end_of_period"], label: "Ending cash" },
];

const RATIOS: LineSpec[] = [
  { ids: ["pe_ratio"], label: "P/E" },
  { ids: ["pb_ratio"], label: "P/B" },
  { ids: ["roe"], label: "ROE" },
  { ids: ["roa"], label: "ROA" },
  { ids: ["eps", "eps_basic", "eps_basic_vnd"], label: "EPS" },
  { ids: ["net_margin"], label: "Profit margin" },
  { ids: ["debt_to_equity", "debtPerEquity"], label: "Debt/equity" },
];

const EXCHANGES: Record<string, string> = {
  HNXIndex: "HNX",
  VNINDEX: "HOSE",
  VNIndex: "HOSE",
  UPCOMIndex: "UPCOM",
};

const PERIOD_FIELDS = ["year", "period", "report_date"];

type Fact = { label: string; value: string; block?: boolean };

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Row => !!row && typeof row === "object");
}

function profileRecord(profile: unknown): Row | null {
  if (Array.isArray(profile)) return asRows(profile)[0] ?? null;
  if (profile && typeof profile === "object") return profile as Row;
  return null;
}

function isYearKey(key: string): boolean {
  return /^(19|20)\d{2}$/.test(key);
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);
}

function formatRatio(n: number): string {
  const digits = Math.abs(n) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(n);
}

function formatPercent(n: number): string {
  if (Math.abs(n) <= 1) return new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 }).format(n);
  return formatAmount(n);
}

function present(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function yearColumns(rows: Row[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (isYearKey(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

function findMetricRow(rows: Row[], ids: string[]): Row | undefined {
  for (const id of ids) {
    const hit = rows.find((row) => String(row.item_id) === id);
    if (hit) return hit;
  }
  return undefined;
}

type Line = { label: string; values: Record<string, number | null> };

function metricLines(rows: Row[], specs: LineSpec[]): { years: string[]; lines: Line[] } {
  if (rows.length === 0) return { years: [], lines: [] };
  const byItem = rows.some((row) => row.item_id != null || row.item != null);
  if (byItem) {
    const years = yearColumns(rows);
    const lines: Line[] = [];
    for (const spec of specs) {
      const row = findMetricRow(rows, spec.ids);
      if (!row) continue;
      const values: Record<string, number | null> = {};
      let any = false;
      for (const year of years) {
        const n = numeric(row[year]);
        values[year] = n;
        if (n != null) any = true;
      }
      if (any) lines.push({ label: spec.label, values });
    }
    return { years, lines };
  }

  const period = PERIOD_FIELDS.find((field) => rows.some((row) => row[field] != null));
  if (!period) return { years: [], lines: [] };
  const years = [...new Set(rows.map((row) => String(row[period] ?? "")).filter(Boolean))].sort();
  const lines: Line[] = [];
  for (const spec of specs) {
    const values: Record<string, number | null> = {};
    let any = false;
    for (const row of rows) {
      const column = String(row[period] ?? "");
      const key = spec.ids.find((id) => id in row);
      if (!column || !key) continue;
      const n = numeric(row[key]);
      values[column] = n;
      if (n != null) any = true;
    }
    if (any) lines.push({ label: spec.label, values });
  }
  return { years, lines };
}

function overviewFacts(profile: Row | null): Fact[] {
  if (!profile) return [];
  const facts: Fact[] = [];
  const push = (label: string, value: unknown, format: (raw: unknown) => string, block = false) => {
    if (!present(value)) return;
    facts.push({ label, value: format(value), block });
  };
  push("Name", profile.organ_name, (raw) => String(raw));
  push("Short name", profile.organ_short_name, (raw) => String(raw));
  push("Exchange", profile.com_group_code, (raw) => EXCHANGES[String(raw)] ?? String(raw));
  push("Industry", profile.sector, (raw) => String(raw));
  push("Listed", profile.listing_date, (raw) => {
    const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : String(raw);
  });
  push("Shares outstanding", profile.issue_share, (raw) => {
    const n = numeric(raw);
    return n == null ? String(raw) : formatAmount(n);
  });
  push("Market cap", profile.market_cap, (raw) => {
    const n = numeric(raw);
    return n == null ? String(raw) : `${formatAmount(n)} đồng`;
  });
  push("Free float", profile.free_float_percentage, (raw) => {
    const n = numeric(raw);
    return n == null ? String(raw) : formatPercent(n);
  });
  push("Foreign ownership", profile.foreigner_percentage, (raw) => {
    const n = numeric(raw);
    return n == null ? String(raw) : formatPercent(n);
  });
  push("State ownership", profile.state_percentage, (raw) => {
    const n = numeric(raw);
    return n == null ? String(raw) : formatPercent(n);
  });
  push("Business", profile.company_profile, (raw) => String(raw).trim(), true);
  return facts;
}

function StatementSection({ title, unit, rows, specs, ratio }: { title: string; unit?: string; rows: Row[]; specs: LineSpec[]; ratio?: boolean }) {
  const { years, lines } = metricLines(rows, specs);
  if (lines.length === 0) return null;
  const format = ratio ? formatRatio : formatAmount;
  return (
    <section style={{ display: "grid", gap: 4 }}>
      <h2 style={{ fontSize: "var(--fs-sm)", fontWeight: 600, margin: 0, color: "var(--text-muted)" }}>
        {title}
        {unit ? <span style={{ fontWeight: 400 }}> · {unit}</span> : null}
      </h2>
      <div style={{ overflowX: "auto" }}>
        <Table>
          <thead>
            <tr>
              <th style={headStyle(true)} />
              {years.map((year) => (
                <th key={year} style={headStyle(false)}>
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label} style={{ height: 32 }}>
                <td style={{ position: "sticky", left: 0, background: "var(--bg)", paddingRight: 8, whiteSpace: "nowrap" }}>{line.label}</td>
                {years.map((year) => (
                  <td key={year} style={{ textAlign: "right", fontFamily: "var(--font-num)", paddingLeft: 8, whiteSpace: "nowrap" }}>
                    {line.values[year] == null ? "—" : format(line.values[year] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function headStyle(label: boolean): CSSProperties {
  return {
    textAlign: label ? "left" : "right",
    borderBottom: "1px solid var(--border)",
    height: 32,
    color: "var(--text-muted)",
    fontWeight: 500,
    fontSize: "var(--fs-xs)",
    whiteSpace: "nowrap",
    paddingLeft: label ? 0 : 8,
    position: label ? "sticky" : undefined,
    left: label ? 0 : undefined,
    background: "var(--bg)",
  };
}

export function CompanyPanel({ payload }: { payload: Record<string, unknown> }) {
  const profile = profileRecord(payload.profile);
  const facts = overviewFacts(profile);
  const statements = payload.statements && typeof payload.statements === "object" ? (payload.statements as Record<string, unknown>) : {};
  const income = asRows(statements.income);
  const balance = asRows(statements.balance);
  const cashflow = asRows(statements.cashflow);
  const ratios = asRows(payload.ratios);
  const hasStatements =
    metricLines(income, INCOME).lines.length > 0 ||
    metricLines(balance, BALANCE).lines.length > 0 ||
    metricLines(cashflow, CASHFLOW).lines.length > 0 ||
    metricLines(ratios, RATIOS).lines.length > 0;
  if (facts.length === 0 && !hasStatements) return <EmptyState text="Company data unavailable" />;

  const inline = facts.filter((fact) => !fact.block);
  const blocks = facts.filter((fact) => fact.block);

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
      {inline.length > 0 ? (
        <dl style={{ display: "grid", gridTemplateColumns: "128px 1fr", gap: "4px 8px", margin: 0, fontSize: "var(--fs-sm)" }}>
          {inline.map((fact) => (
            <div key={fact.label} style={{ display: "contents" }}>
              <dt style={{ color: "var(--text-muted)", margin: 0 }}>{fact.label}</dt>
              <dd style={{ margin: 0, fontFamily: fact.label === "Shares outstanding" || fact.label === "Market cap" ? "var(--font-num)" : undefined }}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {blocks.map((fact) => (
        <div key={fact.label} style={{ display: "grid", gap: 2, fontSize: "var(--fs-sm)" }}>
          <div style={{ color: "var(--text-muted)" }}>{fact.label}</div>
          <div>{fact.value}</div>
        </div>
      ))}
      <StatementSection title="Income" unit="đồng" rows={income} specs={INCOME} />
      <StatementSection title="Balance sheet" unit="đồng" rows={balance} specs={BALANCE} />
      <StatementSection title="Cash flow" unit="đồng" rows={cashflow} specs={CASHFLOW} />
      <StatementSection title="Ratios" rows={ratios} specs={RATIOS} ratio />
    </div>
  );
}
