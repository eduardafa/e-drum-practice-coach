import { useMemo, useState } from "react";
import {
  binOf,
  bins,
  dynamicsNote,
  type HeatMeasure,
  type Heatmap,
  type PadHeat,
} from "./history/heatmap";
import { NITRO_MAX_PADS, type PadInfo } from "./kit/nitroMax";

interface Props {
  heat: Heatmap;
  /** Names the heading's scope, e.g. "this session" or "the last 30 days". */
  scope: string;
}

// The kit's 1.6:1 layout box (as in the kit view), with room for labels below.
const BOX_W = 384;
const BOX_H = 240;
const H = 256;

const MEASURES: readonly { id: HeatMeasure; label: string }[] = [
  { id: "hits", label: "Hits" },
  { id: "strength", label: "Strength" },
];

const DYNAMIC_LABEL = { accent: "Accents", normal: "Normal notes", ghost: "Ghost notes" } as const;

const valueOf = (p: PadHeat | undefined, measure: HeatMeasure) =>
  !p ? null : measure === "hits" ? p.hits : p.velocity.mean;

const spreadText = (x: number | null) => (x === null ? "—" : `±${Math.round(x)}`);

const round = (x: number | null) => (x === null ? "—" : String(Math.round(x)));

function describe(pad: PadInfo, p: PadHeat | undefined): string {
  if (!p || p.hits === 0) return `${pad.label}: no hits`;
  const extras = p.extras ? ` (${p.extras} extra)` : "";
  const strength =
    p.velocity.mean === null
      ? ""
      : ` · strength ${Math.round(p.velocity.mean)}${p.velocity.spread === null ? "" : ` ±${Math.round(p.velocity.spread)}`}`;
  return `${pad.label}: ${p.hits} ${p.hits === 1 ? "hit" : "hits"}${extras}${strength}`;
}

/**
 * The kit drawn from above, each pad filled by how often it was hit or how
 * hard on average: one hue that stands out more for more (lighter on dark,
 * darker on light), with a legend. The drawing is hidden from screen
 * readers; the caption and the table carry the same values.
 */
export function PadHeatmap({ heat, scope }: Props) {
  const [measure, setMeasure] = useState<HeatMeasure>("hits");
  const [active, setActive] = useState<PadInfo | null>(null);

  const used = NITRO_MAX_PADS.filter((pad) => (heat.pads.get(pad.id)?.hits ?? 0) > 0);
  const maxHits = Math.max(0, ...used.map((pad) => heat.pads.get(pad.id)?.hits ?? 0));
  const binList = bins(measure, maxHits);

  const byHits = used.toSorted((a, b) => (heat.pads.get(b.id)?.hits ?? 0) - (heat.pads.get(a.id)?.hits ?? 0));
  const byStrength = used
    .filter((pad) => (heat.pads.get(pad.id)?.velocity.mean ?? null) !== null)
    .toSorted((a, b) => (heat.pads.get(b.id)?.velocity.mean ?? 0) - (heat.pads.get(a.id)?.velocity.mean ?? 0));
  const most = byHits[0];
  const hardest = byStrength[0];
  const caption =
    most === undefined
      ? "No hits yet."
      : `Most hit: ${most.label} (${heat.pads.get(most.id)?.hits}).` +
        (hardest ? ` Hardest: ${hardest.label} (strength ${round(heat.pads.get(hardest.id)?.velocity.mean ?? null)} of 127).` : "");
  const note = dynamicsNote(heat.dynamics);

  return (
    <div className="heatmap">
      <div className="heatmap-head">
        <h4 className="progress-subhead">Pads in {scope}</h4>
        <fieldset className="library-filters heatmap-measure">
          <legend className="visually-hidden">Color pads by</legend>
          {MEASURES.map((m) => (
            <button
              key={m.id}
              className={`secondary ${measure === m.id ? "selected" : ""}`}
              aria-pressed={measure === m.id}
              onClick={() => setMeasure(m.id)}
            >
              {m.label}
            </button>
          ))}
        </fieldset>
      </div>
      <p className="heatmap-caption">{caption}</p>

      <div className="heatmap-plot">
        <svg viewBox={`0 0 ${BOX_W} ${H}`} aria-hidden onPointerLeave={() => setActive(null)}>
          {NITRO_MAX_PADS.map((pad) => {
            const p = heat.pads.get(pad.id);
            const bin = binOf(valueOf(p, measure), binList);
            const cx = pad.x * BOX_W;
            const cy = pad.y * BOX_H;
            const r = pad.r * BOX_H;
            const value = valueOf(p, measure);
            return (
              <g
                key={pad.id}
                className={`heat-pad ${active?.id === pad.id ? "active" : ""}`}
                onPointerEnter={() => setActive(pad)}
                onPointerDown={() => setActive(pad)}
              >
                {/* A bigger, invisible target than the pad itself. */}
                <circle className="heat-hit" cx={cx} cy={cy} r={Math.max(r, 16) + 4} />
                <circle className={bin ? `heat-fill heat-step-${bin.step}` : "heat-empty"} cx={cx} cy={cy} r={r} />
                {bin && value !== null && (
                  <text className={`heat-value heat-step-${bin.step}`} x={cx} y={cy}>
                    {Math.round(value)}
                  </text>
                )}
                <text className="heat-label" x={cx} y={cy + r + 11}>
                  {pad.label}
                </text>
              </g>
            );
          })}
        </svg>
        {active && <HeatTip pad={active} text={describe(active, heat.pads.get(active.id))} />}
      </div>

      <ul className="heat-legend" aria-label={measure === "hits" ? "Hits per pad" : "Average strength, 1 to 127"}>
        <li>
          <span className="heat-swatch empty" />
          {measure === "hits" ? "none" : "no data"}
        </li>
        {binList.map((b) => (
          <li key={b.step}>
            <span className={`heat-swatch heat-step-${b.step}`} />
            {b.min === b.max ? b.min : `${b.min}–${b.max}`}
          </li>
        ))}
      </ul>
      <p className="hint">
        {measure === "hits"
          ? "The more a pad stands out, the more you hit it."
          : "Strength is how hard the kit felt each hit, from 1 (softest) to 127. The more a pad stands out, the harder you hit it."}
      </p>

      {note && <p className="heatmap-note">{note}</p>}

      <details className="progress-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Pad</th>
              <th scope="col">Hits</th>
              <th scope="col">Extra</th>
              <th scope="col">Strength</th>
              <th scope="col">Varies</th>
            </tr>
          </thead>
          <tbody>
            {byHits.map((pad) => {
              const p = heat.pads.get(pad.id);
              return (
                <tr key={pad.id}>
                  <th scope="row">{pad.label}</th>
                  <td>{p?.hits ?? 0}</td>
                  <td>{p?.extras ?? 0}</td>
                  <td>{round(p?.velocity.mean ?? null)}</td>
                  <td>{spreadText(p?.velocity.spread ?? null)}</td>
                </tr>
              );
            })}
            {(["accent", "normal", "ghost"] as const).map((d) => {
              const s = heat.dynamics.get(d);
              if (!s || heat.dynamics.size < 2) return null;
              return (
                <tr key={d} className="heat-dynamic">
                  <th scope="row">{DYNAMIC_LABEL[d]}</th>
                  <td>{s.n}</td>
                  <td>—</td>
                  <td>{round(s.mean)}</td>
                  <td>{spreadText(s.spread)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function HeatTip({ pad, text }: { pad: PadInfo; text: string }) {
  const style = useMemo(
    () => ({ left: `${pad.x * 100}%`, top: `${((pad.y * BOX_H - pad.r * BOX_H) / H) * 100}%` }),
    [pad],
  );
  return (
    <div className={`chart-tip ${pad.x > 0.6 ? "left" : ""}`} style={style} aria-hidden>
      <span>{text}</span>
    </div>
  );
}
