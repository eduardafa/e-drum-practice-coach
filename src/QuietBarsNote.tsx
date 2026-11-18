import { useMemo } from "react";
import { findExercise } from "./exercises/library";
import { quietBarsResult, quietBarsText, suggestQuietBars } from "./history/quietBars";
import type { SessionRecord } from "./history/record";
import { quietEveryLabel } from "./playalong/quietBars";
import { DEFAULT_PASS_MARK } from "./playalong/trainer";

interface Props {
  record: SessionRecord;
  /**
   * The session's accuracy, on the results screen only: a good run late in
   * First steps (at the Next button's pass mark), with the click on every bar,
   * suggests trying quiet bars next.
   */
  accuracy?: number | null;
}

/**
 * Keeping time on your own (EDU-145): after a session where the click went
 * quiet for a bar, say whether the drummer sped up, slowed down or kept time
 * in those bars. Shown on the results screen and in a session opened from
 * History.
 */
export function QuietBarsNote({ record, accuracy }: Props) {
  const result = useMemo(() => {
    const exercise = findExercise(record.exerciseId);
    return exercise ? quietBarsResult(record, exercise) : null;
  }, [record]);
  const titleId = `quiet-${record.id}`;
  if (result) {
    return (
      <section className="quiet-bars-note" aria-labelledby={titleId}>
        <h3 id={titleId}>Without the click</h3>
        <p>{quietBarsText(result)}</p>
      </section>
    );
  }
  if (accuracy !== undefined && suggestQuietBars(record, accuracy, DEFAULT_PASS_MARK)) {
    return (
      <section className="quiet-bars-note" aria-labelledby={titleId}>
        <h3 id={titleId}>Next skill: keep time on your own</h3>
        <p>
          Next to Play along, change "{quietEveryLabel(0)}" to "{quietEveryLabel(4)}". The click goes quiet for one bar;
          keep playing and counting, and it comes back on the next bar.
        </p>
      </section>
    );
  }
  return null;
}
