import { useEffect, useMemo, useRef, useState } from "react";
import { GROOVES, RUDIMENTS } from "./exercises/library";
import { ticksPerBeat, type Exercise } from "./exercises/types";
import type { Coach } from "./live/coach";
import { xAtTick, type StaffLayout } from "./notation/layout";
import { playheadTick } from "./notation/playhead";

/** Pick the position one frame ahead, as the live count does: a frame is painted ~16 ms after it's chosen. */
const PAINT_LOOKAHEAD_MS = 16;
/** The staff grows to fit the stage width, up to this many times its engraved size. */
const MAX_SCALE = 1.6;

interface Props {
  coach: Coach;
  exercise: Exercise | null;
  onSelect: (id: string | null) => void;
}

type Status = "idle" | "loading" | "ready" | "error";

/**
 * The exercise picker and its drum notation, above the kit view. The staff is
 * engraved once per exercise (VexFlow is loaded on first use); the playhead
 * is moved every animation frame outside React, from the metronome's counts.
 */
export function NotationStrip({ coach, exercise, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
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
    let cancelled = false;
    const engrave = async () => {
      setStatus("loading");
      try {
        const engraver = await import("./notation/engrave");
        await engraver.loadNotationFonts();
        if (cancelled) return;
        setLayout(engraver.engraveExercise(exercise, host));
        setStatus("ready");
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus("error");
      }
    };
    void engrave();
    return () => {
      cancelled = true;
      setLayout(null);
      setStatus("idle");
    };
  }, [exercise]);

  useEffect(() => {
    const playhead = playheadRef.current;
    const host = hostRef.current;
    if (!layout || !exercise || !playhead || !host) return;
    const beatTicks = ticksPerBeat(exercise.timeSignature);
    let raf = 0;
    let scale = 0;
    const loop = () => {
      // The staff is scaled by CSS to fit; the playhead follows the same scale.
      const now = host.clientWidth / layout.width;
      if (now !== scale) {
        scale = now;
        playhead.style.top = `${layout.playheadTop * scale}px`;
        playhead.style.height = `${layout.playheadHeight * scale}px`;
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
    };
  }, [coach, layout, exercise]);

  return (
    <section className={`notation ${exercise ? "open" : ""}`} aria-label="Exercise notation">
      <div className="notation-header">
        <label htmlFor="exercise">Exercise</label>
        <select
          id="exercise"
          value={exercise?.id ?? ""}
          onChange={(e) => {
            // Give up focus: Space is the kick key, and it would reopen the list.
            e.currentTarget.blur();
            onSelect(e.target.value || null);
          }}
        >
          <option value="">None: just the metronome</option>
          <optgroup label="Grooves">
            {GROOVES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Rudiments">
            {RUDIMENTS.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="notation-description">
          {exercise
            ? `${exercise.description} Suggested ${exercise.tempo.suggested} BPM.`
            : "Pick a groove or rudiment to see it as drum notation."}
        </p>
      </div>
      <div className="notation-staff" hidden={!exercise}>
        <div className="notation-score" style={scoreStyle}>
          <div ref={hostRef} />
          <div ref={playheadRef} className="playhead" hidden />
        </div>
        {status === "loading" && <p className="hint">Loading notation…</p>}
        {status === "error" && <p className="hint warn-note">The notation couldn't be drawn.</p>}
      </div>
    </section>
  );
}
