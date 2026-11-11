import { useEffect, useState } from "react";
import type { Subdivision } from "./audio/schedule";
import type { Coach } from "./live/coach";
import { barCounts, currentCount } from "./live/counts";

export interface LiveCountState {
  /** Position in the bar being heard, or null when the metronome is stopped. */
  index: number | null;
  beatsPerBar: number;
  subdivision: Subdivision;
}

/**
 * How far ahead to look, in ms. A highlight chosen during one animation frame
 * is painted about a frame later; looking one frame (~16 ms) ahead lands the
 * paint on the click instead of just after it (measured: ~25 ms late without).
 */
const PAINT_LOOKAHEAD_MS = 16;

function readLiveCount(coach: Coach): LiveCountState {
  const { beatsPerBar, subdivision } = coach.metronome.currentSettings;
  const now = performance.now() + PAINT_LOOKAHEAD_MS;
  const index = coach.metronome.running ? (currentCount(coach.live.counts, now)?.index ?? null) : null;
  return { index, beatsPerBar, subdivision };
}

/**
 * Follows the count being heard. Reads the scheduled counts every animation
 * frame and only re-renders when the count changes, so the highlight moves
 * exactly with the clicks.
 */
export function useLiveCount(coach: Coach): LiveCountState {
  const [state, setState] = useState(() => readLiveCount(coach));
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const next = readLiveCount(coach);
      setState((prev) =>
        prev.index === next.index && prev.beatsPerBar === next.beatsPerBar && prev.subdivision === next.subdivision
          ? prev
          : next,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [coach]);
  return state;
}

/** "1 & 2 & 3 & 4 &" with the count being heard highlighted. */
export function LiveCount({ coach }: { coach: Coach }) {
  const { index, beatsPerBar, subdivision } = useLiveCount(coach);
  const labels = barCounts(beatsPerBar, subdivision);
  return (
    // Long bars (e.g. 7/4 in sixteenths) get smaller cells, so the count stays a few rows tall.
    <ol className={`live-count ${labels.length > 16 ? "dense" : ""}`} aria-label="Count">
      {labels.map((label, i) => (
        <li
          // oxlint-disable-next-line react/no-array-index-key -- a fixed bar of counts, never reordered
          key={i}
          className={`${i === index ? "now" : ""} ${/^\d+$/.test(label) ? "beat" : "sub"}`}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}
