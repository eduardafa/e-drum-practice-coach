import type { BlockKind, PlanBlock } from "./history/plan";
import { releasing } from "./releasing";

const KIND_LABEL: Record<BlockKind, string> = { warmup: "Warm-up", focus: "Focus", finish: "Finish" };
const MODE_LABEL = { learn: "Learn (no click)", play: "Play along" } as const;

export interface RunningPlan {
  blocks: PlanBlock[];
  index: number;
  /** performance.now() when the current block started. */
  blockStart: number;
}

/** "7:05" for 425 000 ms, never below 0:00. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The plan before it starts: what each block is and why. */
export function PracticePlanPanel({
  blocks,
  onStart,
  onClose,
}: {
  blocks: PlanBlock[];
  onStart: () => void;
  onClose: () => void;
}) {
  const minutes = blocks.reduce((sum, b) => sum + b.minutes, 0);
  return (
    <section className="calibration plan" aria-labelledby="plan-title">
      <h2 id="plan-title">Today's practice · {minutes} min</h2>
      <p className="calibration-meta">Built from your First steps progress. A timer moves you along; skip any block.</p>
      <ol className="plan-blocks">
        {blocks.map((b) => (
          <li key={b.kind}>
            <span className="plan-kind">
              {KIND_LABEL[b.kind]} · {b.minutes} min
            </span>
            <span className="plan-exercise">{b.exercise.name}</span>
            <span className="plan-mode">{MODE_LABEL[b.mode]}</span>
          </li>
        ))}
      </ol>
      <div className="calibration-actions">
        <button className="primary" onClick={releasing(onStart)}>
          Start plan
        </button>
        <button className="secondary" onClick={releasing(onClose)}>
          Close
        </button>
      </div>
    </section>
  );
}

/** The running plan in the side panel: the block, its time left, and what to do. */
export function PracticePlanBanner({
  plan,
  now,
  onStartBlock,
  onNext,
  onEnd,
}: {
  plan: RunningPlan;
  now: number;
  onStartBlock: (block: PlanBlock) => void;
  onNext: () => void;
  onEnd: () => void;
}) {
  const block = plan.blocks[plan.index];
  if (!block) return null;
  const remaining = block.minutes * 60_000 - (now - plan.blockStart);
  const timeUp = remaining <= 0;
  const following = plan.blocks[plan.index + 1];
  return (
    <output className={`plan-banner ${timeUp ? "time-up" : ""}`}>
      <span className="plan-banner-head">
        Today's practice · {plan.index + 1} of {plan.blocks.length}
        <span className="plan-banner-time">{timeUp ? "time's up" : formatRemaining(remaining)}</span>
      </span>
      <span className="plan-banner-block">
        {KIND_LABEL[block.kind]}: {block.exercise.name}
      </span>
      {timeUp && (
        <span className="plan-banner-note">
          {following ? `Next: ${KIND_LABEL[following.kind].toLowerCase()} on ${following.exercise.name}.` : "That's today's practice done. Well played!"}
        </span>
      )}
      <span className="calibration-actions">
        {!timeUp && (
          <button className="primary" onClick={releasing(() => onStartBlock(block))}>
            {MODE_LABEL[block.mode]}
          </button>
        )}
        {following ? (
          <button className={timeUp ? "primary" : "secondary"} onClick={releasing(onNext)}>
            {timeUp ? "Next block" : "Skip"}
          </button>
        ) : null}
        <button className={timeUp && !following ? "primary" : "secondary"} onClick={releasing(onEnd)}>
          {timeUp && !following ? "Finish" : "End plan"}
        </button>
      </span>
    </output>
  );
}
