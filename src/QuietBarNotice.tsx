import { useEffect, useState } from "react";
import type { Coach } from "./live/coach";

/** Looks one frame ahead, so the notice appears with the bar (as the live count does). */
const PAINT_LOOKAHEAD_MS = 16;

/**
 * Over the kit view during a quiet bar (EDU-145): says the click stopped on
 * purpose, so a beginner keeps playing instead of thinking it broke. Follows
 * the coach every animation frame, like the get-ready countdown.
 */
export function QuietBarNotice({ coach }: { coach: Coach }) {
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setQuiet(coach.quietAt(performance.now() + PAINT_LOOKAHEAD_MS));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [coach]);

  return (
    <output className="quiet-bar" aria-live="polite" hidden={!quiet}>
      {quiet && (
        <>
          <strong>Keep going</strong> The click is quiet for this bar. It comes back on the next 1.
        </>
      )}
    </output>
  );
}
