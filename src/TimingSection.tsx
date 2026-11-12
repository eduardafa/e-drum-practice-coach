import { useMemo } from "react";
import {
  LEAN_MS,
  LIMBS,
  describeTendency,
  formatLean,
  tendency,
  timingStats,
  type TimingStat,
} from "./history/limbs";
import type { HistoryRecord } from "./history/record";
import { NITRO_MAX_PADS } from "./kit/nitroMax";

interface Props {
  records: readonly HistoryRecord[];
  /** First date of the chosen range, or null for all time. */
  from: Temporal.PlainDate | null;
}

/** The track runs from this many ms early to this many late; further values sit at the end. */
const TRACK_MS = 50;

interface Row {
  key: string;
  label: string;
  stat: TimingStat;
}

/** Timing per hand, foot and pad over the chosen range, with the biggest tendency in words. */
export function TimingSection({ records, from }: Props) {
  const stats = timingStats(records, from);
  const { headline, tip } = describeTendency(tendency(stats.limbs));

  const limbRows: Row[] = LIMBS.flatMap(({ id, label }) => {
    const stat = stats.limbs.get(id);
    return stat ? [{ key: id, label, stat }] : [];
  });
  const padRows: Row[] = NITRO_MAX_PADS.flatMap(({ id, label }) => {
    const stat = stats.pads.get(id);
    return stat ? [{ key: id, label, stat }] : [];
  });

  if (stats.sessions === 0) return null;

  return (
    <section className="timing" aria-labelledby="timing-title">
      <h4 id="timing-title" className="progress-subhead">
        Timing by hand and foot
      </h4>
      <div className="tendency">
        <p className="tendency-headline">{headline}</p>
        <p className="tendency-tip">{tip}</p>
      </div>
      <TimingRows rows={limbRows} />
      <p className="hint">
        Grooves assume a right-handed setup: hi-hat, ride and crash with the right hand, snare with the left, kick
        with the right foot and hi-hat pedal with the left. Rudiments use their written sticking.
      </p>
      <h4 className="progress-subhead">Timing by pad</h4>
      <TimingRows rows={padRows} />
    </section>
  );
}

function TimingRows({ rows }: { rows: readonly Row[] }) {
  return (
    <ul className="timing-rows">
      <li className="timing-row timing-axis" aria-hidden>
        <span />
        <span className="timing-scale">
          <span>early</span>
          <span>click</span>
          <span>late</span>
        </span>
        <span />
      </li>
      {rows.map((r) => (
        <TimingRow key={r.key} label={r.label} stat={r.stat} />
      ))}
    </ul>
  );
}

const pos = (ms: number) => `${50 + (Math.max(-TRACK_MS, Math.min(TRACK_MS, ms)) / TRACK_MS) * 50}%`;

/**
 * One limb or pad: its name, a track from early to late with the average as
 * a dot and the typical spread as a band, then the same values in words.
 */
function TimingRow({ label, stat }: { label: string; stat: TimingStat }) {
  const { meanMs, spreadMs, hits, missed } = stat;
  const dotStyle = useMemo(() => ({ left: pos(meanMs ?? 0) }), [meanMs]);
  const bandStyle = useMemo(() => {
    if (meanMs === null || spreadMs === null) return undefined;
    const lo = Math.max(-TRACK_MS, meanMs - spreadMs);
    const hi = Math.min(TRACK_MS, meanMs + spreadMs);
    return { left: pos(lo), width: `${((hi - lo) / (2 * TRACK_MS)) * 100}%` };
  }, [meanMs, spreadMs]);
  const lean = meanMs === null ? "none" : Math.abs(meanMs) < LEAN_MS ? "close" : meanMs < 0 ? "early" : "late";

  return (
    <li className="timing-row">
      <span className="timing-label">{label}</span>
      <span className="timing-track" aria-hidden>
        <span className="timing-centre" />
        {bandStyle && <span className="timing-band" style={bandStyle} />}
        {meanMs !== null && <span className={`timing-dot ${lean}`} style={dotStyle} />}
      </span>
      <span className="timing-value">
        {meanMs === null ? "no hits" : formatLean(meanMs)}
        <span className="timing-detail">
          {spreadMs !== null && `±${Math.round(spreadMs)} ms · `}
          {hits} {hits === 1 ? "hit" : "hits"}
          {missed > 0 && `, ${missed} missed`}
        </span>
      </span>
    </li>
  );
}
