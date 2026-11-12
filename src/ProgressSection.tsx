import { useState } from "react";
import { ProgressChart } from "./ProgressChart";
import {
  formatPercent,
  practisedExercises,
  progress,
  progressSummary,
  type ProgressRange,
} from "./history/progress";
import type { HistoryRecord } from "./history/record";
import type { AccuracyMode } from "./playalong/results";

interface Props {
  records: readonly HistoryRecord[];
  accuracyMode: AccuracyMode;
  /** The exercise on the stand, shown first when it has been practised. */
  selectedExerciseId: string | null;
  today: Temporal.PlainDate;
  range: ProgressRange;
}

/** The locale's first day of the week (1 = Monday … 7 = Sunday); Monday if the browser can't say. */
function localeFirstDay(): number {
  try {
    const locale = new Intl.Locale(navigator.language);
    // getWeekInfo() is the current API; older Chrome exposed weekInfo as a property.
    const info = (locale as Intl.Locale & { getWeekInfo?: () => { firstDay: number } }).getWeekInfo?.();
    return info?.firstDay ?? 1;
  } catch {
    return 1;
  }
}

const FIRST_DAY = localeFirstDay();

/** Accuracy and tempo over time for one exercise, in the history panel. */
export function ProgressSection({ records, accuracyMode, selectedExerciseId, today, range }: Props) {
  const [chosenId, setChosenId] = useState<string | null>(null);

  const exercises = practisedExercises(records);
  const exercise =
    exercises.find((e) => e.id === chosenId) ?? exercises.find((e) => e.id === selectedExerciseId) ?? exercises[0];
  if (!exercise) return null;

  const data = progress(records, exercise.id, range, today, accuracyMode, FIRST_DAY);
  const { grouping, points } = data;
  const from =
    range === "7d"
      ? today.subtract({ days: 6 })
      : range === "30d"
        ? today.subtract({ days: 29 })
        : (points[0]?.start ?? today);

  const per = grouping === "week" ? "week" : "day";

  return (
    <section className="progress" aria-labelledby="progress-title">
      <h4 id="progress-title" className="progress-subhead">
        Accuracy and tempo
      </h4>
      <label className="progress-exercise">
        <span className="visually-hidden">Exercise</span>
        <select value={exercise.id} onChange={(e) => setChosenId(e.target.value)}>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      <p className="progress-summary" aria-live="polite">
        {progressSummary(exercise.name, data)}
      </p>

      {points.length === 0 ? (
        <p className="hint">Nothing in this range yet. Try All time.</p>
      ) : (
        <>
          <ProgressChart
            title={`Accuracy per ${per}${accuracyMode === "strict" ? " (strict)" : ""}`}
            measure="accuracy"
            points={points}
            grouping={grouping}
            from={from}
            to={today}
          />
          <ProgressChart
            title={`Fastest tempo per ${per} (BPM)`}
            measure="bpm"
            points={points}
            grouping={grouping}
            from={from}
            to={today}
          />
          <details className="progress-table">
            <summary>Show as a table</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">{grouping === "week" ? "Week of" : "Day"}</th>
                  <th scope="col">Accuracy</th>
                  <th scope="col">Fastest</th>
                  <th scope="col">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {points.toReversed().map((p) => (
                  <tr key={p.start.toString()}>
                    <th scope="row">{p.start.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short" })}</th>
                    <td>{p.accuracy === null ? "—" : formatPercent(p.accuracy)}</td>
                    <td>{p.bpm} BPM</td>
                    <td>{p.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
