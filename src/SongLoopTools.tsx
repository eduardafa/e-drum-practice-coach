import type { Coach } from "./live/coach";
import { releasing } from "./releasing";
import type { BeatGrid } from "./songs/beats";
import type { SongLoop } from "./songs/player";
import { DEFAULT_LOOP_BARS, loopFrom, loopLabel, loopTo } from "./songs/songLoop";
import type { LoopRound } from "./songs/loopTrainer";
import type { useLoopTrainer } from "./useLoopTrainer";

/** "70%", or "full speed", as in the Speed menu. */
const pct = (speed: number) => (speed >= 1 ? "full speed" : `${Math.round(speed * 100)}%`);

/** "86%: again at 70%" / "93%: up to 85%" for the last pass. */
function lastPass(round: LoopRound, next: number): string {
  const score = round.accuracy === null ? "Not enough played to tell" : `${Math.floor(round.accuracy * 100)}%`;
  switch (round.outcome) {
    case "up":
      return `${score}: up to ${pct(next)}`;
    case "down":
      return `${score}: back to ${pct(next)}`;
    default:
      return `${score}: again at ${pct(next)}`;
  }
}

/**
 * Repeat a section of the song (EDU-121): from the bar the playhead is in,
 * for a few bars, then "to here" to choose where it ends; both snap to bar
 * lines so the section repeats in time. Listening and playing along both
 * repeat it; the beat clicks, the tab and scoring follow every jump back.
 */
export function SongLoopTools({
  coach,
  grid,
  loop,
  duration,
  onChange,
  trainer,
}: {
  coach: Coach;
  grid: BeatGrid;
  loop: SongLoop | null;
  duration: number;
  onChange: (loop: SongLoop | null) => void;
  /** "Speed up as I get it" over the loop (EDU-123). */
  trainer: ReturnType<typeof useLoopTrainer>;
}) {
  const run = trainer.state;
  if (run) {
    const last = run.rounds.at(-1);
    return (
      <div className="song-loop song-loop-trainer">
        {/* Announced as it changes: each pass's result and the next speed. */}
        <output className="song-loop-status">
          {run.phase === "done" ? (
            <span className="song-loop-label">
              You've got it: {last && last.accuracy !== null ? `${Math.floor(last.accuracy * 100)}% ` : ""}at full speed, in{" "}
              {run.rounds.length} {run.rounds.length === 1 ? "pass" : "passes"}.
            </span>
          ) : (
            <>
              <span className="song-loop-label">
                Speeding up {loopLabel(grid, loop ?? { start: 0, end: 0 })} · pass {run.rounds.length + 1} at {pct(run.speed)}
              </span>
              {last && <span className="song-loop-last">Last pass {lastPass(last, run.speed)}</span>}
              {run.phase === "preparing" && <span className="hint">Get ready</span>}
            </>
          )}
        </output>
        {run.phase === "done" ? (
          <button className="secondary" onClick={releasing(trainer.dismiss)}>
            Done
          </button>
        ) : (
          <button className="secondary" onClick={releasing(trainer.stop)}>
            Stop
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="song-loop">
      <button
        className="secondary"
        title={`Repeat ${DEFAULT_LOOP_BARS} bars from the bar the playhead is in`}
        onClick={releasing(() => onChange(loopFrom(grid, coach.song.position(), duration)))}
      >
        {loop ? "Loop from here" : "Loop this part"}
      </button>
      {loop && (
        <>
          <button
            className="secondary"
            title="End the loop at the next bar line after the playhead"
            onClick={releasing(() => onChange(loopTo(grid, loop, coach.song.position(), duration)))}
          >
            Loop to here
          </button>
          <button className="secondary" onClick={releasing(() => onChange(null))}>
            Clear loop
          </button>
          <button
            className="secondary"
            title="Play the loop along with scoring, from slow, and go a speed faster after each pass at 90% or more"
            onClick={releasing(trainer.start)}
          >
            Speed up as I get it
          </button>
          <span className="song-loop-label">Repeating {loopLabel(grid, loop)}</span>
        </>
      )}
      {!loop && <span className="hint">Practice a hard part again and again: move the playhead there, then press this.</span>}
    </div>
  );
}
