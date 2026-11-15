import { useEffect, useRef, useState } from "react";
import type { Coach } from "./live/coach";
import type { BeatGrid } from "./songs/beats";
import { nextLoopSpeed, passAccuracy, startSpeed, type LoopRound } from "./songs/loopTrainer";
import type { SongLoop } from "./songs/player";

/** Seconds of countdown before each round after the first: time to reset, with the beeps as the cue. */
const BETWEEN_ROUNDS_SEC = 3;
/** How long after the loop's end a pass is scored, so a hit on its last note still counts. */
const SCORE_AFTER_END_SEC = 0.15;
const POLL_MS = 50;

export interface LoopTrainerState {
  /** "preparing": making the next speed's copy or counting in; "playing": a pass; "done": passed at full speed. */
  phase: "preparing" | "playing" | "done";
  speed: number;
  rounds: LoopRound[];
}

/**
 * Runs "speed up as I get it" over a song's loop (EDU-123): one scored pass
 * per round from the loop's start, then the next speed by the trainer's rules
 * (songs/loopTrainer), until a pass at full speed. Stopping play-along (the
 * song bar's Stop) stops it too.
 */
export function useLoopTrainer({
  coach,
  grid,
  loop,
  speed,
  setSpeed,
  getReadySec,
}: {
  coach: Coach;
  grid: BeatGrid | null;
  loop: SongLoop | null;
  speed: number;
  setSpeed: (speed: number) => Promise<void>;
  getReadySec: number;
}) {
  const [state, setState] = useState<LoopTrainerState | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Bumped by every start and stop, so a round from an old run never carries on. */
  const runId = useRef(0);

  const clear = () => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  };

  const stop = () => {
    runId.current++;
    clear();
    if (coach.playingAlong) coach.endSongPlayAlong();
    setState(null);
  };

  // Leaving the song (or the loop going away) ends a run.
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!loop && state) stop();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only when the loop changes
  }, [loop]);

  const round = async (id: number, roundSpeed: number, countdown: number, rounds: LoopRound[]) => {
    if (!grid || !loop) return;
    setState({ phase: "preparing", speed: roundSpeed, rounds });
    await setSpeed(roundSpeed);
    if (runId.current !== id) return;
    coach.song.seek(loop.start, 1);
    await coach.startSongPlayAlong(grid, countdown);
    if (runId.current !== id) return;
    setState({ phase: "playing", speed: roundSpeed, rounds });
    const passEnd = coach.song.firstPassEnd();
    const beats = grid.beats.filter((b) => b >= loop.start && b < loop.end).length;
    clear();
    timer.current = setInterval(() => {
      const now = coach.metronome.context?.currentTime ?? 0;
      if (runId.current !== id) return clear();
      // Stopped from the song bar: the run ends with it.
      if (!coach.playingAlong) return stop();
      if (passEnd === null || now < passEnd + SCORE_AFTER_END_SEC) return;
      clear();
      coach.endSongPlayAlong();
      const accuracy = passAccuracy(coach.songTabScore?.score() ?? null, { scored: coach.live.scoredHits, onTime: coach.live.onTimeHits }, beats);
      const next = nextLoopSpeed(roundSpeed, accuracy);
      const played = [...rounds, { speed: roundSpeed, accuracy, outcome: next.outcome }];
      if (next.outcome === "done") {
        setState({ phase: "done", speed: roundSpeed, rounds: played });
        return;
      }
      void round(id, next.speed, BETWEEN_ROUNDS_SEC, played);
    }, POLL_MS);
  };

  const start = () => {
    if (!grid || !loop) return;
    const id = ++runId.current;
    void round(id, startSpeed(speed), getReadySec, []);
  };

  return { state, start, stop, dismiss: () => setState(null) };
}
