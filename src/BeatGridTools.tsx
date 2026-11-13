import { useEffect, useRef, useState } from "react";
import type { Coach } from "./live/coach";
import { releasing } from "./releasing";
import type { BeatGrid } from "./songs/beats";
import {
  addTap,
  doubleTempo,
  gridFromTaps,
  halveTempo,
  MIN_TAPS,
  nearestBeat,
  nudge,
  setDownbeat,
  tapTime,
} from "./songs/gridEdit";

/** Earlier / Later move the beats this many milliseconds. */
const NUDGE_MS = 10;
/** Twice / half as fast stay within tempos a drummer plays along to. */
const MAX_BPM = 300;
const MIN_BPM = 40;

/**
 * Check and fix the song's beats before playing along: a click on them, the
 * quick fixes, or tapping the beat on any pad. Every change goes to
 * `onChange`, which saves it with the song.
 */
export function BeatGridTools({
  coach,
  grid,
  found,
  duration,
  onChange,
}: {
  coach: Coach;
  grid: BeatGrid;
  /** The beats as the app found them, to go back to. */
  found: BeatGrid | null;
  duration: number;
  onChange: (grid: BeatGrid) => void;
}) {
  const [clickOn, setClickOn] = useState(coach.songClickOn);
  const [tapping, setTapping] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  /** The taps as of the last one, for the hit listener (which outlives renders). */
  const tapsRef = useRef<number[]>([]);
  const [tapNote, setTapNote] = useState<string | null>(null);
  const tapped = taps.length >= MIN_TAPS ? gridFromTaps(taps, duration) : null;

  // The click follows the toggle, and is off while tapping so it doesn't pull the taps toward the old beats.
  useEffect(() => {
    coach.songClickOn = clickOn && !tapping;
  }, [coach, clickOn, tapping]);

  const tap = (t: number) => {
    if (!coach.song.playing) return;
    const result = addTap(tapsRef.current, t);
    tapsRef.current = result.taps;
    setTaps(result.taps);
    if (result.status !== "ignored") setTapNote(result.status === "off" ? "That tap was off the beat. Start again on a beat 1." : null);
  };

  // While tapping, every pad (or drum key) is a tap, at the moment it was played in the song.
  useEffect(() => {
    if (!tapping) return;
    return coach.onHit((time) =>
      tap(tapTime(coach.song.position(), performance.now(), time, coach.scoring.latencyOffsetMs)),
    );
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- tap only reads state through setters
  }, [coach, tapping]);

  const startTapping = () => {
    tapsRef.current = [];
    setTaps([]);
    setTapNote(null);
    setTapping(true);
    if (!coach.song.playing) void coach.playSong();
  };

  const useTaps = () => {
    if (tapped) onChange(tapped);
    setTapping(false);
  };

  if (tapping) {
    return (
      <fieldset className="grid-tools">
        <legend className="visually-hidden">Tap the beat</legend>
        <p className="grid-tools-status" aria-live="polite">
          {tapNote ??
            (taps.length === 0
              ? "Tap on a beat 1, then on every beat, on any pad (or the Tap button)."
              : taps.length < MIN_TAPS
                ? `Keep going: ${taps.length} of ${MIN_TAPS} taps.`
                : tapped
                  ? `${taps.length} taps: ≈ ${Math.round(tapped.bpm)} BPM. Keep tapping, or use these beats.`
                  : "Your taps were uneven. Keep tapping steadily.")}
        </p>
        <div className="calibration-actions">
          <button
            className="secondary"
            onPointerDown={(e) => {
              e.preventDefault();
              tap(coach.song.position());
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.repeat) return;
              e.preventDefault();
              tap(coach.song.position());
            }}
          >
            Tap
          </button>
          <button className="primary" disabled={!tapped} onClick={releasing(useTaps)}>
            Use my beats
          </button>
          <button className="secondary" onClick={releasing(() => setTapping(false))}>
            Cancel
          </button>
        </div>
      </fieldset>
    );
  }

  const corrected = found !== null && grid !== found;
  return (
    <fieldset className="grid-tools">
      <legend className="visually-hidden">Check the beats</legend>
      <p className="grid-tools-status">
        Check the beats: turn on the click and listen. Each click should land on the song's beat, with a higher click on
        beat 1, where each bar starts.
      </p>
      <div className="calibration-actions">
        <button
          className={`secondary ${clickOn ? "selected" : ""}`}
          aria-pressed={clickOn}
          onClick={releasing(() => setClickOn((on) => !on))}
        >
          Click on the beats
        </button>
        <button
          className="secondary"
          disabled={grid.bpm * 2 > MAX_BPM}
          title="The clicks are half as many as the song's beats"
          onClick={releasing(() => onChange(doubleTempo(grid)))}
        >
          Twice as fast
        </button>
        <button
          className="secondary"
          disabled={grid.bpm / 2 < MIN_BPM}
          title="The clicks are twice as many as the song's beats"
          onClick={releasing(() => onChange(halveTempo(grid)))}
        >
          Half as fast
        </button>
        <button
          className="secondary"
          disabled={grid.beats.length === 0}
          title="Pause (or press it) on a beat 1: the nearest beat becomes beat 1"
          onClick={releasing(() => onChange(setDownbeat(grid, nearestBeat(grid, coach.song.position()))))}
        >
          Beat 1 is here
        </button>
        <button
          className="secondary"
          title={`Move every beat ${NUDGE_MS} ms earlier`}
          onClick={releasing(() => onChange(nudge(grid, -NUDGE_MS)))}
        >
          Earlier
        </button>
        <button
          className="secondary"
          title={`Move every beat ${NUDGE_MS} ms later`}
          onClick={releasing(() => onChange(nudge(grid, NUDGE_MS)))}
        >
          Later
        </button>
        <button
          className="secondary"
          title="Tap along on any pad to set the beats yourself"
          onClick={releasing(startTapping)}
        >
          Tap the beat
        </button>
        {corrected && (
          <button className="link-button" onClick={releasing(() => onChange(found))}>
            Back to the beats found
          </button>
        )}
      </div>
    </fieldset>
  );
}
