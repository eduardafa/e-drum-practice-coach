import { useMemo } from "react";
import { findExercise } from "./exercises/library";
import type { SessionRecord } from "./history/record";
import { apartHits, apartTip } from "./history/together";

interface Props {
  record: SessionRecord;
}

/**
 * Hits written together (EDU-139): when two drums written on the same beat
 * keep landing apart, say which one comes late and by about how much. Shown
 * on the results screen and in a session opened from History; nothing when
 * they land together.
 */
export function TogetherNote({ record }: Props) {
  const result = useMemo(() => {
    const exercise = findExercise(record.exerciseId);
    return exercise ? apartHits(record, exercise.notes.map((n) => n.tick)) : null;
  }, [record]);
  if (!result) return null;
  return (
    <section className="together-note" aria-labelledby={`together-${record.id}`}>
      <h3 id={`together-${record.id}`}>Hits that should land together</h3>
      <p>{apartTip(result)}</p>
      <p className="hint">
        Each hit can still be on time, so this doesn't change your score, but at this gap you hear two hits instead of one.
      </p>
    </section>
  );
}
