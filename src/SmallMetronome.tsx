import { useEffect, useMemo, useState, type Ref } from "react";
import type { Coach } from "./live/coach";
import { currentCount, type Count } from "./live/counts";

/** Looks one frame ahead, so the paint lands on the click (as the live count does). */
const PAINT_LOOKAHEAD_MS = 16;
/** Until two beats have been heard, the pendulum swings as if at 90 BPM. */
const DEFAULT_BEAT_MS = 60_000 / 90;

interface Beat {
  /** Beats since the metronome started, from 0; null while it's stopped. */
  number: number | null;
  /** Beat in the bar, from 0. */
  inBar: number;
  beatsPerBar: number;
  /** How long a beat lasts now, in ms. */
  beatMs: number;
}

/** The step's beat, counted from the metronome's start. */
const beatOf = (count: Count, beatsPerBar: number, subdivision: number) =>
  count.bar * beatsPerBar + Math.floor(count.index / subdivision);

function readBeat(coach: Coach, prev: Beat): Beat {
  const { beatsPerBar, subdivision } = coach.countSettings;
  const counts = coach.live.counts;
  const now = performance.now() + PAINT_LOOKAHEAD_MS;
  const count = coach.counting ? currentCount(counts, now) : null;
  if (!count) return prev.number === null && prev.beatsPerBar === beatsPerBar ? prev : { ...prev, number: null, beatsPerBar };
  const number = beatOf(count, beatsPerBar, subdivision);
  if (number === prev.number && beatsPerBar === prev.beatsPerBar) return prev;
  // The beat's length: from this beat's first step to the next beat's, once it's scheduled.
  const start = counts.find((c) => beatOf(c, beatsPerBar, subdivision) === number);
  const next = counts.find((c) => beatOf(c, beatsPerBar, subdivision) === number + 1);
  const beatMs = start && next ? next.time - start.time : prev.beatMs;
  return { number, inBar: Math.floor(count.index / subdivision), beatsPerBar, beatMs };
}

/**
 * A small metronome over the kit view: a pendulum that swings from side to
 * side, reaching each end on a click, and a dot per beat of the bar (the
 * current one lit, beat 1 bigger). Follows the scheduler's counts, like the
 * side panel's live count, so it moves exactly with what's heard. Decorative
 * for screen readers: the side panel's count carries it. The kit view reads
 * its height (through `ref`) to leave room above the kit.
 */
export function SmallMetronome({ coach, ref }: { coach: Coach; ref?: Ref<HTMLDivElement> }) {
  const [beat, setBeat] = useState<Beat>(() => ({
    number: null,
    inBar: 0,
    beatsPerBar: coach.countSettings.beatsPerBar,
    beatMs: DEFAULT_BEAT_MS,
  }));
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setBeat((prev) => readBeat(coach, prev));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [coach]);

  // On each beat the arm sets off for the side it reaches on the next click, taking one beat to get there.
  const side = (beat.number ?? 0) % 2 === 0 ? 1 : -1;
  const armStyle = useMemo(
    () => ({ transform: `rotate(${side * 24}deg)`, transitionDuration: `${Math.round(beat.beatMs)}ms` }),
    [side, beat.beatMs],
  );
  if (beat.number === null) return null;
  return (
    <div ref={ref} className="small-metronome" aria-hidden>
      <svg className="small-metronome-body" viewBox="0 0 28 32">
        <path className="small-metronome-case" d="M9 2 H19 L26 30 H2 Z" />
        <line
          className="small-metronome-arm"
          x1="14"
          y1="26"
          x2="14"
          y2="6"
          style={armStyle}
        />
      </svg>
      <ol className="small-metronome-beats">
        {Array.from({ length: beat.beatsPerBar }, (_, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- a fixed bar of beats, never reordered
          <li key={i} className={[i === beat.inBar ? "now" : "", i === 0 ? "one" : ""].filter(Boolean).join(" ")} />
        ))}
      </ol>
    </div>
  );
}
