export type DrawingTool = "pan" | "horizontal" | "trend" | "rectangle" | "fib" | "text" | "pin" | "delete";

export type Point = { date: string; price: number };

export type Drawing = { tool: string; points: Point[]; style?: { color?: string } };

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const TWO_POINT = new Set<DrawingTool>(["trend", "rectangle", "fib"]);

export function applyDrawing(drawings: Drawing[], tool: DrawingTool, point: Point): Drawing[] {
  if (tool === "pan") return drawings;
  if (tool === "delete") return drawings.slice(0, -1);
  if (!TWO_POINT.has(tool)) return [...drawings, { tool, points: [point] }];
  const previous = drawings.at(-1);
  if (previous && previous.tool === tool && previous.points.length === 1) {
    return [...drawings.slice(0, -1), { tool, points: [previous.points[0], point] }];
  }
  return [...drawings, { tool, points: [point] }];
}

/**
 * Nearest category for an ECharts convertFromPixel result: [category index or date, price].
 * `dates` is the chart axis, including empty future slots, so a click past the last bar keeps that date.
 */
export function pointFromPixel(dates: { date: string }[], raw: unknown): Point | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const [x, y] = raw as [unknown, unknown];
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  let index = -1;
  if (typeof x === "number" && Number.isFinite(x)) index = Math.round(x);
  else if (typeof x === "string") index = dates.findIndex((item) => item.date === x);
  if (index < 0 || index >= dates.length) return null;
  return { date: dates[index].date, price: Math.round(y) };
}

/** Category index from convertFromPixel, or null when the pointer misses the bars. */
export function barIndexFromPixel(barCount: number, raw: unknown): number | null {
  const x = Array.isArray(raw) ? raw[0] : raw;
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  const index = Math.round(x);
  if (index < 0 || index >= barCount) return null;
  return index;
}

/** null means the click did not change the drawing list. */
export function drawingsAfterClick(
  drawings: Drawing[],
  tool: DrawingTool,
  dates: { date: string }[],
  raw: unknown,
): Drawing[] | null {
  if (tool === "pan") return null;
  if (tool === "delete") return applyDrawing(drawings, tool, { date: "", price: 0 });
  const point = pointFromPixel(dates, raw);
  if (!point) return null;
  return applyDrawing(drawings, tool, point);
}
