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
  last: number | null;
  change: number | null;
  volume: number | null;
  watchlist: boolean;
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

export const api = {
  health: () => req<Health>("/api/health"),
  symbols: (q = "") => req<SymbolRow[]>(`/api/symbols${q}`),
  bars: (ticker: string) => req<Bar[]>(`/api/symbols/${ticker}/bars`),
  indicators: (ticker: string, names: string) => req<Record<string, unknown>>(`/api/symbols/${ticker}/indicators?names=${encodeURIComponent(names)}`),
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
};
