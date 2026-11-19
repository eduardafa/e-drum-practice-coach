import { useEffect, useMemo, useRef, useState } from "react";
import type { Exercise } from "./exercises/types";
import { NOTATION_GUIDE, type NotationGuidePage } from "./guide/notationGuide";
import { displayedExercise } from "./handedness";
import { useHandedness } from "./HandednessContext";
import type { StaffLayout } from "./notation/layout";

interface Props {
  /** The example being heard (a page's example id), or null. */
  previewingId: string | null;
  onPreview: (exercise: Exercise, bpm: number) => void;
  onStopPreview: () => void;
  /** Chooses the first exercise of First steps and closes the guide. */
  onTry: () => void;
  onClose: () => void;
}

/**
 * "How to read drum notation": one idea per page (the staff, counting, rests,
 * the marks), each with a small example engraved like the exercises and,
 * where it helps, a Listen button. Back and Next page through; the last page
 * offers First steps, step 1. Drum keys are off while it's open (App), so
 * Tab, Enter and Space work its buttons; Esc closes it.
 */
export function NotationGuide({ previewingId, onPreview, onStopPreview, onTry, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const page = NOTATION_GUIDE[index] ?? NOTATION_GUIDE[0];
  const last = index === NOTATION_GUIDE.length - 1;
  /** One button moves forward (Next, then Try Step 1 on the last page), so it keeps focus as the pages turn. */
  const forwardRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const handedness = useHandedness();
  const example = useMemo(() => displayedExercise(page.example, handedness), [page, handedness]);
  const previewing = previewingId === page.example.id;

  // Like a dialog: focus moves in on open, and back to where it was on close.
  useEffect(() => {
    const before = document.activeElement;
    forwardRef.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  const go = (to: number) => {
    if (previewingId !== null) onStopPreview();
    refocus.current = to === 0;
    setIndex(to);
  };

  // Back disappears on the first page: when it was the button pressed, focus moves on to Next.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    forwardRef.current?.focus();
  });

  return (
    <section className="overlay notation-guide" aria-labelledby="notation-guide-title">
      <div className="overlay-header">
        <h2 id="notation-guide-title">How to read drum notation</h2>
        <button className="secondary" onClick={onClose} aria-label="Close the notation guide">
          Close <kbd>Esc</kbd>
        </button>
      </div>
      <p className="notation-guide-progress" aria-live="polite">
        Page {index + 1} of {NOTATION_GUIDE.length}
      </p>
      <GuidePage page={page} example={example} />
      {page.listen && (
        <div className="calibration-actions">
          <button
            className="secondary"
            aria-label={previewing ? "Stop the example" : `Listen to the example at ${page.example.tempo.suggested} BPM`}
            onClick={() => (previewing ? onStopPreview() : onPreview(example, page.example.tempo.suggested))}
          >
            {previewing ? "■ Stop" : `▶ Listen · ${page.example.tempo.suggested} BPM`}
          </button>
        </div>
      )}
      <div className="notation-guide-nav">
        {index > 0 && (
          <button className="secondary" onClick={() => go(index - 1)}>
            Back
          </button>
        )}
        <button ref={forwardRef} className="primary" onClick={last ? onTry : () => go(index + 1)}>
          {last ? "Try Step 1" : "Next"}
        </button>
      </div>
      {last && <p className="hint">Step 1 of First steps is the hi-hat on every click: four quarter notes, one per click.</p>}
    </section>
  );
}

function GuidePage({ page, example }: { page: NotationGuidePage; example: Exercise }) {
  return (
    <div className="notation-guide-page">
      <h3>{page.title}</h3>
      {page.text.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <GuideStaff exercise={example} />
      {page.count && (
        <p className="notation-guide-count">
          Count: <strong>{page.count}</strong>
        </p>
      )}
    </div>
  );
}

/** The page's example, engraved like the exercises (VexFlow is loaded on first use). */
function GuideStaff({ exercise }: { exercise: Exercise }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<StaffLayout | null>(null);
  const [failed, setFailed] = useState(false);
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
        console.error(error);
        if (!canceled) setFailed(true);
      }
    })();
    return () => {
      canceled = true;
      setLayout(null);
      setFailed(false);
    };
  }, [exercise]);

  return (
    <>
      <div className="notation-score notation-guide-score" style={scoreStyle} aria-hidden>
        <div ref={hostRef} />
      </div>
      {failed && <p className="hint warn-note">The example couldn't be drawn.</p>}
    </>
  );
}
