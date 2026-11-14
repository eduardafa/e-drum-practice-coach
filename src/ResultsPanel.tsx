import { heatmap } from "./history/heatmap";
import type { SessionRecord } from "./history/record";
import { NITRO_MAX_PADS } from "./kit/nitroMax";
import { PadHeatmap } from "./PadHeatmap";
import { pathAdvice } from "./exercises/path";
import { mirrorText } from "./handedness";
import { useHandedness } from "./HandednessContext";
import { hihatTips } from "./playalong/hihatTips";
import type { Exercise } from "./exercises/types";
import { DEFAULT_PASS_MARK } from "./playalong/trainer";
import { extraBreakdown, type AccuracyMode, type SessionResults } from "./playalong/results";
import { releasing } from "./releasing";
import { formatDelta } from "./render/kitRenderer";

interface Props {
  exercise: Exercise;
  results: SessionResults;
  mode: AccuracyMode;
  bpm: number;
  loops: number;
  /** This session as saved to history, for the pad heatmap. */
  record: SessionRecord | null;
  onRetry: (tempoChange: number) => void;
  /** Starts the next exercise on the First steps path. */
  onNext: (next: Exercise) => void;
  onClose: () => void;
}

const MODE_LABEL: Record<AccuracyMode, string> = { partial: "partial credit", strict: "strict" };

/** Rounded down, so 100% only ever means a perfect run. */
function percent(value: number | null): string {
  return value === null ? "—" : `${Math.floor(value * 100)}%`;
}

function padName(pad: string): string {
  return NITRO_MAX_PADS.find((p) => p.id === pad)?.label ?? pad;
}

/** A plain-words reading of an average timing, for a beginner. */
function tendency(meanMs: number | null): string {
  if (meanMs === null) return "";
  if (Math.abs(meanMs) < 5) return "right on the click";
  return meanMs < 0 ? "a little early" : "a little late";
}

/** The end-of-session screen: accuracy, what happened to the notes, and how each pad went. */
export function ResultsPanel({ exercise, results, mode, bpm, loops, record, onRetry, onNext, onClose }: Props) {
  const other: AccuracyMode = mode === "partial" ? "strict" : "partial";
  // The same pass mark the tempo trainer speeds up at.
  const advice = pathAdvice(exercise, results.accuracy[mode], DEFAULT_PASS_MARK);
  const handedness = useHandedness();
  const hihat = hihatTips(results.hihat).map((tip) => mirrorText(tip, handedness));
  return (
    <section className="calibration results" aria-labelledby="results-title">
      <h2 id="results-title">
        {exercise.name} · {bpm} BPM · {loops} loops
      </h2>
      <p className="results-score">{percent(results.accuracy[mode])}</p>
      <p className="calibration-meta">
        Accuracy ({MODE_LABEL[mode]}). {MODE_LABEL[other][0].toUpperCase() + MODE_LABEL[other].slice(1)}:{" "}
        {percent(results.accuracy[other])}.
      </p>

      <dl className="stats">
        <dt>On time</dt>
        <dd>
          {results.onTime} of {results.notes}
        </dd>
        <dt>Early / late</dt>
        <dd>
          {results.early} / {results.late}
        </dd>
        <dt>Missed</dt>
        <dd>{results.missed}</dd>
        <dt>Extra hits</dt>
        <dd>
          {results.extra}
          {results.extra > 0 && <span className="extra-reasons">: {extraBreakdown(results).join(", ")}</span>}
        </dd>
        <dt>Average</dt>
        <dd>
          {results.meanDeltaMs === null ? "—" : `${formatDelta(results.meanDeltaMs)} (${tendency(results.meanDeltaMs)})`}
        </dd>
        <dt>Consistency</dt>
        <dd>{results.spreadMs === null ? "—" : `±${results.spreadMs.toFixed(0)} ms`}</dd>
      </dl>

      <table className="pad-results">
        <thead>
          <tr>
            <th scope="col">Pad</th>
            <th scope="col">On time</th>
            <th scope="col">Missed</th>
            <th scope="col">Average</th>
          </tr>
        </thead>
        <tbody>
          {results.pads.map((p) => (
            <tr key={p.pad}>
              <th scope="row">{padName(p.pad)}</th>
              <td>
                {p.onTime}/{p.notes}
              </td>
              <td>{p.missed}</td>
              <td>{p.meanDeltaMs === null ? "—" : formatDelta(p.meanDeltaMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {record && (
        <details className="results-heatmap">
          <summary>Pad heatmap: how often and how hard</summary>
          <PadHeatmap heat={heatmap([record])} scope="this session" />
        </details>
      )}

      {hihat.map((tip) => (
        <p key={tip} className="hihat-tip">
          {tip}
        </p>
      ))}

      {advice?.kind === "ready" && (
        <p className="path-advice ready">
          That clears {percent(DEFAULT_PASS_MARK)}: you're ready for <strong>{advice.next.name}</strong>.
        </p>
      )}
      {advice?.kind === "notYet" && (
        <p className="path-advice">
          Reach {percent(advice.passMark)} to move on to <strong>{advice.next.name}</strong>. Slower is fine: try 5 BPM
          slower if it feels rushed.
        </p>
      )}

      <div className="calibration-actions">
        {advice?.kind === "ready" && (
          <button className="primary" onClick={releasing(() => onNext(advice.next))}>
            Next: {advice.next.name}
          </button>
        )}
        <button className={advice?.kind === "ready" ? "secondary" : "primary"} onClick={releasing(() => onRetry(0))}>
          Play again
        </button>
        <button className="secondary" onClick={releasing(() => onRetry(-5))}>
          5 BPM slower
        </button>
        <button className="secondary" onClick={releasing(() => onRetry(5))}>
          5 BPM faster
        </button>
        <button className="secondary" onClick={releasing(onClose)}>
          Close
        </button>
      </div>
      <p className="hint">
        {mode === "partial"
          ? "Partial credit: full marks inside your on-time window, less the further off a hit is. Extra hits count against you."
          : "Strict: only on-time notes count. Extra hits count against you."}{" "}
        A late hit still counts for its note, as late, up to {results.reachMs} ms behind at your skill level (or halfway
        to the next note on that drum); later than that it's an extra hit and the note is missed. Change the scoring in
        Settings.
      </p>
    </section>
  );
}
