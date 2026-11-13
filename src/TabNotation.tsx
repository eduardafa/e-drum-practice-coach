import { useEffect, useMemo, useRef, useState } from "react";
import { TICKS_PER_QUARTER } from "./exercises/types";
import type { Coach } from "./live/coach";
import { xAtTick, type StaffLayout } from "./notation/layout";
import type { BeatGrid } from "./songs/beats";
import type { DrumTab } from "./songs/drumTab";
import { BARS_PER_LINE, lineCount, snapTab, tabBeatAt, tabLine } from "./songs/tabNotation";

const LINE_BEATS = BARS_PER_LINE * 4;

type Status = "loading" | "ready" | "error";

/**
 * The tab as drum notation, like the exercises' staff: the line being played
 * (two bars) with a playhead, and the next line below it to read ahead. The
 * lines turn over as the song moves on. Each line is engraved once when it
 * comes up (VexFlow is loaded on first use); the playhead moves every frame
 * outside React.
 */
export function TabNotation({ coach, tab, grid, shift }: { coach: Coach; tab: DrumTab; grid: BeatGrid; shift: number }) {
  const notes = useMemo(() => snapTab(tab), [tab]);
  const lines = useMemo(() => lineCount(notes), [notes]);
  const [line, setLine] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const nowRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<StaffLayout | null>(null);

  // Engrave the current line and the next whenever the current one changes.
  useEffect(() => {
    const now = nowRef.current, next = nextRef.current;
    if (!now || !next) return;
    let canceled = false;
    void (async () => {
      try {
        const engraver = await import("./notation/engrave");
        await engraver.loadNotationFonts();
        if (canceled) return;
        setLayout(engraver.engraveExercise(tabLine(notes, line), now));
        if (line + 1 < lines) engraver.engraveExercise(tabLine(notes, line + 1), next);
        else next.replaceChildren();
        setStatus("ready");
      } catch (error) {
        console.error(error);
        if (!canceled) setStatus("error");
      }
    })();
    return () => {
      canceled = true;
    };
  }, [notes, line, lines]);

  // Every frame: which line the song is on, and the playhead within it.
  useEffect(() => {
    const host = nowRef.current, playhead = playheadRef.current;
    if (!host || !playhead) return;
    let raf = 0;
    const loop = () => {
      const beat = tabBeatAt(grid, shift, coach.song.position());
      const current = Math.min(lines - 1, Math.max(0, Math.floor(beat / LINE_BEATS)));
      setLine(current);
      const inLine = beat - current * LINE_BEATS;
      const visible = layout !== null && inLine >= 0 && inLine <= LINE_BEATS;
      playhead.hidden = !visible;
      if (visible) {
        const scale = host.clientWidth / layout.width;
        playhead.style.top = `${layout.playheadTop * scale}px`;
        playhead.style.height = `${layout.playheadHeight * scale}px`;
        playhead.style.transform = `translateX(${(xAtTick(layout, inLine * TICKS_PER_QUARTER) * scale).toFixed(1)}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [coach, grid, shift, lines, layout]);

  return (
    <div className="tab-notation">
      <p className="tab-notation-label" aria-live="polite">
        Bars {line * BARS_PER_LINE + 1} to {(line + 1) * BARS_PER_LINE}
        {line + 1 < lines ? ", then the next line below" : ", the last line"}
      </p>
      <div className="tab-notation-line now">
        <div ref={nowRef} />
        <div ref={playheadRef} className="playhead" hidden />
      </div>
      <div ref={nextRef} className="tab-notation-line next" aria-hidden />
      {status === "loading" && <p className="hint">Loading notation</p>}
      {status === "error" && <p className="hint warn-note">The notation couldn't be drawn.</p>}
    </div>
  );
}
