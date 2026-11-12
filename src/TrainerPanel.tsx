import { useState } from "react";
import type { Exercise } from "./exercises/types";
import {
  DEFAULT_FAIL_MARK,
  DEFAULT_PASS_MARK,
  DEFAULT_STEP,
  normalizeConfig,
  type RoundRecord,
  type TrainerConfig,
} from "./playalong/trainer";
import { releasing } from "./releasing";

/** Where the trainer is: choosing settings, between rounds, or finished. Rounds themselves show no panel. */
export type TrainerStage =
  | { kind: "setup" }
  | { kind: "between"; nextBpm: number }
  | { kind: "finished"; reason: "target" | "stopped" };

interface Props {
  exercise: Exercise;
  stage: TrainerStage;
  config: TrainerConfig | null;
  rounds: readonly RoundRecord[];
  onStart: (config: TrainerConfig) => void;
  onStop: () => void;
  onClose: () => void;
}

const OUTCOME_TEXT: Record<RoundRecord["outcome"], string> = {
  up: "speeding up",
  down: "slowing down",
  stay: "same tempo again",
  done: "target reached",
};

const pct = (value: number) => `${Math.floor(value * 100)}%`;

/** The default target: the suggested tempo, or the maximum if the exercise starts there. */
function defaultConfig(exercise: Exercise): TrainerConfig {
  const { min, suggested, max } = exercise.tempo;
  return {
    startBpm: min,
    targetBpm: suggested > min ? suggested : max,
    passMark: DEFAULT_PASS_MARK,
    failMark: DEFAULT_FAIL_MARK,
    step: DEFAULT_STEP,
  };
}

/** Setup, between-round and final screens of the tempo trainer. */
export function TrainerPanel({ exercise, stage, config, rounds, onStart, onStop, onClose }: Props) {
  const last = rounds.at(-1);
  return (
    <section className="calibration trainer" aria-labelledby="trainer-title">
      <h2 id="trainer-title">Tempo trainer · {exercise.name}</h2>
      {stage.kind === "setup" && <TrainerSetup exercise={exercise} onStart={onStart} onClose={onClose} />}

      {stage.kind === "between" && last && config && (
        <>
          <p className="calibration-headline">
            Round {rounds.length}: {pct(last.accuracy)}, {OUTCOME_TEXT[last.outcome]}.
          </p>
          <p>
            Next round at <strong>{stage.nextBpm} BPM</strong>. Listen to the count-in, then play.
          </p>
          <TempoChart rounds={rounds} config={config} />
          <div className="calibration-actions">
            <button className="secondary" onClick={releasing(onStop)}>
              Stop the trainer
            </button>
          </div>
        </>
      )}

      {stage.kind === "finished" && config && (
        <>
          <p className="calibration-headline">
            {stage.reason === "target"
              ? `You reached ${config.targetBpm} BPM!`
              : rounds.length
                ? `Stopped at ${last?.bpm ?? config.startBpm} BPM.`
                : "Stopped before the first round finished."}
          </p>
          {rounds.length > 0 && (
            <>
              <p className="calibration-meta">
                {rounds.length} {rounds.length === 1 ? "round" : "rounds"}, from {config.startBpm} BPM.
              </p>
              <TempoChart rounds={rounds} config={config} />
            </>
          )}
          <div className="calibration-actions">
            <button className="secondary" onClick={releasing(onClose)}>
              Close
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function TrainerSetup({
  exercise,
  onStart,
  onClose,
}: {
  exercise: Exercise;
  onStart: (config: TrainerConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => defaultConfig(exercise));
  const set = (patch: Partial<TrainerConfig>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <>
      <p>
        Play in rounds. After each one the tempo goes up if you scored at least the pass mark, down if you
        scored below the slow-down mark, and otherwise stays, until you pass a round at the target.
      </p>
      <label className="field">
        <span>Start</span>
        <input type="number" className="num" value={draft.startBpm} onChange={(e) => set({ startBpm: Number(e.target.value) })} />
        <span className="unit">BPM</span>
      </label>
      <label className="field">
        <span>Target</span>
        <input type="number" className="num" value={draft.targetBpm} onChange={(e) => set({ targetBpm: Number(e.target.value) })} />
        <span className="unit">BPM</span>
      </label>
      <label className="field">
        <span>Step</span>
        <input type="number" className="num" value={draft.step} onChange={(e) => set({ step: Number(e.target.value) })} />
        <span className="unit">BPM</span>
      </label>
      <label className="field">
        <span>Pass mark</span>
        <input
          type="number"
          className="num"
          value={Math.round(draft.passMark * 100)}
          onChange={(e) => set({ passMark: Number(e.target.value) / 100 })}
        />
        <span className="unit">% to speed up</span>
      </label>
      <label className="field">
        <span>Slow-down mark</span>
        <input
          type="number"
          className="num"
          value={Math.round(draft.failMark * 100)}
          onChange={(e) => set({ failMark: Number(e.target.value) / 100 })}
        />
        <span className="unit">% · below this slows down</span>
      </label>
      <p className="hint">
        Each round is as many loops as the session length next to Play along. Accuracy uses the mode chosen in
        Settings.
      </p>
      <div className="calibration-actions">
        <button className="primary" onClick={releasing(() => onStart(normalizeConfig(draft)))}>
          Start training
        </button>
        <button className="secondary" onClick={releasing(onClose)}>
          Cancel
        </button>
      </div>
    </>
  );
}

const CHART = { width: 380, height: 150, left: 34, right: 12, top: 20, bottom: 24 };

/**
 * Tempo per round as a line with a dot per round, the target as a dashed
 * line, and each round's accuracy written above its dot. One axis (BPM);
 * accuracy is text, never a second scale.
 */
function TempoChart({ rounds, config }: { rounds: readonly RoundRecord[]; config: TrainerConfig }) {
  const bpms = rounds.map((r) => r.bpm);
  const lo = Math.min(...bpms, config.startBpm) - 4;
  const hi = Math.max(...bpms, config.targetBpm) + 4;
  const plotW = CHART.width - CHART.left - CHART.right;
  const plotH = CHART.height - CHART.top - CHART.bottom;
  const x = (i: number) => CHART.left + (rounds.length === 1 ? plotW / 2 : (i / (rounds.length - 1)) * plotW);
  const y = (bpm: number) => CHART.top + (1 - (bpm - lo) / (hi - lo)) * plotH;
  const path = rounds.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r.bpm).toFixed(1)}`).join(" ");
  // Label every round while they fit; past ten, only every other one.
  const labelEvery = rounds.length > 10 ? 2 : 1;
  return (
    <figure className="tempo-chart">
      {/* The caption below gives the same data as text, for screen readers. */}
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} aria-hidden>
        <line className="chart-grid" x1={CHART.left} x2={CHART.width - CHART.right} y1={y(config.targetBpm)} y2={y(config.targetBpm)} />
        <text className="chart-axis" x={CHART.left - 6} y={y(config.targetBpm) + 4} textAnchor="end">
          {config.targetBpm}
        </text>
        {/* At the left end, clear of the latest rounds, which climb toward the right. */}
        <text className="chart-axis" x={CHART.left + 4} y={y(config.targetBpm) - 5}>
          target
        </text>
        <text className="chart-axis" x={CHART.left - 6} y={y(config.startBpm) + 4} textAnchor="end">
          {config.startBpm}
        </text>
        <line className="chart-baseline" x1={CHART.left} x2={CHART.width - CHART.right} y1={CHART.top + plotH} y2={CHART.top + plotH} />
        <path className="chart-line" d={path} />
        {rounds.map((r, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- rounds only ever grow, in order
          <g key={i} className="chart-point">
            <title>
              Round {i + 1}: {r.bpm} BPM, {pct(r.accuracy)}, {OUTCOME_TEXT[r.outcome]}
            </title>
            <circle className="chart-hit" cx={x(i)} cy={y(r.bpm)} r={12} />
            <circle className="chart-dot" cx={x(i)} cy={y(r.bpm)} r={4.5} />
            {i % labelEvery === 0 && (
              <text className="chart-label" x={x(i)} y={y(r.bpm) - 9} textAnchor="middle">
                {pct(r.accuracy)}
              </text>
            )}
            <text className="chart-axis" x={x(i)} y={CHART.height - 6} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="visually-hidden">
        {rounds.map((r, i) => `Round ${i + 1}: ${r.bpm} BPM, ${pct(r.accuracy)}`).join("; ")}
      </figcaption>
    </figure>
  );
}
