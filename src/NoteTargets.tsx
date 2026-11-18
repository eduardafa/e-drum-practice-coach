import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Exercise } from "./exercises/types";
import { useHandedness } from "./HandednessContext";
import type { StaffLayout } from "./notation/layout";
import { groupLabel, noteGroups, type NoteGroup } from "./notation/noteLabels";

/** Room around the noteheads a tap still lands in, in engraved px. */
const PAD_Y = 9;
/** A target's width in engraved px: just under the spacing of sixteenth notes, so neighbors don't overlap. */
const TARGET_WIDTH = 16;

interface Target {
  group: NoteGroup;
  /** Where along the staff, 0 to 1, to keep the label on screen near the ends. */
  along: number;
  /** The button's place over the notes, and the label's under them. */
  style: CSSProperties;
  labelStyle: CSSProperties;
}

/** A length in engraved px as a share of the engraved staff, so it scales with it. */
const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;

interface Props {
  /** The exercise as written (right-handed): the labels mirror it for a left-handed kit. */
  exercise: Exercise;
  layout: StaffLayout;
}

/**
 * Invisible buttons over the notes of the engraved staff: tap, hover or
 * focus one to see which drum it is and which hand or foot plays it. Placed
 * from the engraved layout in percentages, so they follow the staff as CSS
 * scales it. One tab stop for the whole staff; the arrow keys move between
 * notes. No drum key is handled here (Space, letters), so the keyboard
 * fallback keeps working while a note has focus.
 */
export function NoteTargets({ exercise, layout }: Props) {
  const handedness = useHandedness();
  const targets = useMemo(() => {
    const byIndex = new Map(layout.marks.map((m) => [m.index, m]));
    return noteGroups(exercise, handedness).flatMap((group): Target[] => {
      const marks = group.indexes.flatMap((i) => byIndex.get(i) ?? []);
      if (marks.length === 0) return [];
      const ys = marks.map((m) => m.y);
      const x = marks.reduce((sum, m) => sum + m.x, 0) / marks.length;
      const top = Math.min(...ys) - PAD_Y;
      const bottom = Math.max(...ys) + PAD_Y;
      const left = pct(x, layout.width);
      return [
        {
          group,
          along: x / layout.width,
          style: { left, top: pct(top, layout.height), height: pct(bottom - top, layout.height), width: pct(TARGET_WIDTH, layout.width) },
          labelStyle: { left, top: pct(bottom, layout.height) },
        },
      ];
    });
  }, [exercise, handedness, layout]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // The note reached with Tab (roving tabindex), the one tapped or focused, and the one under the mouse.
  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? picked;

  const move = (to: number) => {
    const next = Math.max(0, Math.min(targets.length - 1, to));
    buttons.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: targets.length - 1 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      move(to);
    } else if (e.key === "Escape" && shown !== null) {
      // Closes the label only; the page's Esc (closing a panel) waits for the next press.
      e.stopPropagation();
      setPicked(null);
      setHovered(null);
    }
  };

  const target = shown === null ? undefined : targets[shown];
  const side = !target ? "middle" : target.along < 0.2 ? "start" : target.along > 0.8 ? "end" : "middle";

  return (
    <fieldset className="note-targets" aria-label="Notes on the staff: choose one to see which drum and hand play it">
      {targets.map((t, i) => (
        <button
          key={t.group.tick}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          type="button"
          className={`note-target ${shown === i ? "shown" : ""}`}
          style={t.style}
          tabIndex={i === current ? 0 : -1}
          aria-label={groupLabel(t.group)}
          onFocus={() => {
            setCurrent(i);
            setPicked(i);
            // Moving with the keyboard shows the note reached, not the one the mouse was left on.
            setHovered(null);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) setPicked(null);
          }}
          onClick={() => setPicked(i)}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setHovered(i);
          }}
          onPointerLeave={() => setHovered(null)}
          onKeyDown={(e) => onKeyDown(e, i)}
        />
      ))}
      {target && (
        // Screen readers get the same words from the focused button's name.
        <div
          className={`note-label ${side}`}
          style={target.labelStyle}
          aria-hidden
        >
          <span className="note-label-count">{target.group.count}</span>
          {target.group.lines.map((line) => (
            <span key={line} className="note-label-line">
              {line}
            </span>
          ))}
        </div>
      )}
    </fieldset>
  );
}
