export type PatternName = { id: string; label: string };

export type PatternPoint = { date: string; price: number; role?: string };

export type PatternSwings = {
  pattern?: string;
  points?: PatternPoint[];
  neckline?: { date: string; price: number }[];
};

export type PatternMark = {
  points: PatternPoint[];
  neckline: { date: string; price: number }[];
};

export function patternLabel(id: string | null | undefined, catalog: PatternName[] = []): string {
  if (!id) return "";
  return catalog.find((row) => row.id === id)?.label ?? id;
}

export function stateLabel(state: string | null | undefined): string {
  if (state === "forming") return "Forming";
  if (state === "confirmed") return "Confirmed";
  return "";
}

export function markFrom(swings: PatternSwings | null | undefined): PatternMark | null {
  if (!swings || !Array.isArray(swings.points) || swings.points.length === 0) return null;
  return {
    points: swings.points,
    neckline: Array.isArray(swings.neckline) ? swings.neckline : [],
  };
}
