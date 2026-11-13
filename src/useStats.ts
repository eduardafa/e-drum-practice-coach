/**
 * The live numbers React shows, polled from the coach a few times a second
 * (a hit never causes a render), and the MIDI connection's status.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { coach } from "./appState";
import type { MidiStatus } from "./midi/connection";
import type { LearnView, SessionView } from "./NotationStrip";
import type { AccuracyMode } from "./playalong/results";

export function useMidiStatus(): MidiStatus {
  return useSyncExternalStore(
    (cb) => coach.midi.onStatus(cb),
    () => coach.midi.getStatus(),
  );
}

export interface Stats {
  scored: number;
  onTimePct: number | null;
  meanMs: number | null;
  spreadMs: number | null;
  /** The metronome stops by itself when a play-along session ends. */
  running: boolean;
  session: (Omit<SessionView, "accuracy"> & { accuracy: Record<AccuracyMode, number | null> }) | null;
  learn: LearnView | null;
  /** A note that matched no pad in the last few seconds, to explain why a hit didn't count. */
  unmappedNote: number | null;
}

/** How long the "note N isn't a known pad" hint stays after such a hit. */
const UNMAPPED_HINT_MS = 6000;

function readStats(): Stats {
  const l = coach.live;
  const now = performance.now();
  // Also resolves missed notes when no exercise is drawn to do it every frame.
  coach.tickSession(now);
  const session = coach.session;
  return {
    scored: l.scoredHits,
    onTimePct: l.scoredHits ? (100 * l.onTimeHits) / l.scoredHits : null,
    meanMs: l.scoredHits ? l.sumDeltaMs / l.scoredHits : null,
    spreadMs: l.spreadMs,
    running: coach.metronome.running,
    session: session
      ? {
          phase: session.phase,
          countdown: coach.countdownAt(now),
          loop: session.currentLoop(now),
          loops: session.loops,
          accuracy: session.results().accuracy,
        }
      : null,
    unmappedNote:
      coach.live.lastUnmapped && now - coach.live.lastUnmapped.time < UNMAPPED_HINT_MS ? coach.live.lastUnmapped.note : null,
    learn: coach.learn
      ? { loop: coach.learn.currentLoop, loops: coach.learn.loops, wrongHits: coach.learn.wrongHits, done: coach.learn.done }
      : null,
  };
}

/** Polls the live state a few times a second; per-hit React renders aren't needed. */
export function useStats(): Stats {
  const [stats, setStats] = useState(readStats);
  useEffect(() => {
    const id = setInterval(() => setStats(readStats()), 150);
    return () => clearInterval(id);
  }, []);
  return stats;
}
