import { useState } from "react";
import type { HistoryRecord, SessionRecord, TrainerRecord } from "./history/record";
import { formatPracticeTime, practiceDate, practiceTimeOn, streak } from "./history/streak";
import type { AccuracyMode } from "./playalong/results";
import { releasing } from "./releasing";

export type HistoryStatus = "loading" | "ready" | "off";

interface Props {
  records: readonly HistoryRecord[];
  status: HistoryStatus;
  accuracyMode: AccuracyMode;
  onClear: () => void;
  onClose: () => void;
}

/** The list stays quick to scan; older entries still count for streaks. */
const SHOWN = 100;

const pct = (value: number | null) => (value === null ? "—" : `${Math.floor(value * 100)}%`);

function dayLabel(date: Temporal.PlainDate, today: Temporal.PlainDate): string {
  if (date.equals(today)) return "Today";
  if (date.equals(today.subtract({ days: 1 }))) return "Yesterday";
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: date.year === today.year ? undefined : "numeric",
  });
}

function timeLabel(record: HistoryRecord): string {
  return Temporal.Instant.from(record.start)
    .toZonedDateTimeISO(record.timeZone)
    .toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * What the list shows: trainer runs as one entry each, and sessions that
 * weren't a round of a saved run. Rounds of a run cut short (page closed)
 * have no run record, so they show as sessions.
 */
function entries(records: readonly HistoryRecord[]): HistoryRecord[] {
  const runs = new Set(records.filter((r) => r.kind === "trainer").map((r) => r.id));
  return records.filter((r) => r.kind === "trainer" || r.trainerRunId === null || !runs.has(r.trainerRunId));
}

/** Practice history: the streak, today's time and every saved session, newest first. */
export function HistoryPanel({ records, status, accuracyMode, onClear, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);
  const today = Temporal.Now.plainDateISO();
  const { current, practisedToday, longest } = streak(records, today);
  const todayTime = practiceTimeOn(records, today);
  const sessions = records.filter((r) => r.kind === "session").length;

  // Entries grouped by the date they were played on, newest first.
  const groups: { date: Temporal.PlainDate; items: HistoryRecord[] }[] = [];
  for (const r of entries(records).slice(0, SHOWN)) {
    const date = practiceDate(r);
    const last = groups.at(-1);
    if (last && last.date.equals(date)) last.items.push(r);
    else groups.push({ date, items: [r] });
  }

  return (
    <section className="overlay history" aria-labelledby="history-title">
      <div className="overlay-header">
        <h2 id="history-title">Practice history</h2>
        <button className="secondary" onClick={releasing(onClose)} aria-label="Close history">
          Close <kbd>Esc</kbd>
        </button>
      </div>

      {status === "off" && (
        <p className="hint warn-note">
          History is off: this browser isn't letting the app save data (a private window, or site storage blocked).
          Practice works as usual.
        </p>
      )}
      {status === "loading" && <p className="hint">Loading history…</p>}

      {status === "ready" && (
        <>
          <dl className="tiles history-tiles">
            <div>
              <dt>Streak</dt>
              <dd>{current}</dd>
              <dd className="tile-note">{current === 1 ? "day" : "days"} in a row</dd>
            </div>
            <div>
              <dt>Today</dt>
              <dd>{formatPracticeTime(todayTime)}</dd>
              <dd className="tile-note">practised</dd>
            </div>
            <div>
              <dt>Longest</dt>
              <dd>{longest}</dd>
              <dd className="tile-note">{longest === 1 ? "day" : "days"}</dd>
            </div>
          </dl>
          <p className="hint">
            {current > 0 && !practisedToday
              ? "Play a session today to keep your streak going."
              : sessions === 0
                ? "Finish a play-along session and it appears here. Days in a row with at least one session make your streak."
                : "Days in a row with at least one finished session make your streak."}
          </p>

          {groups.map((g) => (
            <div key={g.date.toString()} className="history-day">
              <h3>{dayLabel(g.date, today)}</h3>
              <ul className="history-list">
                {g.items.map((r) => (
                  <li key={r.id}>
                    <span className="history-time">{timeLabel(r)}</span>
                    {r.kind === "session" ? (
                      <SessionEntry record={r} mode={accuracyMode} />
                    ) : (
                      <TrainerEntry record={r} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {entries(records).length > SHOWN && <p className="hint">Showing the latest {SHOWN} entries.</p>}

          {sessions > 0 && (
            <div className="history-clear">
              {confirming ? (
                <>
                  <p>
                    Delete all {sessions} {sessions === 1 ? "session" : "sessions"} and your streak? This can't be undone.
                  </p>
                  <div className="calibration-actions">
                    <button
                      className="primary danger"
                      onClick={releasing(() => {
                        setConfirming(false);
                        onClear();
                      })}
                    >
                      Delete history
                    </button>
                    <button className="secondary" onClick={releasing(() => setConfirming(false))}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button className="link-button" onClick={releasing(() => setConfirming(true))}>
                  Clear history…
                </button>
              )}
            </div>
          )}
          <p className="hint">Saved in this browser only. Nothing is sent anywhere.</p>
        </>
      )}
    </section>
  );
}

function SessionEntry({ record, mode }: { record: SessionRecord; mode: AccuracyMode }) {
  return (
    <>
      <span className="history-what">
        {record.exerciseName}
        <span className="history-detail">
          {record.bpm} BPM · {record.loops} loops
        </span>
      </span>
      <span className="history-score">{pct(record.accuracy[mode])}</span>
    </>
  );
}

function TrainerEntry({ record }: { record: TrainerRecord }) {
  const last = record.rounds.at(-1);
  const rounds = record.rounds.length;
  return (
    <>
      <span className="history-what">
        Tempo trainer · {record.exerciseName}
        <span className="history-detail">
          {record.config.startBpm} → {last?.bpm ?? record.config.startBpm} BPM · {rounds} {rounds === 1 ? "round" : "rounds"}
        </span>
      </span>
      <span className="history-score">{record.reason === "target" ? `reached ${record.config.targetBpm} BPM` : "stopped"}</span>
    </>
  );
}
