import type { Coach } from "./live/coach";
import { releasing } from "./releasing";
import type { BeatGrid } from "./songs/beats";
import type { SongLoop } from "./songs/player";
import { DEFAULT_LOOP_BARS, loopFrom, loopLabel, loopTo } from "./songs/songLoop";

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
}: {
  coach: Coach;
  grid: BeatGrid;
  loop: SongLoop | null;
  duration: number;
  onChange: (loop: SongLoop | null) => void;
}) {
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
          <span className="song-loop-label">Repeating {loopLabel(grid, loop)}</span>
        </>
      )}
      {!loop && <span className="hint">Practice a hard part again and again: move the playhead there, then press this.</span>}
    </div>
  );
}
