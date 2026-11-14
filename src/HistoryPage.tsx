import { useEffect, useRef, useState } from "react";
import type { HistoryRecord, SessionRecord, TrainerRecord } from "./history/record";
import { formatPracticeTime, practiceDate, practiceTimeOn, streak } from "./history/streak";
import type { AccuracyMode } from "./playalong/results";
import { tabId, tabPanelId, Tabs } from "./Tabs";
import { PROGRESS_RANGES, practicedExercises, rangeStart, type ProgressRange } from "./history/progress";
import { ProgressSection } from "./ProgressSection";
import { TimingSection } from "./TimingSection";
import { PadHeatmap } from "./PadHeatmap";
import { heatmap } from "./history/heatmap";
import { releasing } from "./releasing";
import { InsightsCard } from "./InsightsCard";
import { FirstStepsSection } from "./FirstStepsSection";

export type HistoryStatus = "loading" | "ready" | "off";

interface Props {
  records: readonly HistoryRecord[];
  status: HistoryStatus;
  accuracyMode: AccuracyMode;
  /** The exercise on the stand, charted first when it has been practiced. */
  selectedExerciseId: string | null;
  /** Clears history here and, if asked, the account's synced copy; false if that part failed. */
  onClear: (alsoAccount: boolean) => Promise<boolean>;
  onBack: () => void;
  /** Signed in: history syncs with the account. */
  signedIn: boolean;
  /** The account may use AI insights. */
  insights: boolean;
}

const SCOPE: Record<ProgressRange, string> = { "7d": "the last 7 days", "30d": "the last 30 days", all: "all sessions" };

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

/**
 * The History page (/history): the streak and progress in a wide main
 * column, the saved sessions beside it (one column on phones).
 */
export function HistoryPage({ records, status, accuracyMode, selectedExerciseId, onClear, onBack, signedIn, insights }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Arriving on the page, start reading at its title.
  useEffect(() => headingRef.current?.focus(), []);
  const [confirming, setConfirming] = useState(false);
  const [alsoAccount, setAlsoAccount] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const [range, setRange] = useState<ProgressRange>("30d");
  const today = Temporal.Now.plainDateISO();
  const { current, practicedToday, longest } = streak(records, today);
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
    <section className="history history-page" aria-labelledby="history-title">
      <div className="history-page-header">
        <h2 id="history-title" ref={headingRef} tabIndex={-1}>
          Practice history
        </h2>
        <button className="secondary" onClick={releasing(onBack)}>
          Back to practice <kbd>Esc</kbd>
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
        <div className="history-columns">
          <div className="history-main">
            <dl className="tiles history-tiles">
              <div>
                <dt>Streak</dt>
                <dd>{current}</dd>
                <dd className="tile-note">{current === 1 ? "day" : "days"} in a row</dd>
              </div>
              <div>
                <dt>Today</dt>
                <dd>{formatPracticeTime(todayTime)}</dd>
                <dd className="tile-note">practiced</dd>
              </div>
              <div>
                <dt>Longest</dt>
                <dd>{longest}</dd>
                <dd className="tile-note">{longest === 1 ? "day" : "days"}</dd>
              </div>
            </dl>
            <p className="hint">
              {current > 0 && !practicedToday
                ? "Play a session today to keep your streak going."
                : sessions === 0
                  ? "Finish a play-along session and it appears here. Days in a row with at least one session make your streak."
                  : "Days in a row with at least one finished session make your streak."}
            </p>

            {insights && sessions > 0 && <InsightsCard records={records} accuracyMode={accuracyMode} />}

            <FirstStepsSection records={records} accuracyMode={accuracyMode} />

            {practicedExercises(records).length > 0 && (
              <>
                <h3>Progress</h3>
                {/* One range for everything below it, so the charts and timing agree. */}
                <Tabs tabs={PROGRESS_RANGES} selected={range} onSelect={setRange} label="Range" idPrefix="progress" />
                <div id={tabPanelId("progress", range)} role="tabpanel" aria-labelledby={tabId("progress", range)}>
                  <ProgressSection
                    records={records}
                    accuracyMode={accuracyMode}
                    selectedExerciseId={selectedExerciseId}
                    today={today}
                    range={range}
                  />
                  <div className="history-pair">
                    <TimingSection records={records} from={rangeStart(range, today)} />
                    <PadHeatmap heat={heatmap(records, rangeStart(range, today))} scope={SCOPE[range]} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="history-side">
            <h3 className="history-sessions">Sessions</h3>
            {groups.length === 0 && <p className="hint">No sessions yet.</p>}
            {groups.map((g) => (
              <div key={g.date.toString()} className="history-day">
                <h4>{dayLabel(g.date, today)}</h4>
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
                      Delete all {sessions} {sessions === 1 ? "session" : "sessions"} and your streak from this browser?
                      This can't be undone.
                    </p>
                    {signedIn && (
                      <label className="field checkbox history-clear-account">
                        <input type="checkbox" checked={alsoAccount} onChange={(e) => setAlsoAccount(e.target.checked)} />
                        <span>Also delete it from your account, so it's gone from every device</span>
                      </label>
                    )}
                    <div className="calibration-actions">
                      <button
                        className="primary danger"
                        onClick={releasing(() => {
                          setConfirming(false);
                          void onClear(signedIn && alsoAccount).then((ok) => setClearFailed(!ok));
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
                  <button className="primary danger" onClick={releasing(() => setConfirming(true))}>
                    Clear history
                  </button>
                )}
              </div>
            )}
            {clearFailed && (
              <p className="hint warn-note">
                History was cleared here, but couldn't be deleted from your account. Check your connection and try again.
              </p>
            )}
            <p className="hint">
              {signedIn
                ? "Synced with your account, so it's on every device where you sign in."
                : "Saved in this browser. To keep it on your other devices, sign in from the account button at the top."}
            </p>
          </div>
        </div>
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
