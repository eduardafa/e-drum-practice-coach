import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FIRST_STEPS } from "./exercises/library";
import type { Exercise } from "./exercises/types";
import { mirrorText } from "./handedness";
import { useHandedness } from "./HandednessContext";
import type { PadId } from "./kit/nitroMax";
import { tourPad, type KitTour, type TourFeedback } from "./live/kitTour";
import type { StaffLayout } from "./notation/layout";
import { releasing } from "./releasing";

interface Props {
  tour: KitTour;
  /** Called once, when the quiz is finished. */
  onFinished: () => void;
  onNext: (next: Exercise) => void;
  onAgain: () => void;
  onClose: () => void;
}

function feedbackText(feedback: TourFeedback | null, phase: KitTour["phase"]): string | null {
  if (!feedback) return null;
  if (feedback.kind === "right") return `Yes, that's the ${tourPad(feedback.pad).said}.`;
  const hit = feedback.hit === null ? "a pad the app doesn't know" : `the ${tourPad(feedback.hit).said}`;
  const asked = tourPad(feedback.asked).said;
  return phase === "tour" ? `That was ${hit}. Find the ${asked}: it's lit up.` : `That was ${hit}. The ${asked} is lit up now.`;
}

/**
 * "Meet your kit" (EDU-141), step 0 of First steps: each pad lit on the kit
 * view in turn, with its name, what it's for and how it's written, then a
 * short quiz where the app names a drum and the drummer finds it.
 */
export function KitTourPanel({ tour, onFinished, onNext, onAgain, onClose }: Props) {
  // Re-render on every hit the tour takes.
  useSyncExternalStore(
    (cb) => tour.subscribe(cb),
    () => tour.version,
  );
  const handedness = useHandedness();
  const { phase, current, progress, feedback } = tour;
  const finishedRef = useRef(false);
  useEffect(() => {
    if (phase === "done" && !finishedRef.current) {
      finishedRef.current = true;
      onFinished();
    }
  }, [phase, onFinished]);

  const step1 = FIRST_STEPS[0];
  const message = feedbackText(feedback, phase);

  if (phase === "done" || !current) {
    const { right, of } = tour.score;
    return (
      <section className="calibration kit-tour" aria-labelledby="kit-tour-title">
        <h2 id="kit-tour-title">Meet your kit · done</h2>
        <p className="results-score">
          {right} of {of}
        </p>
        <p className="calibration-meta">drums found on the first try.</p>
        <p className="path-advice ready">
          {right === of
            ? "You know your kit. Next, your first rhythm: the hi-hat on every click."
            : "Nearly there: the names come with practice. Next, your first rhythm: the hi-hat on every click."}
        </p>
        <div className="calibration-actions">
          {step1 && (
            <button className="primary" onClick={releasing(() => onNext(step1))}>
              Next: {step1.name}
            </button>
          )}
          <button className="secondary" onClick={releasing(onAgain)}>
            Take the tour again
          </button>
          <button className="secondary" onClick={releasing(onClose)}>
            Close
          </button>
        </div>
      </section>
    );
  }

  const pad = tourPad(current);
  return (
    <section className="calibration kit-tour" aria-labelledby="kit-tour-title">
      <h2 id="kit-tour-title">Meet your kit</h2>
      <p className="calibration-meta">
        {phase === "tour" ? `Pad ${progress.at} of ${progress.of}` : `Quiz · ${progress.at} of ${progress.of}`}
      </p>
      {phase === "tour" ? (
        <>
          <p className="kit-tour-name">{pad.name}</p>
          <p>{mirrorText(pad.role, handedness)}</p>
          <p className="hint">Hit it: it glows on the kit below.</p>
        </>
      ) : (
        <>
          <p className="kit-tour-name">Hit the {pad.said}</p>
          <p className="hint">Nothing is lit this time: find it yourself. A wrong hit lights it up.</p>
        </>
      )}
      <PadStaff pad={current} />
      <output className={`kit-tour-feedback ${feedback?.kind ?? ""}`} aria-live="polite">
        {message}
      </output>
      <div className="calibration-actions">
        {phase === "tour" && (
          <button className="secondary" onClick={releasing(() => tour.skip())}>
            Skip (my kit doesn't have this)
          </button>
        )}
        <button className="secondary" onClick={releasing(onClose)}>
          Cancel
        </button>
      </div>
    </section>
  );
}

/** One note on `pad`, to show where that drum is written on the staff. */
function padExercise(pad: PadId): Exercise {
  return {
    id: `tour-${pad}`,
    name: tourPad(pad).name,
    category: "first-steps",
    description: "",
    timeSignature: { beats: 4, unit: 4 },
    bars: 1,
    tempo: { min: 40, suggested: 60, max: 100 },
    notes: [{ tick: 0, pad, dynamic: "normal" }],
  };
}

/** How the pad is written: one quarter note on a one-bar staff. */
function PadStaff({ pad }: { pad: PadId }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<StaffLayout | null>(null);
  const exercise = useMemo(() => padExercise(pad), [pad]);
  // Its engraved size: one note needs no more.
  const style = useMemo(() => ({ maxWidth: layout?.width }), [layout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let canceled = false;
    void (async () => {
      try {
        const engraver = await import("./notation/engrave");
        await engraver.loadNotationFonts();
        if (!canceled) setLayout(engraver.engraveExercise(exercise, host, 180));
      } catch (error) {
        // The name and the lit pad still say which drum it is.
        console.error(error);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [exercise]);

  return (
    <figure className="kit-tour-staff">
      <figcaption>Written like this:</figcaption>
      <div className="notation-score" style={style} aria-hidden>
        <div ref={hostRef} />
      </div>
    </figure>
  );
}
