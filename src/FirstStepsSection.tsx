import { PATHS, type Path } from "./exercises/path";
import { firstStepsProgress, meetKitDone, type StepProgress } from "./history/firstSteps";
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
export function FirstStepsSection({
  records,
  accuracyMode,
  kitTourDone,
}: {
  records: readonly HistoryRecord[];
  accuracyMode: AccuracyMode;
  /** "Meet your kit" was finished on this device. */
  kitTourDone: boolean;
}) {
  return (
    <>
      {PATHS.map((path, i) => (
        <PathProgress
          key={path.id}
          path={path}
          records={records}
          accuracyMode={accuracyMode}
          // Part 1 starts with step 0, "Meet your kit".
          meetKit={i === 0 ? meetKitDone(records, kitTourDone) : null}
        />
      ))}
    </>
  );
}

/** One path, once it's started or the beat leading into it has passed. */
function PathProgress({
  path,
  records,
  accuracyMode,
  meetKit,
}: {
  path: Path;
  records: readonly HistoryRecord[];
  accuracyMode: AccuracyMode;
  /** Whether step 0 is done, for part 1; null for the other parts. */
  meetKit: boolean | null;
}) {
  const progress = firstStepsProgress(records, accuracyMode, DEFAULT_PASS_MARK, path);
  if (!progress.unlocked && !meetKit) return null;
  const { rows, passedSteps, totalSteps, next } = progress;
  const titleId = `path-${path.id}-title`;

  return (
    <section className="first-steps-progress" aria-labelledby={titleId}>
      <h3 id={titleId}>{path.title}</h3>
      <p className="hint">
        {passedSteps} of {totalSteps} steps passed
        {next
          ? ` · up next: ${next.exercise.name}. A step passes with a run of ${percent(DEFAULT_PASS_MARK)} or more.`
          : `. Every step and the ${rows.at(-1)?.exercise.name ?? "goal"} passed: play it a little faster each week.`}
      </p>
      <ol className="first-steps-list">
        {meetKit !== null && (
          <li className={meetKit ? "passed" : "next"}>
            <span className="step-mark" aria-hidden>
              {meetKit ? MARK.passed : MARK.next}
            </span>
            <span className="step-name">
              Step 0: Meet your kit
              <span className="step-best">Each pad's name and how it's written</span>
            </span>
            <span className="step-status">{meetKit ? "Done" : "Up next"}</span>
          </li>
        )}
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
