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

function StatementSection({ title, rows, specs, ratio }: { title: string; rows: Row[]; specs: LineSpec[]; ratio?: boolean }) {
  const { years, lines } = metricLines(rows, specs);
  if (lines.length === 0) return null;
  const format = ratio ? formatRatio : formatAmount;
  const annual = years.length > 0 && years.every((year) => /^(19|20)\d{2}$/.test(year));
  return (
    <section className="statement-card">
      <h2 className="statement-head">
        {title}
        {annual ? <span>Annual</span> : null}
      </h2>
      <div className="statement-scroll">
        <Table style={{ width: "max-content", minWidth: "100%" }}>
          <thead>
            <tr>
              <th>Metric</th>
              {years.map((year) => (
                <th key={year} className="num">
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label}>
                <td className="metric-label">{line.label}</td>
                {years.map((year) => (
                  <td key={year} className="num">
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
  const money =
    metricLines(income, INCOME).lines.length > 0 || metricLines(balance, BALANCE).lines.length > 0 || metricLines(cashflow, CASHFLOW).lines.length > 0;
  const numericLabels = new Set(["Shares outstanding", "Market cap"]);

  return (
    <div className="company">
      {inline.length > 0 || blocks.length > 0 ? (
        <section className="overview">
          {inline.length > 0 ? (
            <dl className="fact-grid">
              {inline.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd className={numericLabels.has(fact.label) ? "num" : undefined}>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {blocks.map((fact) => (
            <p key={fact.label} className="business">
              {fact.value}
            </p>
          ))}
        </section>
      ) : null}
      {money ? (
        <div className="unit-row">
          <span className="unit-pill">Unit: đồng</span>
        </div>
      ) : null}
      {hasStatements ? (
        <div className="company-grid">
          <StatementSection title="Income Statement" rows={income} specs={INCOME} />
          <StatementSection title="Balance Sheet" rows={balance} specs={BALANCE} />
          <StatementSection title="Cash Flow" rows={cashflow} specs={CASHFLOW} />
          <StatementSection title="Financial Ratios" rows={ratios} specs={RATIOS} ratio />
        </div>
      ) : null}
    </div>
  );
}
