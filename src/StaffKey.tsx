import { useMemo, useState } from "react";
import type { Exercise } from "./exercises/types";
import { staffKey, type StaffPosition } from "./notation/staffKey";

const OPEN_KEY = "edrum-coach:notation-key-open";

/** Open the first time, so a beginner sees it; closed for good once they close it. */
function savedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open));
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** Five staff lines 4 px apart, from y = 8 (top) to 24 (bottom); one staff step is 2 px. */
const TOP = 8;
const BOTTOM = 24;
const CENTER = 11;

/** A tiny staff with one drum's notehead in its place. */
function MiniStaff({ position }: { position: StaffPosition }) {
  const y = BOTTOM - position.step * 2;
  return (
    <svg className="staff-key-staff" viewBox="0 0 22 30" aria-hidden>
      {[0, 1, 2, 3, 4].map((line) => (
        <line key={line} x1="1" x2="21" y1={TOP + line * 4} y2={TOP + line * 4} />
      ))}
      {/* A short extra line for a note above the staff (the crash). */}
      {y < TOP - 2 && <line className="ledger" x1="6" x2="16" y1={y} y2={y} />}
      {position.head === "x" ? (
        <path className="head-x" d={`M${CENTER - 2.4} ${y - 2.4} l4.8 4.8 M${CENTER - 2.4} ${y + 2.4} l4.8 -4.8`} />
      ) : (
        <ellipse className="head" cx={CENTER} cy={y} rx="3" ry="2.2" transform={`rotate(-20 ${CENTER} ${y})`} />
      )}
    </svg>
  );
}

/**
 * The key under the staff: which line or space is which drum, for the drums
 * the exercise uses. Collapsible; whether it's open is remembered in this browser.
 */
export function StaffKey({ exercise }: { exercise: Exercise }) {
  const [open, setOpen] = useState(savedOpen);
  const entries = useMemo(() => staffKey(exercise.notes.map((n) => n.pad)), [exercise]);
  return (
    <details
      className="staff-key"
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        setOpen(now);
        saveOpen(now);
      }}
    >
      <summary>Which drum is which</summary>
      <ul>
        {entries.map(({ pad, name, position }) => (
          <li key={pad} title={`${name}: ${position.where}`}>
            <MiniStaff position={position} />
            <span>{name}</span>
            <span className="visually-hidden">: {position.where}</span>
          </li>
        ))}
      </ul>
      <p className="staff-key-hint">Tap a note to see its drum and hand.</p>
    </details>
  );
}
