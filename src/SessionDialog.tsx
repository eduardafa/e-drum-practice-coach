import { useEffect, useMemo, useRef } from "react";
import { DynamicsSummary } from "./DynamicsSummary";
import { heatmap } from "./history/heatmap";
import { formatLean } from "./history/limbs";
import type { SessionRecord } from "./history/record";
import type { AccuracyMode } from "./playalong/results";
import { NoteToFixSection } from "./NoteToFixSection";
import { PadHeatmap } from "./PadHeatmap";
import { TimingSection } from "./TimingSection";
import { TogetherNote } from "./TogetherNote";
import { QuietBarsNote } from "./QuietBarsNote";

interface Props {
  record: SessionRecord;
  mode: AccuracyMode;
  onClose: () => void;
}

const MODE_LABEL: Record<AccuracyMode, string> = { partial: "partial credit", strict: "strict" };

/** Rounded down, like everywhere else, so 100% only means a perfect run. */
const pct = (value: number | null) => (value === null ? "—" : `${Math.floor(value * 100)}%`);

/** "Sat, Nov 14, 1:22 PM", in the time zone it was played in. */
function playedAt(record: SessionRecord): string {
  return Temporal.Instant.from(record.start)
    .toZonedDateTimeISO(record.timeZone)
    .toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "1 min 20 s", or "45 s". */
function length(duration: string): string {
  let seconds: number;
  try {
    seconds = Math.round(Temporal.Duration.from(duration).total("seconds"));
  } catch {
    return "";
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min${s > 0 ? ` ${s} s` : ""}` : `${s} s`;
}

/**
 * One saved session's stats, opened from History (EDU-115): the score in
 * both modes, what happened to the notes, the timing per hand, foot and pad,
 * and the pad heatmap, all for this session alone. Everything comes from the
 * saved record, so it works for sessions synced from another device too.
 * A modal <dialog>: focus stays inside; Esc, the backdrop and Close all close it
 * natively, then History unmounts it and focus returns to the row.
 */
export function SessionDialog({ record, mode, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Back to the row it was opened from on close, for keyboard users (the dialog is
    // unmounted on close, so the browser's own focus return doesn't happen).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Light dismiss: a press on the backdrop closes it, like Esc (closedby isn't in React's types yet).
    dialog.setAttribute("closedby", "any");
    if (!dialog.open) dialog.showModal();
    return () => opener?.focus();
  }, []);
  const records = useMemo(() => [record], [record]);
  const heat = useMemo(() => heatmap(records), [records]);

  const other: AccuracyMode = mode === "partial" ? "strict" : "partial";
  const { counts, meanDeltaMs, spreadMs } = record;
  const tiles: [string, number, string][] = [
    ["On time", counts.onTime, "on-time"],
    ["Early", counts.early, "early"],
    ["Late", counts.late, "late"],
    ["Missed", counts.missed, "missed"],
    ["Extra", counts.extra, "extra"],
  ];
  const meta = [playedAt(record), `${record.bpm} BPM`, `${record.loops} ${record.loops === 1 ? "loop" : "loops"}`, length(record.duration)]
    .filter(Boolean)
    .join(" · ");

  return (
    <dialog
      ref={ref}
      className="session-dialog"
      aria-labelledby="session-dialog-title"
      // Esc, a backdrop press and Close all end up here.
      onClose={onClose}
    >
      <div className="session-dialog-body">
        <header className="session-dialog-head">
          <div>
            <h2 id="session-dialog-title">{record.exerciseName}</h2>
            <p className="session-dialog-meta">{meta}</p>
          </div>
          {/* Closes natively first, like Esc and the backdrop, so the page is no longer inert
              when focus goes back to the row. No releasing(): there are no drum keys on History. */}
          <button className="secondary" onClick={() => ref.current?.close()}>
            Close <kbd>Esc</kbd>
          </button>
        </header>

        <div className="session-dialog-score">
          <p className="results-score">{pct(record.accuracy[mode])}</p>
          <p className="calibration-meta">
            {MODE_LABEL[mode]} · {pct(record.accuracy[other])} {MODE_LABEL[other]}
            {meanDeltaMs !== null && (
              <>
                {" · "}on average {formatLean(meanDeltaMs)}
                {spreadMs !== null && `, ±${Math.round(spreadMs)} ms`}
              </>
            )}
          </p>
        </div>

        <NoteToFixSection record={record} />

        <dl className="session-counts" aria-label={`What happened to the ${counts.notes} notes`}>
          {tiles.map(([label, n, tone]) => (
            <div key={label} className={`session-count ${tone}`}>
              <dt>{label}</dt>
              <dd>{n}</dd>
            </div>
          ))}
        </dl>

        <DynamicsSummary record={record} />
        <TogetherNote record={record} />
        <QuietBarsNote record={record} />

        <div className="history-pair">
          <TimingSection records={records} from={null} />
          <PadHeatmap heat={heat} scope="this session" hideDynamicsNote />
        </div>
      </div>
    </dialog>
  );
}
