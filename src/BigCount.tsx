import type { Ref } from "react";
import { barCounts } from "./live/counts";
import type { Coach } from "./live/coach";
import { useLiveCount } from "./LiveCount";

/**
 * The count being heard ("1 & 2 & 3 & 4 &"), large across the top of the kit
 * view so it can be read from the drum throne. Same scheduler-driven counts
 * as the side panel's live count, so it moves exactly with the clicks. The
 * current count is filled; beat numbers are bigger than the "&"s, beat 1 the
 * most. Decorative for screen readers: the side panel's count carries it.
 * The kit view reads its height (through `ref`) to leave room above the kit.
 */
export function BigCount({ coach, ref }: { coach: Coach; ref?: Ref<HTMLOListElement> }) {
  const { index, beatsPerBar, subdivision } = useLiveCount(coach);
  if (index === null) return null;
  const labels = barCounts(beatsPerBar, subdivision);
  return (
    <ol ref={ref} className={`big-count ${labels.length > 12 ? "dense" : ""}`} aria-hidden>
      {labels.map((label, i) => (
        <li
          // oxlint-disable-next-line react/no-array-index-key -- a fixed bar of counts, never reordered
          key={i}
          className={[i === index ? "now" : "", /^\d+$/.test(label) ? "beat" : "sub", i === 0 ? "one" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}
