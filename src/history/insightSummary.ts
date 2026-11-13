/**
 * The practice summary sent for AI insights (EDU-53): the same numbers the
 * History page shows, for the last 30 days, and nothing else. No raw hits,
 * no names, no dates beyond "the last 30 days", no account details. The
 * same history gives the same summary, so the server can reuse today's
 * insight instead of paying for another.
 */
import type { AccuracyMode } from "../playalong/results";
import { heatmap } from "./heatmap";
import { LIMBS, describeTendency, tendency, timingStats, type TimingStat } from "./limbs";
import { practicedExercises, progress } from "./progress";
import type { HistoryRecord } from "./record";
import { practiceDate, streak } from "./streak";
import type { Handedness } from "../handedness";

const round = (x: number | null, digits = 0) => (x === null ? null : Number(x.toFixed(digits)));

const timing = (s: TimingStat) => ({ leanMs: round(s.meanMs), spreadMs: round(s.spreadMs), hits: s.hits, missed: s.missed });

export function insightSummary(
  records: readonly HistoryRecord[],
  today: Temporal.PlainDate,
  mode: AccuracyMode,
  handedness: Handedness = "right",
) {
  const from = today.subtract({ days: 30 });
  const recent = records.filter((r) => r.kind === "session" && Temporal.PlainDate.compare(practiceDate(r), from) >= 0);
  const { current, longest, practicedToday } = streak(records, today);
  const stats = timingStats(records, from, handedness);
  const heat = heatmap(records, from);

  return {
    period: "last 30 days",
    accuracyMode: mode === "partial" ? "partial credit (near misses count for part)" : "strict",
    sessions: recent.length,
    streakDays: current,
    longestStreakDays: longest,
    practicedToday,
    exercises: practicedExercises(records)
      .slice(0, 5)
      .flatMap(({ id, name }) => {
        const { points } = progress(records, id, "30d", today, mode);
        const first = points[0];
        const last = points.at(-1);
        if (!first || !last) return [];
        return [
          {
            name,
            sessions: points.reduce((n, p) => n + p.sessions, 0),
            accuracyFirst: round(first.accuracy, 2),
            accuracyLatest: round(last.accuracy, 2),
            fastestBpmFirst: first.bpm,
            fastestBpmLatest: last.bpm,
          },
        ];
      }),
    timingByLimb: Object.fromEntries(
      LIMBS.flatMap(({ id, label }) => {
        const s = stats.limbs.get(id);
        return s ? [[label, timing(s)]] : [];
      }),
    ),
    timingByPad: Object.fromEntries([...stats.pads].map(([pad, s]) => [pad, timing(s)])),
    tendency: describeTendency(tendency(stats.limbs)).headline,
    strengthByDynamic: Object.fromEntries(
      [...heat.dynamics].map(([dynamic, v]) => [dynamic, { meanStrength: round(v.mean), spread: round(v.spread), notes: v.n }]),
    ),
  };
}
