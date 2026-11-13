import { useEffect, useMemo, useRef, useState } from "react";
import { NITRO_MAX_PADS, type PadId } from "./kit/nitroMax";
import type { Coach } from "./live/coach";
import { releasing } from "./releasing";
import { Switch } from "./Switch";
import type { BeatGrid } from "./songs/beats";
import { drumTabFrom, guessShift, placeTab, type DrumTab, type PlacedNote } from "./songs/drumTab";
import { MidiError, readMidiDrums } from "./songs/midiFile";
import { TAB_SPEEDS } from "./songs/tabSong";
import type { TabNoteResult, TabScore } from "./songs/tabScoring";
import { SmallMetronome } from "./SmallMetronome";
import { TabNotation } from "./TabNotation";
import { onThemeChange, withColorProbe } from "./theme";

/** How the tab is shown: drum notation, or simple lanes (a row per pad) for drummers who don't read notation yet. */
type TabView = "notation" | "lanes";
const VIEW_KEY = "edrum-coach:tab-view";

/** The view chosen last time in this browser; notation the first time. */
function savedView(): TabView {
  try {
    return localStorage.getItem(VIEW_KEY) === "lanes" ? "lanes" : "notation";
  } catch {
    return "notation";
  }
}

function saveView(view: TabView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** A MIDI file bigger than this isn't a drum part. */
const MAX_TAB_BYTES = 4 * 1024 * 1024;
/** Seconds of tab shown before and after the playhead line. */
const BEHIND_SEC = 1;
const AHEAD_SEC = 3;
/** Sized to read from the drum throne: a row per pad, labels on the left. */
const ROW_PX = 30;
const LABEL_PX = 84;
const NOTE_RADIUS = 9;

interface OpenTab {
  name: string;
  tab: DrumTab;
}

/**
 * A drum tab for the open song, from a MIDI file the drummer opens: placed on
 * the song's beats (movable by a beat or a bar), heard over the song if they
 * like, drawn as a scrolling tab, and lighting the next pads on the kit while
 * the song plays. The file is read here and never uploaded or kept.
 */
export function DrumTabPanel({
  coach,
  grid,
  fixed,
  showMetronome,
}: {
  coach: Coach;
  grid: BeatGrid | null;
  /** Show the small metronome beside the tab, opposite the view choice (Settings). */
  showMetronome: boolean;
  /**
   * A tab practiced on its own: `grid` is its own beats, so there's nothing to
   * line up or swap; its sounds are on by default, with a click and a speed.
   */
  fixed?: OpenTab & { speed: number; onSpeed: (speed: number) => void };
}) {
  const [picked, setOpen] = useState<OpenTab | null>(null);
  const open = fixed ?? picked;
  const [shift, setShift] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hear, setHear] = useState(fixed !== undefined);
  const [click, setClick] = useState(false);
  const [view, setView] = useState<TabView>(savedView);
  const chooseView = (next: TabView) => {
    setView(next);
    saveView(next);
  };
  // Keyed on the tab itself, not `open`: `fixed` is a new object on every render
  // above, and a new placement would restart the note-by-note scoring.
  const openTab = open?.tab ?? null;
  const placed = useMemo(() => (openTab && grid ? placeTab(openTab, grid, shift) : null), [openTab, grid, shift]);

  // The coach lights the next pads from the placed tab, and plays it when asked.
  useEffect(() => {
    coach.setSongTab(placed);
    return () => coach.setSongTab(null);
  }, [coach, placed]);
  useEffect(() => {
    coach.setHearTab(hear);
    return () => coach.setHearTab(false);
  }, [coach, hear]);
  // On its own, the tab has its own click toggle (a song's is in the beat tools).
  const onItsOwn = fixed !== undefined;
  useEffect(() => {
    if (!onItsOwn) return;
    coach.setSongClick(click);
    return () => coach.setSongClick(false);
  }, [coach, onItsOwn, click]);

  const openFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_TAB_BYTES) {
      setError(`"${file.name}" is too big to be a drum tab.`);
      return;
    }
    try {
      const tab = drumTabFrom(readMidiDrums(new Uint8Array(await file.arrayBuffer())));
      if (tab.notes.length === 0) {
        setError(`"${file.name}" has drums, but none on the kit's pads.`);
        return;
      }
      setOpen({ name: file.name.replace(/\.[^.]+$/, ""), tab });
      if (grid) setShift(guessShift(tab, grid));
    } catch (e) {
      setError(e instanceof MidiError ? `"${file.name}": ${e.message}` : `"${file.name}" couldn't be read.`);
    }
  };

  const picker = (label: string, className: string) => (
    <label className={className}>
      {label}
      <input
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void openFile(file);
        }}
      />
    </label>
  );

  if (!open) {
    return (
      <div className="drum-tab">
        <div className="drum-tab-bar">
          {picker("Open a drum tab", "secondary drum-tab-open")}
          <span className="drum-tab-note">A MIDI file (.mid) of the song's drums: see what to hit as the song plays.</span>
        </div>
        {error && <p className="hint warn-note">{error}</p>}
      </div>
    );
  }

  return (
    <div className="drum-tab">
      <div className="drum-tab-bar">
        <span className="drum-tab-name" title={open.name}>
          Tab: {open.name}
        </span>
        {open.tab.skipped > 0 && (
          <span className="drum-tab-note" title="Drum notes with no pad on the kit (such as cowbell or tambourine) are left out">
            {open.tab.skipped} left out
          </span>
        )}
        {fixed ? (
          <select
            aria-label="Speed"
            title="Slow the tab down to learn it"
            value={fixed.speed}
            onChange={(e) => {
              e.currentTarget.blur();
              fixed.onSpeed(Number(e.target.value));
            }}
          >
            {TAB_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed === 1 ? "Full speed" : `${Math.round(speed * 100)}% speed`}
              </option>
            ))}
          </select>
        ) : (
        <fieldset className="drum-tab-moves">
            <legend className="visually-hidden">Line the tab up with the song</legend>
            <button className="secondary" onClick={releasing(() => setShift((s) => s - 4))} title="Move the tab a bar earlier">
              Bar earlier
            </button>
            <button className="secondary" onClick={releasing(() => setShift((s) => s - 1))} title="Move the tab a beat earlier">
              Beat earlier
            </button>
            <button className="secondary" onClick={releasing(() => setShift((s) => s + 1))} title="Move the tab a beat later">
              Beat later
            </button>
            <button className="secondary" onClick={releasing(() => setShift((s) => s + 4))} title="Move the tab a bar later">
              Bar later
            </button>
          </fieldset>
        )}
        <Switch
          checked={hear}
          onChange={setHear}
          label="Hear the tab"
          title={fixed ? "Play the tab's drum sounds" : "Play the tab's drum sounds over the song, to check it lines up"}
        />
        {fixed ? (
          <Switch checked={click} onChange={setClick} label="Click" title="A click on every beat, higher on beat 1" />
        ) : (
          <>
            {picker("Another tab", "plain drum-tab-open")}
            <button className="secondary" onClick={releasing(() => setOpen(null))}>
              Remove tab
            </button>
          </>
        )}
      </div>
      {error && <p className="hint warn-note">{error}</p>}
      {placed && grid ? (
        <>
          <div className="drum-tab-view-row">
            <fieldset className="segmented" aria-label="Show the tab as">
              <legend className="visually-hidden">Show the tab as</legend>
              {(
                [
                  ["notation", "Notation"],
                  ["lanes", "Lanes"],
                ] as const
              ).map(([id, label]) => (
                <label key={id} title={id === "lanes" ? "A row per pad: no notation to read" : "Drum notation, two bars at a time"}>
                  <input
                    type="radio"
                    name="tab-view"
                    value={id}
                    checked={view === id}
                    onChange={(e) => {
                      e.currentTarget.blur();
                      chooseView(id);
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            {showMetronome && <SmallMetronome coach={coach} inline />}
          </div>
          {view === "notation" ? (
            <TabNotation coach={coach} tab={open.tab} grid={grid} shift={fixed ? 0 : shift} />
          ) : (
            <TabStrip coach={coach} notes={placed} grid={grid} />
          )}
          <TabScoreLine coach={coach} />
        </>
      ) : (
        <p className="hint">The tab appears once the song's beats are found.</p>
      )}
    </div>
  );
}

/** How often the tab's score line refreshes while playing along, in ms. */
const SCORE_REFRESH_MS = 200;

/**
 * The tab's notes so far while playing along (and after, until the next
 * run): how many were played right, missed, or played on the wrong drum.
 */
function TabScoreLine({ coach }: { coach: Coach }) {
  const [score, setScore] = useState<TabScore | null>(null);
  useEffect(() => {
    const read = () => {
      const next = coach.songTabScore?.score() ?? null;
      setScore((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    read();
    const timer = setInterval(read, SCORE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [coach]);
  if (!score || score.played === 0) return null;
  return (
    <p className="tab-score" aria-live="polite">
      <strong>
        {score.hit} of {score.played} notes played
      </strong>
      <span className="tab-score-part on-time">{score.onTime} on time</span>
      {score.early > 0 && <span className="tab-score-part early">{score.early} early</span>}
      {score.late > 0 && <span className="tab-score-part late">{score.late} late</span>}
      {score.wrongDrum > 0 && <span className="tab-score-part wrong-drum">{score.wrongDrum} on the wrong drum</span>}
      {score.missed - score.wrongDrum > 0 && (
        <span className="tab-score-part missed">{score.missed - score.wrongDrum} missed</span>
      )}
      {score.extra > 0 && <span className="tab-score-part">{score.extra} extra</span>}
    </p>
  );
}

const PAD_ORDER = NITRO_MAX_PADS.map((p) => p.id);
const PAD_LABEL = new Map(NITRO_MAX_PADS.map((p) => [p.id, p.label]));

interface Colors {
  text: string;
  muted: string;
  accent: string;
  border: string;
  downbeat: string;
  onTime: string;
  early: string;
  late: string;
  missed: string;
  wrongDrum: string;
}

const readColors = (): Colors =>
  withColorProbe((token) => ({
    text: token("--text"),
    muted: token("--muted"),
    accent: token("--accent"),
    border: token("--border"),
    downbeat: token("--downbeat"),
    onTime: token("--on-time"),
    early: token("--early"),
    late: token("--late"),
    missed: token("--missed"),
    wrongDrum: token("--wrong-drum"),
  }));

/** A played note's color in the lanes, from its result while playing along; null when it has none yet. */
function resultColor(r: TabNoteResult | undefined, colors: Colors): string | null {
  if (!r || r.result.status === "pending") return null;
  if (r.result.status === "missed") return r.wrongDrum ? colors.wrongDrum : colors.missed;
  return r.result.verdict === "onTime" ? colors.onTime : r.result.verdict === "early" ? colors.early : colors.late;
}

/**
 * The tab as it plays: a row per pad used, the song's beats as lines (beat 1
 * stronger), the notes as dots moving left toward the playhead line (an open
 * hi-hat as a ring). Drawn on a canvas every frame from the song's position.
 */
function TabStrip({ coach, notes, grid }: { coach: Coach; notes: readonly PlacedNote[]; grid: BeatGrid }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rows = useMemo(() => {
    const used = new Set<PadId>(notes.map((n) => n.pad));
    return PAD_ORDER.filter((p) => used.has(p));
  }, [notes]);
  const style = useMemo(() => ({ height: rows.length * ROW_PX + 8 }), [rows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let colors = readColors();
    const stopWatch = onThemeChange(() => (colors = readColors()));
    const rowOf = new Map(rows.map((p, i) => [p, i]));
    const height = rows.length * ROW_PX + 8;
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const lane = width - LABEL_PX;
      const pxPerSec = lane / (BEHIND_SEC + AHEAD_SEC);
      const now = coach.song.position();
      const xAt = (t: number) => LABEL_PX + (t - now + BEHIND_SEC) * pxPerSec;
      const from = now - BEHIND_SEC, to = now + AHEAD_SEC;

      ctx.font = "15px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      rows.forEach((pad, i) => {
        const y = 4 + i * ROW_PX + ROW_PX / 2;
        ctx.fillStyle = colors.muted;
        ctx.fillText(PAD_LABEL.get(pad) ?? pad, 4, y);
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LABEL_PX, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      });
      grid.beats.forEach((t, i) => {
        if (t < from || t > to) return;
        const one = i >= grid.firstDownbeat && (i - grid.firstDownbeat) % 4 === 0;
        ctx.strokeStyle = one ? colors.downbeat : colors.border;
        ctx.lineWidth = one ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(xAt(t), 2);
        ctx.lineTo(xAt(t), height - 2);
        ctx.stroke();
      });
      const score = coach.songTabScore;
      for (const note of notes) {
        if (note.time < from) continue;
        if (note.time > to) break;
        const row = rowOf.get(note.pad);
        if (row === undefined) continue;
        const x = xAt(note.time), y = 4 + row * ROW_PX + ROW_PX / 2;
        // While playing along, a played note takes its result's color and stays bright.
        const result = score ? resultColor(score.resultOf(note.id) ?? undefined, colors) : null;
        const color = result ?? colors.accent;
        ctx.globalAlpha = note.time < now && !result ? 0.35 : 1;
        ctx.beginPath();
        ctx.arc(x, y, NOTE_RADIUS, 0, Math.PI * 2);
        if (note.open) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // The playhead: notes reaching this line are to be hit now.
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xAt(now), 0);
      ctx.lineTo(xAt(now), height);
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      stopWatch();
    };
  }, [coach, notes, grid, rows]);

  return (
    <>
      <canvas ref={canvasRef} className="drum-tab-strip" style={style} aria-hidden />
      <p className="visually-hidden">
        Drum tab for {rows.map((p) => PAD_LABEL.get(p)).join(", ")}. The next pad to hit also lights up on the kit.
      </p>
    </>
  );
}
