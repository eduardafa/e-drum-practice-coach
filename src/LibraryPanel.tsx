import { useEffect, useMemo, useRef, useState } from "react";
import type { PreviewPlayer } from "./audio/previewPlayer";
import { EXERCISES } from "./exercises/library";
import { startingTempo } from "./exercises/practice";
import { formatTimeSignature, tabOf, type TabCell } from "./exercises/tab";
import type { Exercise } from "./exercises/types";
import { displayedExercise } from "./handedness";
import { useHandedness } from "./HandednessContext";
import { formatDuration, SONG_EXTENSIONS } from "./songs/song";
import type { RememberedSong } from "./songs/songStore";

/** An exercise category, everything, or the songs opener. */
type Filter = "all" | Exercise["category"] | "songs";

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "first-steps", label: "First steps" },
  { id: "groove", label: "Grooves" },
  { id: "rudiment", label: "Rudiments" },
  { id: "songs", label: "Songs" },
];

interface Props {
  selectedId: string | null;
  /** The last tempo used for each exercise. */
  tempos: Readonly<Record<string, number>>;
  player: PreviewPlayer;
  /** The exercise being previewed, or null. */
  previewingId: string | null;
  onPreview: (exercise: Exercise, bpm: number) => void;
  onStopPreview: () => void;
  onSelect: (id: string | null) => void;
  /** Opens an audio file the drummer picked, to play along to. */
  onOpenSong: (file: File) => void;
  /** Opens a MIDI drum file to practice on its own, without a song. */
  onOpenTab: (file: File) => void;
  /** While a picked song is being decoded. */
  songLoading: boolean;
  /** Why the last picked file couldn't be opened, or null. */
  songError: string | null;
  /** Songs opened before in this browser, newest first. */
  recentSongs: readonly RememberedSong[];
  onForgetSong: (fingerprint: string) => void;
  onClose: () => void;
}

/**
 * Browse the first steps, grooves and rudiments: each with its time signature, tempo range,
 * a drum-tab preview and a button to hear one loop. Drum keys are off while
 * it's open (App), so Tab, Enter and Space move around it as usual.
 */
export function LibraryPanel({
  selectedId,
  tempos,
  player,
  previewingId,
  onPreview,
  onStopPreview,
  onSelect,
  onOpenSong,
  onOpenTab,
  songLoading,
  songError,
  recentSongs,
  onForgetSong,
  onClose,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = EXERCISES.filter((e) => filter === "all" || e.category === filter);
  const panelRef = useRef<HTMLElement>(null);

  // Like a dialog: focus moves in on open, and back to where it was on close.
  useEffect(() => {
    const before = document.activeElement;
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLButtonElement>(".library-card.selected .primary") ??
      panel?.querySelector<HTMLButtonElement>(".library-filters button");
    first?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  return (
    <section ref={panelRef} className="overlay library" aria-labelledby="library-title">
      <div className="overlay-header">
        <h2 id="library-title">Exercises</h2>
        <button className="secondary" onClick={onClose} aria-label="Close exercises">
          Close <kbd>Esc</kbd>
        </button>
      </div>
      <fieldset className="library-filters">
        <legend className="visually-hidden">Show</legend>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`secondary ${filter === f.id ? "selected" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        <button className="link-button" onClick={() => onSelect(null)} disabled={selectedId === null}>
          Just the metronome
        </button>
      </fieldset>
      {filter === "songs" ? (
        <SongOpener onOpen={onOpenSong} onOpenTab={onOpenTab} loading={songLoading} error={songError} recent={recentSongs} onForget={onForgetSong} />
      ) : (
        <>
          <ul className="library-list">
            {shown.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                bpm={startingTempo(exercise, tempos)}
                remembered={tempos[exercise.id] !== undefined}
                selected={exercise.id === selectedId}
                previewing={exercise.id === previewingId}
                player={player}
                onPreview={onPreview}
                onStopPreview={onStopPreview}
                onSelect={onSelect}
              />
            ))}
          </ul>
          <p className="hint">
            In the patterns, green is an accent (play it louder), faint is a ghost note (very quiet) and an outline is an
            open hi-hat. Listen plays one loop with a click on every beat. Choosing an exercise sets the metronome to fit
            it, at your last tempo for it or its suggested tempo.
          </p>
        </>
      )}
    </section>
  );
}

function ExerciseCard({
  exercise,
  bpm,
  remembered,
  selected,
  previewing,
  player,
  onPreview,
  onStopPreview,
  onSelect,
}: {
  exercise: Exercise;
  bpm: number;
  remembered: boolean;
  selected: boolean;
  previewing: boolean;
  player: PreviewPlayer;
  onPreview: (exercise: Exercise, bpm: number) => void;
  onStopPreview: () => void;
  onSelect: (id: string) => void;
}) {
  const { min, suggested, max } = exercise.tempo;
  const titleId = `library-${exercise.id}`;
  // Hands and description as played on the drummer's kit (mirrored when left-handed).
  const handedness = useHandedness();
  const shown = useMemo(() => displayedExercise(exercise, handedness), [exercise, handedness]);
  return (
    <li className={`library-card ${selected ? "selected" : ""}`} aria-labelledby={titleId}>
      <div className="library-card-head">
        <h3 id={titleId}>{exercise.name}</h3>
        <span className="library-meta">
          {formatTimeSignature(exercise)} · {min}–{max} BPM, suggested {suggested}
          {remembered && bpm !== suggested && ` · yours ${bpm}`}
        </span>
      </div>
      <p className="library-description">{shown.description}</p>
      <TabPreview exercise={shown} player={previewing ? player : null} />
      <div className="calibration-actions">
        <button
          className="secondary"
          aria-label={previewing ? `Stop ${exercise.name}` : `Listen to ${exercise.name} at ${bpm} BPM`}
          onClick={() => (previewing ? onStopPreview() : onPreview(exercise, bpm))}
        >
          {previewing ? "■ Stop" : `▶ Listen · ${bpm} BPM`}
        </button>
        <button className="primary" onClick={() => onSelect(exercise.id)} aria-describedby={titleId}>
          {selected ? "Keep this one" : "Practice this"}
        </button>
      </div>
    </li>
  );
}

function cellClass(cell: TabCell): string {
  if (!cell) return "tab-cell";
  if (cell.open) return "tab-cell note open";
  return `tab-cell note ${cell.dynamic}${cell.flam ? " flam" : ""}`;
}

/**
 * The pattern as drum tab: a row per pad, a cell per step, a gap between
 * beats, and the hands for rudiments. While previewing, a box follows the loop.
 */
function TabPreview({ exercise, player }: { exercise: Exercise; player: PreviewPlayer | null }) {
  const tab = useMemo(() => tabOf(exercise), [exercise]);
  const cursorRef = useRef<HTMLDivElement>(null);
  // A gap before each beat after the first, so the beats can be counted.
  const beatClass = (i: number) => (i > 0 && i % tab.stepsPerBeat === 0 ? " beat-start" : "");
  const style = useMemo(() => ({ ["--steps" as string]: tab.steps }), [tab]);

  useEffect(() => {
    const cursor = cursorRef.current;
    const cells = cursor?.parentElement?.querySelector(".tab-cells")?.children;
    if (!player || !cursor || !cells) return;
    let raf = 0;
    let shown = -1;
    const loop = () => {
      const progress = player.progress();
      const step = progress === null ? -1 : Math.floor(progress * tab.steps);
      if (step !== shown) {
        shown = step;
        const cell = cells[step];
        cursor.hidden = !(cell instanceof HTMLElement);
        // Cells aren't evenly spaced (gaps between beats), so follow the cell itself.
        if (cell instanceof HTMLElement) {
          cursor.style.left = `${cell.offsetLeft}px`;
          cursor.style.width = `${cell.offsetWidth}px`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cursor.hidden = true;
    };
  }, [player, tab]);

  return (
    <div className="tab" style={style} aria-hidden>
      {tab.rows.map((row) => (
        <div key={row.pad} className="tab-row">
          <span className="tab-label">{row.label}</span>
          <div className="tab-cells">
            {row.cells.map((cell, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- cells are fixed positions in the bar
              <span key={i} className={`${cellClass(cell)}${beatClass(i)}`} />
            ))}
          </div>
        </div>
      ))}
      {tab.sticking && (
        <div className="tab-row sticking">
          <span className="tab-label">Hands</span>
          <div className="tab-cells">
            {tab.sticking.map((hand, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- cells are fixed positions in the bar
              <span key={i} className={`tab-hand${beatClass(i)}`}>
                {hand}
              </span>
            ))}
          </div>
        </div>
      )}
      <div ref={cursorRef} className="tab-cursor" hidden />
    </div>
  );
}

/** The Songs tab: open an audio file from this computer. It's played here and never uploaded. */
function SongOpener({
  onOpen,
  onOpenTab,
  loading,
  error,
  recent,
  onForget,
}: {
  onOpen: (file: File) => void;
  onOpenTab: (file: File) => void;
  loading: boolean;
  error: string | null;
  recent: readonly RememberedSong[];
  onForget: (fingerprint: string) => void;
}) {
  return (
    <div className="song-opener">
      <p>
        Open a song you own from your computer and play along to it. MP3, M4A, WAV, OGG and FLAC files work.
      </p>
      <label className={`song-open-button ${loading ? "busy" : ""}`}>
        {loading ? "Opening the song" : "Open a song"}
        <input
          type="file"
          accept={SONG_EXTENSIONS.map((e) => `.${e}`).join(",") + ",audio/*"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onOpen(file);
          }}
        />
      </label>
      {error && <p className="hint warn-note">{error}</p>}
      <div className="tab-opener">
        <label className="song-open-button secondary-look">
          Open a drum tab
          <input
            type="file"
            accept=".mid,.midi,audio/midi,audio/x-midi"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onOpenTab(file);
            }}
          />
        </label>
        <span className="hint">No song file? Practice a drum part from a MIDI file (.mid) on its own, at its own tempo or slower.</span>
      </div>
      {recent.length > 0 && (
        <div className="recent-songs">
          <h3>Opened before</h3>
          <ul>
            {recent.map((s) => (
              <li key={s.fingerprint}>
                <span className="recent-song-title">{s.title}</span>
                <span className="recent-song-meta">
                  {formatDuration(s.duration)} · ≈ {Math.round(s.grid.bpm)} BPM
                </span>
                <button className="link-button" onClick={() => onForget(s.fingerprint)} aria-label={`Forget ${s.title}`}>
                  Forget
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">Pick one of these files again to open it: its beats come back at once, with no waiting.</p>
        </div>
      )}
      <p className="hint">
        Your song stays on your computer: it's opened and played in this browser and never uploaded. Streaming
        services (Spotify, Apple Music, YouTube) can't be opened, since their audio is locked; songs you bought as
        downloads usually can. <a href="/privacy">Privacy</a>
      </p>
    </div>
  );
}
