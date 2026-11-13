import { firstStepsProgress, type StepProgress } from "./history/firstSteps";
import type { HistoryRecord } from "./history/record";
import type { AccuracyMode } from "./playalong/results";
import { DEFAULT_PASS_MARK } from "./playalong/trainer";

const MARK: Record<StepProgress["status"], string> = { passed: "✓", next: "▶", later: "○" };

/** Rounded down, like every accuracy in the app, so a shown 89% never reads as a pass. */
function percent(value: number): string {
  return `${Math.floor(value * 100)}%`;
}

function statusLabel(row: StepProgress): string {
  if (row.status === "passed") return "Passed";
  if (row.status === "next") return "Up next";
  return row.sessions > 0 ? "Not passed yet" : "Not played yet";
}

function bestLabel(row: StepProgress): string {
  const sessions = `${row.sessions} ${row.sessions === 1 ? "session" : "sessions"}`;
  if (row.best) return `Best ${percent(row.best.accuracy)} at ${row.best.bpm} BPM · ${sessions}`;
  return row.sessions > 0 ? sessions : "";
}

/**
 * The First steps path on the History page: which steps have passed (a best
 * run at the Next button's pass mark), which is up next, and the best run of
 * each. Over all of history, so it doesn't follow the Progress range.
 */
export function FirstStepsSection({ records, accuracyMode }: { records: readonly HistoryRecord[]; accuracyMode: AccuracyMode }) {
  const progress = firstStepsProgress(records, accuracyMode, DEFAULT_PASS_MARK);
  if (!progress.started) return null;
  const { rows, passedSteps, totalSteps, next } = progress;

  return (
    <section className="first-steps-progress" aria-labelledby="first-steps-title">
      <h3 id="first-steps-title">First steps</h3>
      <p className="hint">
        {passedSteps} of {totalSteps} steps passed
        {next
          ? ` · up next: ${next.exercise.name}. A step passes with a run of ${percent(DEFAULT_PASS_MARK)} or more.`
          : ". Every step and the Money beat passed: try the Money beat a little faster each week."}
      </p>
      <ol className="first-steps-list">
        {rows.map((row) => (
          <li key={row.exercise.id} className={row.status}>
            <span className="step-mark" aria-hidden>
              {MARK[row.status]}
            </span>
            <span className="step-name">
              {row.goal ? `Goal: ${row.exercise.name}` : row.exercise.name}
              <span className="step-best">{bestLabel(row)}</span>
            </span>
            <span className="step-status">{statusLabel(row)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
