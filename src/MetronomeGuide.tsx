import { useState } from "react";
import type { MetronomeSettings } from "./audio/schedule";
import { GUIDE_COUNTS, GUIDE_START_BPM, METRONOME_GUIDE, type GuideStep } from "./guide/metronomeGuide";
import type { Coach } from "./live/coach";
import { LiveCount, useLiveCount } from "./LiveCount";
import { releasing } from "./releasing";

interface Props {
  coach: Coach;
  running: boolean;
  /** Show "The basics" expanded: on the first visit only, so the steps stay in view afterwards. */
  basicsOpen: boolean;
  onApply: (settings: MetronomeSettings) => void;
  onToggleMetronome: () => void;
  onClose: () => void;
}

export function MetronomeGuide({ coach, running, basicsOpen, onApply, onToggleMetronome, onClose }: Props) {
  const [stepId, setStepId] = useState(METRONOME_GUIDE[0].id);
  const step = METRONOME_GUIDE.find((s) => s.id === stepId) ?? METRONOME_GUIDE[0];

  return (
    <section className="guide" aria-labelledby="guide-title">
      <div className="guide-header">
        <h2 id="guide-title">How to play with the metronome</h2>
        <button className="secondary" onClick={releasing(onClose)} aria-label="Close the guide">
          Close
        </button>
      </div>

      <details className="guide-basics" open={basicsOpen}>
        <summary>The basics</summary>
        <p>
          <strong>Tempo</strong> is how fast the music goes, in <strong>BPM</strong> (beats per minute). Each click is
          one <strong>beat</strong>: at {GUIDE_START_BPM} BPM, one click per second.
        </p>
        <p>
          Music is usually counted in groups of four: <strong>1, 2, 3, 4</strong>. Halfway between two clicks is the{" "}
          <strong>"&"</strong> (say "and"), so you count <strong>1 & 2 & 3 & 4 &</strong>.
        </p>
        <p>
          A beat like the money beat has no single right tempo. Start slow, at {GUIDE_START_BPM}, and go up 4 or 5 BPM
          when it feels steady.
        </p>
        <p className="hint">
          Calibration is different: there you hit one pad, once per click, with nothing in between.
        </p>
      </details>

      <fieldset className="guide-steps">
        <legend className="visually-hidden">Steps</legend>
        {METRONOME_GUIDE.map((s) => (
          <button
            key={s.id}
            className={`secondary ${s.id === step.id ? "selected" : ""}`}
            aria-pressed={s.id === step.id}
            onClick={releasing(() => setStepId(s.id))}
          >
            {s.title.split(". ")[0]}
          </button>
        ))}
      </fieldset>

      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <PatternGrid coach={coach} step={step} />

      <div className="calibration-actions">
        <button className="primary" onClick={releasing(() => onApply(step.metronome))}>
          Set up the metronome
        </button>
        <button className="secondary" onClick={releasing(onToggleMetronome)}>
          {running ? "Stop" : "Start"}
        </button>
      </div>
      <p className="hint">
        "Set up" sets {step.metronome.bpm} BPM,{" "}
        {step.metronome.subdivision === 2 ? "scoring every \"&\", with soft clicks on them" : "scoring the beats"}. Your
        skill level and latency offset don't change.
      </p>
      <p className="hint">
        To have each step scored note by note, open the exercise library and play the <strong>First steps</strong>{" "}
        exercises in order.
      </p>
      {running && <LiveCount coach={coach} />}
    </section>
  );
}

/** One bar of the step's pattern, with the count being heard highlighted. */
function PatternGrid({ coach, step }: { coach: Coach; step: GuideStep }) {
  const live = useLiveCount(coach);
  // The grid shows eighth notes. Map the live position onto it when the
  // metronome is counting quarters or eighths in 4/4.
  const column =
    live.index === null || live.beatsPerBar !== 4
      ? null
      : live.subdivision === 2
        ? live.index
        : live.subdivision === 1
          ? live.index * 2
          : null;
  const clicks = GUIDE_COUNTS.map((_, i) => (i % 2 === 0 ? "●" : step.metronome.clickSubdivisions ? "·" : ""));
  return (
    <div className="table-scroll">
      <table className="pattern-grid">
        <thead>
          <tr>
            <th scope="col">Count</th>
            {GUIDE_COUNTS.map((c, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- fixed columns
              <th key={i} scope="col" className={i === column ? "now" : ""}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {step.lanes.map((lane) => (
            <tr key={lane.label}>
              <th scope="row">{lane.label}</th>
              {lane.pattern.split("").map((c, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- fixed columns
                <td key={i} className={i === column ? "now" : ""}>
                  {c === "x" ? "✕" : ""}
                </td>
              ))}
            </tr>
          ))}
          <tr className="clicks">
            <th scope="row">Click</th>
            {clicks.map((c, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- fixed columns
              <td key={i} className={i === column ? "now" : ""}>
                {c}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
