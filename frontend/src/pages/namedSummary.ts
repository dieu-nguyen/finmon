import { PATTERN_GUIDE } from "../patterns/catalog";

export type NamedHitCount = {
  ticker: string;
  pattern?: string | null;
  state?: string | null;
};

export type PatternMatchSummary = {
  id: string;
  name: string;
  forming: number;
  confirmed: number;
  total: number;
};

export const MATCH_PAGE_SIZE = 20;

export type NamedHitOrder = {
  ticker: string;
  score: number;
  pattern?: string | null;
  run_id?: number | null;
};

/** Newest covering run first, then higher score, then ticker. */
export function orderNamedHits<T extends NamedHitOrder>(hits: readonly T[]): T[] {
  return [...hits].sort((a, b) => {
    const runA = typeof a.run_id === "number" ? a.run_id : -1;
    const runB = typeof b.run_id === "number" ? b.run_id : -1;
    if (runA !== runB) return runB - runA;
    if (a.score !== b.score) return b.score - a.score;
    const ticker = a.ticker.localeCompare(b.ticker);
    if (ticker !== 0) return ticker;
    return (a.pattern ?? "").localeCompare(b.pattern ?? "");
  });
}

/** Applied match filter. An empty pattern and ticker keeps every hit. */
export function filterNamedHits<T extends { ticker: string; pattern?: string | null }>(
  hits: readonly T[],
  filter: { pattern: string; ticker: string },
): T[] {
  const pattern = filter.pattern.trim();
  const ticker = filter.ticker.trim().toUpperCase();
  return hits.filter((hit) => {
    if (pattern && (hit.pattern ?? "") !== pattern) return false;
    if (ticker && !hit.ticker.toUpperCase().includes(ticker)) return false;
    return true;
  });
}

/** Counts the full combined named-hit list. One symbol and pattern is one hit. */
export function summarizeNamedHits(hits: readonly NamedHitCount[]): PatternMatchSummary[] {
  const seen = new Set<string>();
  const counts = new Map<string, { forming: number; confirmed: number }>();
  for (const hit of hits) {
    const id = hit.pattern?.trim();
    const ticker = hit.ticker?.trim();
    if (!id || !ticker) continue;
    const key = `${id}\0${ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = counts.get(id) ?? { forming: 0, confirmed: 0 };
    if (hit.state === "forming") row.forming += 1;
    else if (hit.state === "confirmed") row.confirmed += 1;
    counts.set(id, row);
  }

  const guide = new Map(PATTERN_GUIDE.map((row) => [row.id, row]));
  return [...counts.entries()]
    .map(([id, row]) => ({
      id,
      name: guide.get(id)?.name ?? id,
      forming: row.forming,
      confirmed: row.confirmed,
      total: row.forming + row.confirmed,
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => {
      const rankA = guide.get(a.id)?.rank ?? 0;
      const rankB = guide.get(b.id)?.rank ?? 0;
      if (rankA !== rankB) return rankB - rankA;
      return a.name.localeCompare(b.name);
    });
}
