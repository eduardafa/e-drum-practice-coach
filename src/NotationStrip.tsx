import { useEffect, useMemo, useRef, useState } from "react";
import { ticksPerBeat, type Exercise } from "./exercises/types";
import type { Coach } from "./live/coach";
import { xAtTick, type StaffLayout } from "./notation/layout";
import { playheadTick } from "./notation/playhead";
import type { NoteResult } from "./playalong/matcher";
import { GET_READY_OPTIONS } from "./playalong/getReady";
import { SESSION_LOOPS, type SessionPhase } from "./playalong/session";
import { releasing } from "./releasing";

/** Pick the position one frame ahead, as the live count does: a frame is painted ~16 ms after it's chosen. */
const PAINT_LOOKAHEAD_MS = 16;
/** The staff grows to fit the stage width, up to this many times its engraved size. */
const MAX_SCALE = 1.6;

/** What the strip shows about a running or finished session. */
export interface SessionView {
  phase: SessionPhase;
  /** Loop being played, from 0. */
  loop: number | null;
  loops: number;
  /** The get-ready countdown's number while it runs, else null. */
  countdown: number | null;
  /** Live accuracy in the chosen mode, 0 to 1. */
  accuracy: number | null;
}

interface Props {
  coach: Coach;
  exercise: Exercise | null;
  onSelect: (id: string | null) => void;
  /** Opens the library browser. */
  onBrowse: () => void;
  libraryOpen: boolean;
  session: SessionView | null;
  loops: number;
  onLoopsChange: (loops: number) => void;
  /** Seconds of get-ready countdown before a session; 0 for none. */
  getReadySec: number;
  onGetReadyChange: (seconds: number) => void;
  onPlay: () => void;
  onStop: () => void;
  onTrain: () => void;
  /** Set while the tempo trainer runs: shown before the session status, and locks the controls. */
  trainerStatus: string | null;
}

/** CSS class for a note's latest result on the staff. */
function markClass(result: NoteResult | undefined): string {
  if (!result || result.status === "pending") return "mark";
  return result.status === "missed" ? "mark missed" : `mark ${result.verdict}`;
}

function sessionStatus(session: SessionView): string {
  if (session.countdown !== null) return `Get ready: the count-in starts in ${session.countdown}…`;
  if (session.phase === "countIn") return "Count-in: listen to one bar, then play.";
  if (session.phase === "done") return "Finished.";
  const accuracy = session.accuracy === null ? "" : ` · accuracy ${Math.floor(session.accuracy * 100)}%`;
  return `Loop ${(session.loop ?? 0) + 1} of ${session.loops}${accuracy}`;
}

type Status = "idle" | "loading" | "ready" | "error";

/**
 * The current exercise (chosen in the library browser) and its drum notation, above the kit view. The staff is
 * engraved once per exercise (VexFlow is loaded on first use); the playhead
 * is moved every animation frame outside React, from the metronome's counts.
 */
export function NotationStrip({
  coach,
  exercise,
  onSelect,
  onBrowse,
  libraryOpen,
  session,
  loops,
  onLoopsChange,
  getReadySec,
  onGetReadyChange,
  onPlay,
  onStop,
  onTrain,
  trainerStatus,
}: Props) {
  const busy = trainerStatus !== null || (session !== null && session.phase !== "done");
  const hostRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<StaffLayout | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const scoreStyle = useMemo(() => ({ maxWidth: layout ? layout.width * MAX_SCALE : undefined }), [layout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!exercise) {
      host.replaceChildren();
      return;
    }
    let canceled = false;
    const engrave = async () => {
      setStatus("loading");
      try {
        const engraver = await import("./notation/engrave");
        await engraver.loadNotationFonts();
        if (canceled) return;
        setLayout(engraver.engraveExercise(exercise, host));
        setStatus("ready");
      } catch (error) {
        console.error(error);
        if (!canceled) setStatus("error");
      }
    };
    void engrave();
    return () => {
      canceled = true;
      setLayout(null);
      setStatus("idle");
    };
  }, [exercise]);

  useEffect(() => {
    const playhead = playheadRef.current;
    const host = hostRef.current;
    const markLayer = marksRef.current;
    if (!layout || !exercise || !playhead || !host || !markLayer) return;
    const beatTicks = ticksPerBeat(exercise.timeSignature);
    // One ring per notehead, created once; each frame only changes classes and positions.
    const marks = layout.marks.map((m) => {
      const el = document.createElement("div");
      el.className = "mark";
      markLayer.append(el);
      return { ...m, el };
    });
    let raf = 0;
    let scale = 0;
    const loop = () => {
      // The staff is scaled by CSS to fit; the playhead and marks follow the same scale.
      const now = host.clientWidth / layout.width;
      if (now !== scale) {
        scale = now;
        playhead.style.top = `${layout.playheadTop * scale}px`;
        playhead.style.height = `${layout.playheadHeight * scale}px`;
        // The result marks grow with the staff (see .mark in App.css).
        markLayer.style.setProperty("--staff-scale", String(scale));
        for (const m of marks) {
          m.el.style.left = `${m.x * scale}px`;
          m.el.style.top = `${m.y * scale}px`;
        }
      }
      coach.tickSession(performance.now());
      const latest = coach.session?.latestResults();
      for (const m of marks) {
        const cls = markClass(latest?.get(m.index));
        if (m.el.className !== cls) m.el.className = cls;
      }
      const { beatsPerBar, subdivision } = coach.metronome.currentSettings;
      const tick = coach.metronome.running
        ? playheadTick(coach.live.counts, performance.now() + PAINT_LOOKAHEAD_MS, {
            countsPerBar: beatsPerBar * subdivision,
            countsPerBeat: subdivision,
            beatTicks,
          })
        : null;
      playhead.hidden = tick === null;
      if (tick !== null) playhead.style.transform = `translateX(${(xAtTick(layout, tick) * scale).toFixed(1)}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      playhead.hidden = true;
      markLayer.replaceChildren();
    };
  }, [coach, layout, exercise]);

  return (
    <section className={`notation ${exercise ? "open" : ""}`} aria-label="Exercise notation">
      <div className="notation-header">
        <span className="notation-label">Exercise</span>
        <button
          className={`secondary exercise-button ${libraryOpen ? "selected" : ""}`}
          aria-expanded={libraryOpen}
          disabled={busy}
          // Keeps focus (unlike most buttons here) so it gets it back when the library closes.
          // Space can't press it again: the drum keys' default action is canceled.
          onClick={onBrowse}
          title="Browse the grooves and rudiments"
        >
          {exercise ? exercise.name : "Choose an exercise"}
          <span className="exercise-button-hint" aria-hidden>
            {" "}
            · Browse
          </span>
        </button>
        {exercise && !busy && (
          <button
            className="icon-button"
            aria-label="Hide the exercise: just the metronome"
            title="Just the metronome"
            onClick={releasing(() => onSelect(null))}
          >
            ×
          </button>
        )}
        {exercise && !busy && (
          <>
            <button className="primary play" onClick={releasing(onPlay)}>
              Play along
            </button>
            <button className="secondary" onClick={releasing(onTrain)}>
              Tempo trainer
            </button>
            <select
              aria-label="Session length"
              value={loops}
              onChange={(e) => {
                e.currentTarget.blur();
                onLoopsChange(Number(e.target.value));
              }}
            >
              {SESSION_LOOPS.map((n) => (
                <option key={n} value={n}>
                  {n} loops
                </option>
              ))}
            </select>
            <select
              aria-label="Countdown before playing"
              title="Time to get to the kit before the count-in"
              value={getReadySec}
              onChange={(e) => {
                e.currentTarget.blur();
                onGetReadyChange(Number(e.target.value));
              }}
            >
              {GET_READY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "No countdown" : `${n} s to get ready`}
                </option>
              ))}
            </select>
          </>
        )}
        {busy && (
          <button className="secondary" onClick={releasing(onStop)}>
            Stop
          </button>
        )}
        <p className="notation-description">
          {session && session.phase !== "done"
            ? `${trainerStatus ?? ""}${sessionStatus(session)}`
            : trainerStatus !== null
              ? trainerStatus
            : exercise
              ? `${exercise.description} Suggested ${exercise.tempo.suggested} BPM.`
              : "Choose a groove or rudiment to see it as drum notation, hear it, and play along."}
        </p>
      </div>
      <div className="notation-staff" hidden={!exercise}>
        <div className="notation-score" style={scoreStyle}>
          <div ref={hostRef} />
          <div ref={marksRef} className="marks" aria-hidden />
          <div ref={playheadRef} className="playhead" hidden />
        </div>
        {status === "loading" && <p className="hint">Loading notation…</p>}
        {status === "error" && <p className="hint warn-note">The notation couldn't be drawn.</p>}
      </div>
    </section>
  );
}
