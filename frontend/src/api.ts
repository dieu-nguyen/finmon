const API = "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type SymbolRow = {
  ticker: string;
  name: string;
  board: string;
  type: string;
  listed: boolean;
  last: number | null;
  change: number | null;
  volume: number | null;
  watchlist: boolean;
};

export type SymbolPage = {
  items: SymbolRow[];
  total: number;
  limit: number;
  offset: number;
};

export type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Health = {
  status: string;
  as_of: string | null;
  watermarks: { job: string; as_of: string | null; status: string }[];
  dnse_configured: boolean;
  telegram_configured: boolean;
};

export type Alert = {
  id: number;
  ticker: string;
  op: string;
  price: number;
  mode: string;
  enabled: boolean;
  last_fired_at: string | null;
};

function withRange(path: string, range?: { from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

export type Pattern = {
  id: number;
  name: string;
  kind: string;
  schedule: string;
  enabled: boolean;
  spec: { reference?: string; min_score?: number; top_k?: number; pattern?: string };
};

export type ScanHit = {
  ticker: string;
  name: string;
  score: number;
  window_start: string;
  window_end: string;
  state?: string | null;
  swings?: { pattern?: string; points?: { role?: string; date: string; price: number }[]; neckline?: { date: string; price: number }[] } | null;
  pattern?: string | null;
  run_id?: number | null;
};

export type PatternHits = {
  pattern_id: number;
  name: string;
  kind?: string;
  pattern?: string | null;
  reference: string;
  as_of: string | null;
  reference_compared: boolean | null;
  hits: ScanHit[];
};

export type PatternInput = {
  name: string;
  kind?: "lookalike" | "named";
  reference?: string;
  min_score?: number;
  top_k?: number;
  pattern?: string;
  enabled: boolean;
};

export type NamedMatch = {
  pattern: string;
  state: string;
  score: number;
  window_start: string;
  window_end: string;
  swings: {
    pattern?: string;
    points?: { role?: string; date: string; price: number }[];
    neckline?: { date: string; price: number }[];
  };
  run_id?: number | null;
};

export type NamedCheck = {
  ticker: string;
  as_of: string | null;
  patterns: string[];
  matches: NamedMatch[];
};

export type PatternCatalogItem = { id: string; label: string };

export type NamedScan = {
  as_of: string | null;
  patterns: string[];
  scope: "all" | "subset";
  tickers: string[];
  hits: ScanHit[];
};

export const api = {
  health: () => req<Health>("/api/health"),
  symbols: (q = "", init?: RequestInit) => req<SymbolPage>(`/api/symbols${q}`, init),
  symbol: (ticker: string) => req<SymbolRow>(`/api/symbols/${encodeURIComponent(ticker)}`),
  bars: (ticker: string, range?: { from?: string; to?: string }) => req<Bar[]>(withRange(`/api/symbols/${ticker}/bars`, range)),
  indicators: (ticker: string, names: string, range?: { from?: string; to?: string }, init?: RequestInit) => {
    const params = new URLSearchParams({ names });
    if (range?.from) params.set("from", range.from);
    if (range?.to) params.set("to", range.to);
    return req<Record<string, unknown>>(`/api/symbols/${ticker}/indicators?${params.toString()}`, init);
  },
  pin: (ticker: string) => req<SymbolRow>(`/api/watchlist/${ticker}`, { method: "POST" }),
  unpin: (ticker: string) => req(`/api/watchlist/${ticker}`, { method: "DELETE" }),
  drawings: (ticker: string) => req<unknown[]>(`/api/symbols/${ticker}/drawings`),
  saveDrawings: (ticker: string, body: unknown) => req(`/api/symbols/${ticker}/drawings`, { method: "PUT", body: JSON.stringify(body) }),
  chartNotes: (ticker: string) => req<unknown[]>(`/api/symbols/${ticker}/chart-notes`),
  saveChartNotes: (ticker: string, body: unknown) => req(`/api/symbols/${ticker}/chart-notes`, { method: "PUT", body: JSON.stringify(body) }),
  pageNote: (ticker: string) => req<{ body: string }>(`/api/symbols/${ticker}/page-note`),
  savePageNote: (ticker: string, body: string) => req(`/api/symbols/${ticker}/page-note`, { method: "PUT", body: JSON.stringify({ body }) }),
  alerts: () => req<Alert[]>("/api/alerts"),
  createAlert: (body: Partial<Alert> & { ticker: string; op: string; price: number }) =>
    req<Alert>("/api/alerts", { method: "POST", body: JSON.stringify(body) }),
  deleteAlert: (id: number) => req(`/api/alerts/${id}`, { method: "DELETE" }),
  company: (ticker: string) => req<Record<string, unknown>>(`/api/symbols/${ticker}/company`),
  patterns: () => req<Pattern[]>("/api/patterns"),
  patternHits: (id: number, init?: RequestInit) => req<PatternHits>(`/api/patterns/${id}/hits`, init),
  scanLookalike: (id: number) => req<PatternHits>(`/api/patterns/${id}/scan`, { method: "POST" }),
  patternCatalog: (init?: RequestInit) => req<PatternCatalogItem[]>("/api/pattern-catalog", init),
  namedScan: (init?: RequestInit) => req<NamedScan>("/api/named-scans", init),
  runNamedScan: (body: { patterns: string[]; scope: "all" | "subset"; tickers?: string[] }) =>
    req<NamedScan>("/api/named-scans", { method: "POST", body: JSON.stringify(body) }),
  namedPatterns: (ticker: string, init?: RequestInit) =>
    req<NamedCheck>(`/api/symbols/${encodeURIComponent(ticker)}/named-patterns`, init),
  scanNamedPatterns: (ticker: string, patterns: string[]) =>
    req<NamedCheck>(`/api/symbols/${encodeURIComponent(ticker)}/named-patterns`, {
      method: "POST",
      body: JSON.stringify({ patterns }),
    }),
  savePattern: (body: PatternInput, id?: number) =>
    req<Pattern>(id ? `/api/patterns/${id}` : "/api/patterns", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
};
