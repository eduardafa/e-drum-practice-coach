import { useEffect, useMemo, useRef } from "react";
import { formatDelta } from "./render/kitRenderer";
import type { BeatGrid } from "./songs/beats";
import { MIN_BAR_HITS, driftByBar, hardestBar, type BarDrift, type SongRun } from "./songs/songResults";

/** Bars this far off the beat on average reach the top (or bottom) of the timeline. */
const FULL_SCALE_MS = 60;

/** Rounded down, so 100% only means every hit was on time. */
const pct = (x: number) => `${Math.floor(x * 100)}%`;

function speedLabel(speed: number): string {
  return speed >= 1 ? "full speed" : `${Math.round(speed * 100)}% speed`;
}

/** "12 ms late", "8 ms early" or "on the beat". */
function lean(ms: number): string {
  const r = Math.round(ms);
  return r === 0 ? "on the beat" : `${Math.abs(r)} ms ${r < 0 ? "early" : "late"}`;
}

function barTone(b: BarDrift, toleranceMs: number): "few" | "close" | "early" | "late" {
  if (b.hits < MIN_BAR_HITS || b.meanMs === null) return "few";
  if (Math.abs(b.meanMs) <= toleranceMs / 2) return "close";
  return b.meanMs < 0 ? "early" : "late";
}

function barLabel(b: BarDrift): string {
  if (b.hits === 0 || b.meanMs === null || b.onTime === null) return `Bar ${b.bar}: no hits. Loop from here.`;
  return `Bar ${b.bar}: ${b.hits} ${b.hits === 1 ? "hit" : "hits"}, ${lean(b.meanMs)} on average, ${pct(b.onTime)} on time. Loop from here.`;
}

/**
 * How a song play-along went (EDU-124): the on-time share, average timing and
 * consistency, the drum tab's score if one was open, and where in the song the
 * drummer drifted, a bar at a time. Pressing a bar loops the song from there;
 * "Loop the hardest part" picks the bar with the fewest hits on time.
 * A modal <dialog>: Esc, the backdrop and Close close it.
 */
export function SongResultsDialog({
  run,
  grid,
  duration,
  toleranceMs,
  onLoopFrom,
  onClose,
}: {
  run: SongRun;
  grid: BeatGrid;
  duration: number;
  toleranceMs: number;
  /** Loop the song from this song time (a bar's start). */
  onLoopFrom: (seconds: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.setAttribute("closedby", "any");
    if (!dialog.open) dialog.showModal();
  }, []);

  const bars = useMemo(() => driftByBar(grid, run.hits, duration), [grid, run.hits, duration]);
  // Each bar's fill: up from the middle line for late, down for early, a short tick when close.
  const fills = useMemo(
    () =>
      bars.map((b) => {
        const size = b.meanMs === null ? 0 : Math.min(1, Math.abs(b.meanMs) / FULL_SCALE_MS);
        const height = `${Math.max(6, size * 50)}%`;
        return b.meanMs !== null && b.meanMs < 0 ? { height, top: "50%" } : { height, bottom: "50%" };
      }),
    [bars],
  );
  const hardest = useMemo(() => hardestBar(bars), [bars]);
  const onTime = run.scored > 0 ? run.onTimeHits / run.scored : 0;
  const loopFrom = (seconds: number) => {
    onLoopFrom(seconds);
    ref.current?.close();
  };

  return (
    <dialog ref={ref} className="session-dialog song-results" aria-labelledby="song-results-title" onClose={onClose}>
      <div className="session-dialog-body">
        <header className="session-dialog-head">
          <div>
            <h2 id="song-results-title">{run.title}</h2>
            <p className="session-dialog-meta">Played along at {speedLabel(run.speed)}</p>
          </div>
          <button className="secondary" onClick={() => ref.current?.close()}>
            Close <kbd>Esc</kbd>
          </button>
        </header>

        <div className="session-dialog-score">
          <p className="results-score">{pct(onTime)}</p>
          <p className="calibration-meta">
            of {run.scored} hits on the beat
            {run.meanMs !== null && ` · on average ${formatDelta(run.meanMs)} (${lean(run.meanMs)})`}
            {run.spreadMs !== null && ` · ±${Math.round(run.spreadMs)} ms`}
          </p>
          {run.tab && run.tab.played > 0 && (
            <p className="song-results-tab">
              Drum tab: {run.tab.hit} of {run.tab.played} notes hit ({run.tab.onTime} on time), {run.tab.missed} missed
              {run.tab.wrongDrum > 0 && `, ${run.tab.wrongDrum} on the wrong drum`}
              {run.tab.extra > 0 && `, ${run.tab.extra} extra`}.
            </p>
          )}
        </div>

        {bars.length > 0 && (
          <section className="song-drift" aria-labelledby="song-drift-title">
            <h3 id="song-drift-title">Where you drifted</h3>
            <p className="hint">
              Each bar of the song you played: above the line is late, below is early, green is close to the beat. Press a bar
              to practice from there.
            </p>
            <div className="song-drift-bars">
              {bars.map((b, i) => {
                const tone = barTone(b, toleranceMs);
                return (
                  <button
                    key={b.bar}
                    className={`song-drift-bar ${tone}${hardest?.bar === b.bar ? " hardest" : ""}`}
                    aria-label={barLabel(b)}
                    title={barLabel(b)}
                    onClick={() => loopFrom(b.start)}
                  >
                    <span className="song-drift-fill" style={fills[i]} />
                  </button>
                );
              })}
            </div>
            <div className="song-drift-axis" aria-hidden>
              <span>bar {bars[0].bar}</span>
              <span>bar {bars.at(-1)?.bar}</span>
            </div>
          </section>
        )}

        <div className="calibration-actions">
          {hardest && (
            <button className="primary" onClick={() => loopFrom(hardest.start)}>
              Loop the hardest part (from bar {hardest.bar})
            </button>
          )}
          <button className="secondary" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
