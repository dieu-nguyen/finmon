import type { PatternSchematic, Point } from "./catalog";

const WIDTH = 160;
const HEIGHT = 96;
const PAD_X = 12;
const PAD_Y = 14;

function mapPoint(point: Point): [number, number] {
  const x = PAD_X + (point.x / 100) * (WIDTH - PAD_X * 2);
  const y = HEIGHT - PAD_Y - (point.y / 100) * (HEIGHT - PAD_Y * 2);
  return [x, y];
}

function straight(points: Point[]): string {
  return points
    .map(mapPoint)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
}

function smooth(points: Point[]): string {
  const mapped = points.map(mapPoint);
  if (mapped.length < 3) return straight(points);
  const parts = [`M ${mapped[0][0].toFixed(1)} ${mapped[0][1].toFixed(1)}`];
  for (let i = 0; i < mapped.length - 1; i++) {
    const p0 = mapped[Math.max(0, i - 1)];
    const p1 = mapped[i];
    const p2 = mapped[i + 1];
    const p3 = mapped[Math.min(mapped.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    parts.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`,
    );
  }
  return parts.join(" ");
}

export function PatternSchematic({ schematic, label }: { schematic: PatternSchematic; label: string }) {
  const marks = schematic.marks ?? schematic.path;
  const price = schematic.smooth ? smooth(schematic.path) : straight(schematic.path);
  return (
    <svg className="pattern-schematic" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      <line className="pattern-axis" x1={PAD_X} y1={HEIGHT - PAD_Y} x2={WIDTH - PAD_X} y2={HEIGHT - PAD_Y} />
      {schematic.guides.map((guide, index) => (
        <path key={index} className="pattern-guide" d={straight(guide)} />
      ))}
      <path className="pattern-price" d={price} />
      {marks.map((point, index) => {
        const [cx, cy] = mapPoint(point);
        return <circle key={index} className="pattern-pivot" cx={cx} cy={cy} r="2.2" />;
      })}
    </svg>
  );
}
