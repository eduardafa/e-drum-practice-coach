import { useEffect, useState } from "react";
import type { Coach } from "./live/coach";

/**
 * The get-ready countdown, large over the kit view so it can be read from the
 * drum throne. Follows the coach every animation frame, so each number appears
 * with its beep rather than up to a polling interval later. Clicks pass
 * through it, so Stop stays usable.
 */
export function GetReady({ coach }: { coach: Coach }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setCount(coach.countdownAt(performance.now()));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [coach]);

  if (count === null) return null;
  return (
    <output className="get-ready" aria-live="assertive">
      <span className="get-ready-label">Get ready</span>
      <span className="get-ready-count">{count}</span>
      <span className="get-ready-label">{coach.playingAlong ? "then the song starts" : "then one bar of count-in"}</span>
    </output>
  );
}
