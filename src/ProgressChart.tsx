import { useId, useMemo, useState, type PointerEvent } from "react";
import { formatPercent, type Grouping, type ProgressPoint } from "./history/progress";

export type Measure = "accuracy" | "bpm";

interface Props {
  title: string;
  measure: Measure;
  points: readonly ProgressPoint[];
  grouping: Grouping;
  /** The time axis runs over these dates, so gaps between practice days show. */
  from: Temporal.PlainDate;
  to: Temporal.PlainDate;
}

// Drawn in viewBox units; the SVG scales to the panel's width.
const W = 384;
const H = 132;
const PAD = { top: 10, right: 40, bottom: 20, left: 36 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const EPOCH = Temporal.PlainDate.from("1970-01-01");
const epochDay = (d: Temporal.PlainDate) => EPOCH.until(d).days;
const shortDate = (d: Temporal.PlainDate) => d.toLocaleString(undefined, { day: "numeric", month: "short" });

const valueOf = (p: ProgressPoint, measure: Measure) => (measure === "bpm" ? p.bpm : p.accuracy);
const format = (value: number, measure: Measure) => (measure === "bpm" ? String(value) : formatPercent(value));

export function periodLabel(p: ProgressPoint, grouping: Grouping): string {
  const date =
    grouping === "week"
      ? `Week of ${shortDate(p.start)}`
      : p.start.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${date} · ${p.sessions} ${p.sessions === 1 ? "session" : "sessions"}`;
}

/** Round ticks covering the values, with a little room above and below. */
function fittedTicks(values: readonly number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = hi - lo > 40 ? 20 : hi - lo > 15 ? 10 : 5;
  const min = Math.floor((lo - 2) / step) * step;
  const max = Math.max(Math.ceil((hi + 2) / step) * step, min + step);
  const ticks: number[] = [];
  for (let t = min; t <= max; t += step) ticks.push(t);
  return ticks;
}

/**
 * A single-measure line chart over calendar dates: one series, so no legend
 * (the title names it). The latest value is labeled at the end of the line;
 * hovering shows any point. The drawing is hidden from screen readers: the
 * summary sentence and the table view next to it carry the same values.
 */
export function ProgressChart({ title, measure, points: all, grouping, from, to }: Props) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);

  const points = all.flatMap((p) => {
    const value = valueOf(p, measure);
    return value === null ? [] : [{ point: p, value }];
  });

  const x0 = epochDay(from);
  const span = Math.max(1, epochDay(to) - x0);
  const x = (d: Temporal.PlainDate) => PAD.left + ((epochDay(d) - x0) / span) * PLOT_W;

  const ticks = measure === "accuracy" ? [0, 0.5, 1] : fittedTicks(points.map((p) => p.value));
  const yMin = ticks[0] ?? 0;
  const yMax = ticks.at(-1) ?? 1;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.point.start).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join("");
  const last = points.at(-1);
  const shown = active === null ? undefined : points[active];
  const tipX = shown ? x(shown.point.start) : 0;
  const tipY = shown ? y(shown.value) : 0;

  // Snap to the point nearest the pointer along the time axis (a tap does the same on touch screens).
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let nearest: number | null = null;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.point.start) - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setActive(nearest);
  };

  return (
    <figure className="progress-chart">
      <figcaption id={titleId}>{title}</figcaption>
      <div className="progress-plot">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden onPointerDown={onPointerMove} onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {format(t, measure)}
              </text>
            </g>
          ))}
          <text className="tick" x={PAD.left} y={H - 4} textAnchor="start">
            {shortDate(from)}
          </text>
          <text className="tick" x={PAD.left + PLOT_W} y={H - 4} textAnchor="end">
            {shortDate(to)}
          </text>

          {shown && <line className="crosshair" x1={tipX} x2={tipX} y1={PAD.top} y2={PAD.top + PLOT_H} />}
          {points.length > 1 && <path className="series" d={path} />}
          {points.map((p, i) => (
            <circle
              key={p.point.start.toString()}
              className={`dot ${i === active ? "active" : ""}`}
              cx={x(p.point.start)}
              cy={y(p.value)}
              r={i === active ? 5 : 4}
            />
          ))}
          {last && (
            <text className="end-label" x={x(last.point.start) + 9} y={y(last.value)} dominantBaseline="middle">
              {format(last.value, measure)}
            </text>
          )}
        </svg>
        {shown && (
          <ChartTip
            x={tipX}
            y={tipY}
            value={`${format(shown.value, measure)}${measure === "bpm" ? " BPM" : ""}`}
            label={periodLabel(shown.point, grouping)}
          />
        )}
      </div>
    </figure>
  );
}

/** The hover readout above a point: the value first, then the period. Positioned in viewBox percentages. */
function ChartTip({ x, y, value, label }: { x: number; y: number; value: string; label: string }) {
  const style = useMemo(() => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }), [x, y]);
  return (
    <div className={`chart-tip ${x > W * 0.6 ? "left" : ""}`} style={style} aria-hidden>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
