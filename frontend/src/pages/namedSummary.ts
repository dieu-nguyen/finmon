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

/** Counts the named hits already on screen. One symbol and pattern is one hit. */
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
