import { useEffect, useMemo, useRef, useState } from "react";
import { NITRO_MAX_PADS, type PadId } from "./kit/nitroMax";
import type { Coach } from "./live/coach";
import { releasing } from "./releasing";
import { Switch } from "./Switch";
import type { BeatGrid } from "./songs/beats";
import { drumTabFrom, guessShift, placeTab, type DrumTab, type PlacedNote } from "./songs/drumTab";
import { MidiError } from "./songs/midiFile";
import { TAB_FILE_ACCEPT, readTabFile } from "./songs/tabFile";
import { TAB_SPEEDS } from "./songs/tabSong";
import { forgetTab, loadTab, saveTab, type SaveResult } from "./songs/tabStore";
import { GROOVE_CHOICES, NO_GROOVE, findGroove, grooveTab, loadGroovePreference, saveGroovePreference } from "./songs/grooveTab";
import type { TabNoteResult, TabScore } from "./songs/tabScoring";
import { Segmented } from "./Segmented";
import { SmallMetronome } from "./SmallMetronome";
import { TabNotation } from "./TabNotation";
import { onThemeChange, withColorProbe } from "./theme";

/** How the tab is shown: drum notation, or simple lanes (a row per pad) for drummers who don't read notation yet. */
type TabView = "notation" | "lanes";
const TAB_VIEWS = [
  { id: "notation", label: "Notation", title: "Drum notation, two bars at a time" },
  { id: "lanes", label: "Lanes", title: "A row per pad: no notation to read" },
] as const;
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
  /** Set when the tab is a groove from the library laid on the song (EDU-89): its id. */
  groove?: string;
}

/** How many beats of the song a groove covers: from its first beat 1 to the end. */
const grooveBeats = (grid: BeatGrid) => Math.max(0, grid.beats.length - grid.firstDownbeat);

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
  songFingerprint,
}: {
  coach: Coach;
  grid: BeatGrid | null;
  /**
   * The open song's fingerprint: its tab is remembered in this browser under
   * it and comes back, lined up, when the song is opened again (EDU-99).
   * Absent for a tab practiced on its own, which isn't remembered.
   */
  songFingerprint?: string;
  /** Show the small metronome beside the tab, opposite the view choice (Settings). */
  showMetronome: boolean;
  /**
   * A tab practiced on its own: `grid` is its own beats, so there's nothing to
   * line up or swap; its sounds are on by default, with a click and a speed.
   */
  fixed?: OpenTab & { speed: number; onSpeed: (speed: number) => void };
}) {
  // The song's remembered tab, read once when the panel opens (it's keyed on the song).
  const [remembered] = useState(() => (songFingerprint ? loadTab(songFingerprint) : null));
  const [picked, setOpen] = useState<OpenTab | null>(() =>
    remembered ? { name: remembered.name, tab: remembered.tab, ...(remembered.groove && { groove: remembered.groove }) } : null,
  );
  /** The groove for songs without their own tab (EDU-89): the drummer's last choice, or the simple beat. */
  const [grooveChoice, setGrooveChoice] = useState(loadGroovePreference);
  /** This song set to "Just the beat". */
  const [cleared, setCleared] = useState(false);
  // The groove on show: one chosen (or remembered) for this song, or the default for a song with no tab of its own.
  const grooveId = picked
    ? picked.groove
    : songFingerprint && !cleared && grooveChoice !== NO_GROOVE
      ? grooveChoice
      : undefined;
  const groove = grooveId ? findGroove(grooveId) : undefined;
  // Built from the current beats, so it follows corrections ("Twice as fast", "Beat 1 is here"). Memoized:
  // a new tab object would restart the note-by-note scoring.
  const grooveOpen = useMemo<OpenTab | null>(
    () => (groove && grid ? { name: groove.name, tab: grooveTab(groove, grooveBeats(grid)), groove: groove.id } : null),
    [groove, grid],
  );
  const open = fixed ?? (picked && !picked.groove ? picked : grooveOpen);
  const isGroove = !fixed && open?.groove !== undefined;
  /** For a groove, beats from the song's first beat 1; for a MIDI tab, from the song's first beat. */
  const [shift, setShift] = useState(remembered?.shift ?? 0);
  const placeShift = fixed ? 0 : isGroove ? (grid?.firstDownbeat ?? 0) + shift : shift;
  // Whether the tab on screen could be remembered; only "too-long" and "full" are shown.
  const [saved, setSaved] = useState<SaveResult>("saved");

  // Remember the tab with its song whenever it's opened or moved; forget it when removed.
  const persist = (tab: OpenTab | null, nextShift: number) => {
    if (!songFingerprint) return;
    if (!tab) {
      forgetTab(songFingerprint);
      setSaved("saved");
      return;
    }
    setSaved(saveTab({ fingerprint: songFingerprint, name: tab.name, shift: nextShift, tab: tab.tab, ...(tab.groove && { groove: tab.groove }) }));
  };
  const move = (beats: number) => {
    const next = shift + beats;
    // Moving the default groove makes it this song's own.
    const current = picked ?? grooveOpen;
    if (!picked && grooveOpen) setOpen(grooveOpen);
    setShift(next);
    persist(current, next);
  };
  /** "What to play": a groove from the library, or just the beat. It becomes the default for songs without a tab. */
  const chooseGroove = (id: string) => {
    setGrooveChoice(id);
    saveGroovePreference(id);
    setShift(0);
    const chosen = findGroove(id);
    if (id === NO_GROOVE || !chosen || !grid) {
      setOpen(null);
      setCleared(true);
      persist(null, 0);
      return;
    }
    const next = { name: chosen.name, tab: grooveTab(chosen, grooveBeats(grid)), groove: chosen.id };
    setOpen(next);
    setCleared(false);
    persist(next, 0);
  };
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
  const placed = useMemo(() => (openTab && grid ? placeTab(openTab, grid, placeShift) : null), [openTab, grid, placeShift]);

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
      const tab = drumTabFrom(await readTabFile(new Uint8Array(await file.arrayBuffer())));
      if (tab.notes.length === 0) {
        setError(`"${file.name}" has drums, but none on the kit's pads.`);
        return;
      }
      const next = { name: file.name.replace(/\.[^.]+$/, ""), tab };
      const nextShift = grid ? guessShift(tab, grid) : shift;
      setOpen(next);
      setShift(nextShift);
      persist(next, nextShift);
    } catch (e) {
      setError(e instanceof MidiError ? `"${file.name}": ${e.message}` : `"${file.name}" couldn't be read.`);
    }
  };

  const picker = (label: string, className: string) => (
    <label className={className}>
      {label}
      <input
        type="file"
        accept={TAB_FILE_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void openFile(file);
        }}
      />
    </label>
  );

  // A song's "What to play" (EDU-89): just the beat, or a groove laid on its beats.
  const grooveSelect = songFingerprint && grid && (
    <label className="drum-tab-groove">
      <span>What to play</span>
      <select
        value={isGroove && open ? (open.groove ?? NO_GROOVE) : NO_GROOVE}
        title="A pattern that fits the song's beat, shown and scored like a tab. Not what the song's drummer plays."
        onChange={(e) => {
          e.currentTarget.blur();
          chooseGroove(e.target.value);
        }}
      >
        <option value={NO_GROOVE}>Just the beat</option>
        <optgroup label="Grooves">
          {GROOVE_CHOICES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );

  if (!open) {
    return (
      <div className="drum-tab">
        <div className="drum-tab-bar">
          {grooveSelect}
          {picker("Open a drum tab", "secondary drum-tab-open")}
          <span className="drum-tab-note">A MIDI (.mid) or Guitar Pro (.gp, .gp5) file of the song's drums: see what to hit as the song plays.</span>
        </div>
        {error && <p className="hint warn-note">{error}</p>}
      </div>
    );
  }

  return (
    <div className="drum-tab">
      <div className="drum-tab-bar">
        {isGroove ? (
          grooveSelect
        ) : (
          <span className="drum-tab-name" title={open.name}>
            Tab: {open.name}
          </span>
        )}
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
            <button className="secondary" onClick={releasing(() => move(-4))} title="Move the tab a bar earlier">
              Bar earlier
            </button>
            <button className="secondary" onClick={releasing(() => move(-1))} title="Move the tab a beat earlier">
              Beat earlier
            </button>
            <button className="secondary" onClick={releasing(() => move(1))} title="Move the tab a beat later">
              Beat later
            </button>
            <button className="secondary" onClick={releasing(() => move(4))} title="Move the tab a bar later">
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
            {picker(isGroove ? "Open a drum tab" : "Another tab", "plain drum-tab-open")}
            {/* A groove is changed or turned off with "What to play"; a MIDI tab is removed here. */}
            {!isGroove && (
              <button
                className="secondary"
                onClick={releasing(() => {
                  setOpen(null);
                  persist(null, 0);
                })}
              >
                Remove tab
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="hint warn-note">{error}</p>}
      {songFingerprint && saved !== "saved" && (
        <p className="hint">
          {saved === "too-long"
            ? "This tab is too long to remember: open it again next time you open the song."
            : "Your browser's storage is full, so this tab won't be remembered: open it again next time you open the song."}
        </p>
      )}
      {placed && grid ? (
        <>
          <div className="drum-tab-view-row">
            <Segmented
              options={TAB_VIEWS}
              value={view}
              onChange={chooseView}
              label="Show the tab as"
              name="tab-view"
            />
            {showMetronome && <SmallMetronome coach={coach} inline />}
          </div>
          {view === "notation" ? (
            <TabNotation coach={coach} tab={open.tab} grid={grid} shift={placeShift} />
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
