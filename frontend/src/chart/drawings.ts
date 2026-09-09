export type DrawingTool = "pan" | "horizontal" | "trend" | "rectangle" | "fib" | "text" | "pin" | "delete";

export type Point = { date: string; price: number };

export type Drawing = { tool: string; points: Point[]; style?: { color?: string } };

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function categoryIndex(dates: string[], date: string): number {
  const i = dates.indexOf(date);
  return i >= 0 ? i : 0;
}
