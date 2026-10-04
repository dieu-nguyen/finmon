export const NAMED_PATTERNS = [
  { id: "double_bottom", label: "Double bottom" },
  { id: "double_top", label: "Double top" },
  { id: "head_and_shoulders", label: "Head and shoulders" },
  { id: "inverse_head_and_shoulders", label: "Inverse head and shoulders" },
] as const;

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

export function patternLabel(id: string | null | undefined): string {
  return NAMED_PATTERNS.find((row) => row.id === id)?.label ?? "";
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
