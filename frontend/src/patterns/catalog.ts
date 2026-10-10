/**
 * One catalog for the Patterns page. Add a row here to extend it.
 *
 * Teaching rank is a fixed 1–100 integer: higher means the pattern is taught
 * earlier and more often in standard technical-analysis references. There is
 * no credible public dataset of broker usage, so this is not a usage share.
 * Order: double bottom 100, double top 96, head and shoulders 92, inverse
 * head and shoulders 88, bull flag 80, bear flag 76, ascending triangle 72,
 * descending triangle 68, symmetrical triangle 64, cup and handle 58, then
 * rounding bottom 50, falling wedge 46, rising wedge 42.
 */
export type Point = { x: number; y: number };

export type PatternSchematic = {
  /** Ideal price path. y is price: larger is higher on the chart. */
  path: Point[];
  /** Neckline or boundary. Dashed on the schematic. */
  guides: Point[][];
  /** Round the path for cups and rounding bottoms. */
  smooth?: boolean;
  /** Pivot dots. Defaults to every path point. */
  marks?: Point[];
};

export type PatternGuide = {
  id: string;
  name: string;
  shape: string;
  reading: string;
  rank: number;
  scan: boolean;
  schematic: PatternSchematic;
};

/** Detectors that exist. Everything else stays on the page with Scan disabled. */
export const BUILT_SCAN_IDS = [
  "double_bottom",
  "double_top",
  "head_and_shoulders",
  "inverse_head_and_shoulders",
] as const;

const SCAN_IDS = new Set<string>(BUILT_SCAN_IDS);

const FAVORITES_KEY = "finmon.pattern-favorites";

function guide(row: Omit<PatternGuide, "scan">): PatternGuide {
  return { ...row, scan: SCAN_IDS.has(row.id) };
}

export const PATTERN_GUIDE: PatternGuide[] = [
  guide({
    id: "double_bottom",
    name: "Double bottom",
    rank: 100,
    shape: "Two lows at nearly the same price, with a rally between them.",
    reading:
      "The neckline is the peak between the two lows. Forming means both lows are in place and price has not closed through that peak. A close through the neckline means the bar finished above it.",
    schematic: {
      path: [
        { x: 0, y: 42 },
        { x: 20, y: 16 },
        { x: 42, y: 64 },
        { x: 66, y: 14 },
        { x: 86, y: 80 },
        { x: 100, y: 92 },
      ],
      guides: [
        [
          { x: 42, y: 64 },
          { x: 92, y: 64 },
        ],
      ],
    },
  }),
  guide({
    id: "double_top",
    name: "Double top",
    rank: 96,
    shape: "Two highs at nearly the same price, with a decline between them.",
    reading:
      "The neckline is the trough between the two highs. Forming means both highs are in place and price has not closed through that trough. A close through the neckline means the bar finished below it.",
    schematic: {
      path: [
        { x: 0, y: 58 },
        { x: 20, y: 86 },
        { x: 42, y: 36 },
        { x: 66, y: 88 },
        { x: 86, y: 22 },
        { x: 100, y: 10 },
      ],
      guides: [
        [
          { x: 42, y: 36 },
          { x: 92, y: 36 },
        ],
      ],
    },
  }),
  guide({
    id: "head_and_shoulders",
    name: "Head and shoulders",
    rank: 92,
    shape: "Three highs. The middle one is clearly higher, and the two shoulders are close in price.",
    reading:
      "The neckline runs through the two troughs between the shoulders and the head. Forming means the right shoulder is in place and price has not closed through that line. A close through the neckline means the bar finished below it.",
    schematic: {
      path: [
        { x: 0, y: 48 },
        { x: 14, y: 68 },
        { x: 28, y: 42 },
        { x: 50, y: 92 },
        { x: 72, y: 40 },
        { x: 86, y: 66 },
        { x: 100, y: 18 },
      ],
      guides: [
        [
          { x: 28, y: 42 },
          { x: 72, y: 40 },
          { x: 94, y: 38 },
        ],
      ],
    },
  }),
  guide({
    id: "inverse_head_and_shoulders",
    name: "Inverse head and shoulders",
    rank: 88,
    shape: "Three lows. The middle one is clearly lower, and the two shoulders are close in price.",
    reading:
      "The neckline runs through the two peaks between the shoulders and the head. Forming means the right shoulder is in place and price has not closed through that line. A close through the neckline means the bar finished above it.",
    schematic: {
      path: [
        { x: 0, y: 52 },
        { x: 14, y: 32 },
        { x: 28, y: 58 },
        { x: 50, y: 10 },
        { x: 72, y: 60 },
        { x: 86, y: 34 },
        { x: 100, y: 84 },
      ],
      guides: [
        [
          { x: 28, y: 58 },
          { x: 72, y: 60 },
          { x: 94, y: 62 },
        ],
      ],
    },
  }),
  guide({
    id: "bull_flag",
    name: "Bull flag",
    rank: 80,
    shape: "A sharp rise, then a short downward drift in a narrow channel.",
    reading:
      "The pole is the sharp rise. The flag is the short drift after it. Forming means price is still inside that channel. A close through the top of the channel means the bar finished above the drift. There is no horizontal neckline.",
    schematic: {
      path: [
        { x: 0, y: 12 },
        { x: 32, y: 82 },
        { x: 46, y: 68 },
        { x: 58, y: 76 },
        { x: 72, y: 62 },
        { x: 86, y: 70 },
        { x: 100, y: 94 },
      ],
      guides: [
        [
          { x: 32, y: 82 },
          { x: 86, y: 70 },
        ],
        [
          { x: 46, y: 68 },
          { x: 96, y: 56 },
        ],
      ],
    },
  }),
  guide({
    id: "bear_flag",
    name: "Bear flag",
    rank: 76,
    shape: "A sharp drop, then a short upward drift in a narrow channel.",
    reading:
      "The pole is the sharp drop. The flag is the short drift after it. Forming means price is still inside that channel. A close through the bottom of the channel means the bar finished below the drift.",
    schematic: {
      path: [
        { x: 0, y: 88 },
        { x: 32, y: 18 },
        { x: 46, y: 32 },
        { x: 58, y: 24 },
        { x: 72, y: 38 },
        { x: 86, y: 30 },
        { x: 100, y: 8 },
      ],
      guides: [
        [
          { x: 46, y: 32 },
          { x: 96, y: 44 },
        ],
        [
          { x: 32, y: 18 },
          { x: 86, y: 30 },
        ],
      ],
    },
  }),
  guide({
    id: "ascending_triangle",
    name: "Ascending triangle",
    rank: 72,
    shape: "Highs that stall near one price, and lows that rise toward that price.",
    reading:
      "The flat highs are the neckline. Forming means price is still inside the two lines. A close through the neckline means the bar finished above the flat highs.",
    schematic: {
      path: [
        { x: 0, y: 24 },
        { x: 18, y: 70 },
        { x: 36, y: 38 },
        { x: 54, y: 70 },
        { x: 72, y: 48 },
        { x: 90, y: 70 },
        { x: 100, y: 90 },
      ],
      guides: [
        [
          { x: 18, y: 70 },
          { x: 90, y: 70 },
        ],
        [
          { x: 0, y: 24 },
          { x: 36, y: 38 },
          { x: 72, y: 48 },
        ],
      ],
    },
  }),
  guide({
    id: "descending_triangle",
    name: "Descending triangle",
    rank: 68,
    shape: "Lows that stall near one price, and highs that fall toward that price.",
    reading:
      "The flat lows are the neckline. Forming means price is still inside the two lines. A close through the neckline means the bar finished below the flat lows.",
    schematic: {
      path: [
        { x: 0, y: 76 },
        { x: 18, y: 28 },
        { x: 36, y: 62 },
        { x: 54, y: 28 },
        { x: 72, y: 50 },
        { x: 90, y: 28 },
        { x: 100, y: 10 },
      ],
      guides: [
        [
          { x: 18, y: 28 },
          { x: 90, y: 28 },
        ],
        [
          { x: 0, y: 76 },
          { x: 36, y: 62 },
          { x: 72, y: 50 },
        ],
      ],
    },
  }),
  guide({
    id: "symmetrical_triangle",
    name: "Symmetrical triangle",
    rank: 64,
    shape: "Highs falling and lows rising, so the two lines converge.",
    reading:
      "There is no single flat neckline. The two converging lines bound the shape. Forming means price is still inside them. A close through either line means the bar finished outside the triangle.",
    schematic: {
      path: [
        { x: 0, y: 18 },
        { x: 16, y: 82 },
        { x: 34, y: 30 },
        { x: 52, y: 72 },
        { x: 70, y: 40 },
        { x: 88, y: 62 },
        { x: 100, y: 50 },
      ],
      guides: [
        [
          { x: 16, y: 82 },
          { x: 52, y: 72 },
          { x: 88, y: 62 },
        ],
        [
          { x: 0, y: 18 },
          { x: 34, y: 30 },
          { x: 70, y: 40 },
        ],
      ],
    },
  }),
  guide({
    id: "cup_and_handle",
    name: "Cup and handle",
    rank: 58,
    shape: "A rounded decline and recovery, then a small dip near the prior high.",
    reading:
      "The lip of the cup, along the prior high, is the line to watch. Forming means the handle is still a dip and price has not closed through that lip. A close through the lip means the bar finished above it. The round needs a longer window than the first four patterns.",
    schematic: {
      path: [
        { x: 0, y: 74 },
        { x: 12, y: 62 },
        { x: 24, y: 42 },
        { x: 38, y: 24 },
        { x: 50, y: 16 },
        { x: 62, y: 24 },
        { x: 76, y: 46 },
        { x: 86, y: 74 },
        { x: 92, y: 60 },
        { x: 100, y: 86 },
      ],
      guides: [
        [
          { x: 0, y: 74 },
          { x: 86, y: 74 },
        ],
      ],
      smooth: true,
      marks: [
        { x: 0, y: 74 },
        { x: 50, y: 16 },
        { x: 86, y: 74 },
        { x: 92, y: 60 },
        { x: 100, y: 86 },
      ],
    },
  }),
  guide({
    id: "rounding_bottom",
    name: "Rounding bottom",
    rank: 50,
    shape: "A slow rounded decline that turns into a slow recovery, a wide U.",
    reading:
      "The left lip of the round is the line to watch. Forming means the recovery has not closed through that lip. A close through it means the bar finished above the left side of the round. There is no sharp neckline between two pivots.",
    schematic: {
      path: [
        { x: 0, y: 68 },
        { x: 16, y: 52 },
        { x: 32, y: 32 },
        { x: 50, y: 16 },
        { x: 68, y: 32 },
        { x: 84, y: 54 },
        { x: 100, y: 82 },
      ],
      guides: [
        [
          { x: 0, y: 68 },
          { x: 84, y: 68 },
        ],
      ],
      smooth: true,
      marks: [
        { x: 0, y: 68 },
        { x: 50, y: 16 },
        { x: 100, y: 82 },
      ],
    },
  }),
  guide({
    id: "falling_wedge",
    name: "Falling wedge",
    rank: 46,
    shape: "Highs and lows both fall, and the two lines converge.",
    reading:
      "The upper and lower lines bound the wedge. Forming means price is still inside them. A close through the upper line means the bar finished above the wedge.",
    schematic: {
      path: [
        { x: 0, y: 84 },
        { x: 18, y: 56 },
        { x: 36, y: 74 },
        { x: 54, y: 48 },
        { x: 72, y: 62 },
        { x: 90, y: 42 },
        { x: 100, y: 70 },
      ],
      guides: [
        [
          { x: 0, y: 84 },
          { x: 36, y: 74 },
          { x: 72, y: 62 },
        ],
        [
          { x: 18, y: 56 },
          { x: 54, y: 48 },
          { x: 90, y: 42 },
        ],
      ],
    },
  }),
  guide({
    id: "rising_wedge",
    name: "Rising wedge",
    rank: 42,
    shape: "Highs and lows both rise, and the two lines converge.",
    reading:
      "The upper and lower lines bound the wedge. Forming means price is still inside them. A close through the lower line means the bar finished below the wedge.",
    schematic: {
      path: [
        { x: 0, y: 16 },
        { x: 20, y: 48 },
        { x: 36, y: 36 },
        { x: 54, y: 64 },
        { x: 70, y: 54 },
        { x: 88, y: 78 },
        { x: 100, y: 46 },
      ],
      guides: [
        [
          { x: 20, y: 48 },
          { x: 54, y: 64 },
          { x: 88, y: 78 },
        ],
        [
          { x: 0, y: 16 },
          { x: 36, y: 36 },
          { x: 70, y: 54 },
        ],
      ],
    },
  }),
];

export function readFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const known = new Set(PATTERN_GUIDE.map((row) => row.id));
    return parsed.filter((id): id is string => typeof id === "string" && known.has(id));
  } catch {
    return [];
  }
}

export function writeFavoriteIds(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // This browser can refuse storage. The in-memory order still updates.
  }
}

export function filterPatterns(rows: PatternGuide[], query: string): PatternGuide[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => `${row.name}\n${row.shape}\n${row.reading}`.toLowerCase().includes(q));
}

export function orderPatterns(rows: PatternGuide[], favoriteIds: readonly string[]): PatternGuide[] {
  const favorites = new Set(favoriteIds);
  return [...rows].sort((a, b) => {
    const fav = Number(favorites.has(b.id)) - Number(favorites.has(a.id));
    if (fav !== 0) return fav;
    if (a.rank !== b.rank) return b.rank - a.rank;
    return a.name.localeCompare(b.name);
  });
}

export function visiblePatterns(query: string, favoriteIds: readonly string[]): PatternGuide[] {
  return orderPatterns(filterPatterns(PATTERN_GUIDE, query), favoriteIds);
}
