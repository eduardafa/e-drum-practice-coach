import { useEffect, useMemo, useRef, useState } from "react";
import type { PreviewPlayer } from "./audio/previewPlayer";
import { EXERCISES } from "./exercises/library";
import { startingTempo } from "./exercises/practice";
import { formatTimeSignature, tabOf, type TabCell } from "./exercises/tab";
import type { Exercise } from "./exercises/types";

type Filter = "all" | Exercise["category"];

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "groove", label: "Grooves" },
  { id: "rudiment", label: "Rudiments" },
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
  onClose: () => void;
}

/**
 * Browse the grooves and rudiments: each with its time signature, tempo range,
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
  return (
    <li className={`library-card ${selected ? "selected" : ""}`} aria-labelledby={titleId}>
      <div className="library-card-head">
        <h3 id={titleId}>{exercise.name}</h3>
        <span className="library-meta">
          {formatTimeSignature(exercise)} · {min}–{max} BPM, suggested {suggested}
          {remembered && bpm !== suggested && ` · yours ${bpm}`}
        </span>
      </div>
      <p className="library-description">{exercise.description}</p>
      <TabPreview exercise={exercise} player={previewing ? player : null} />
      <div className="calibration-actions">
        <button
          className="secondary"
          aria-label={previewing ? `Stop ${exercise.name}` : `Listen to ${exercise.name} at ${bpm} BPM`}
          onClick={() => (previewing ? onStopPreview() : onPreview(exercise, bpm))}
        >
          {previewing ? "■ Stop" : `▶ Listen · ${bpm} BPM`}
        </button>
        <button className="primary" onClick={() => onSelect(exercise.id)} aria-describedby={titleId}>
          {selected ? "Keep this one" : "Practise this"}
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
