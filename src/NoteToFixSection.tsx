import { useEffect, useMemo, useRef, useState } from "react";
import { findExercise } from "./exercises/library";
import type { Exercise } from "./exercises/types";
import { displayedExercise } from "./handedness";
import { useHandedness } from "./HandednessContext";
import { noteToFix, noteToFixHeadline, noteToFixTip, type NoteToFix } from "./history/noteToFix";
import type { SessionRecord } from "./history/record";
import type { StaffLayout } from "./notation/layout";

interface Props {
  record: SessionRecord;
}

/**
 * The one note to fix (EDU-138): when the same note went wrong the same way
 * most loops, say which, where it's written, and one thing to try, with the
 * note ringed on a small copy of the notation. Shown on the results screen
 * and in a session opened from History; nothing when no note stands out.
 */
export function NoteToFixSection({ record }: Props) {
  const handedness = useHandedness();
  const found = useMemo(() => {
    const exercise = findExercise(record.exerciseId);
    if (!exercise) return null;
    const fix = noteToFix(record, exercise);
    return fix && { fix, exercise: displayedExercise(exercise, handedness) };
  }, [record, handedness]);
  if (!found) return null;
  return (
    <section className="note-to-fix" aria-labelledby={`fix-${record.id}`}>
      <h3 id={`fix-${record.id}`}>What to work on</h3>
      <p className="note-to-fix-headline">{noteToFixHeadline(found.fix)}</p>
      <p>{noteToFixTip(found.fix)}</p>
      <RingedNotation exercise={found.exercise} fix={found.fix} />
    </section>
  );
}

/** The exercise's notation with the notes to fix ringed in their problem's color (late, early, missed). */
function RingedNotation({ exercise, fix }: { exercise: Exercise; fix: NoteToFix }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<StaffLayout | null>(null);
  const scoreStyle = useMemo(() => ({ maxWidth: layout?.width }), [layout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let canceled = false;
    void (async () => {
      try {
        const engraver = await import("./notation/engrave");
        await engraver.loadNotationFonts();
        if (!canceled) setLayout(engraver.engraveExercise(exercise, host));
      } catch (error) {
        // The sentence above still says which note; the picture is a bonus.
        console.error(error);
      }
    })();
    return () => {
      canceled = true;
      setLayout(null);
    };
  }, [exercise]);

  useEffect(() => {
    const host = hostRef.current;
    const layer = marksRef.current;
    if (!layout || !host || !layer) return;
    const wanted = new Set(fix.indexes);
    const rings = layout.marks
      .filter((m) => wanted.has(m.index))
      .map((m) => {
        const el = document.createElement("div");
        el.className = `mark ${fix.problem}`;
        layer.append(el);
        return { x: m.x, y: m.y, el };
      });
    // The staff is scaled by CSS to fit; the rings follow the same scale.
    const place = () => {
      const scale = host.clientWidth / layout.width;
      layer.style.setProperty("--staff-scale", String(scale));
      for (const r of rings) {
        r.el.style.left = `${r.x * scale}px`;
        r.el.style.top = `${r.y * scale}px`;
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(host);
    return () => {
      observer.disconnect();
      layer.replaceChildren();
    };
  }, [layout, fix]);

  return (
    <div className="notation-score note-to-fix-score" style={scoreStyle} aria-hidden>
      <div ref={hostRef} />
      <div ref={marksRef} className="marks" />
    </div>
  );
}
