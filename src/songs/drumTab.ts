/**
 * A song's drum tab from a MIDI drum part, placed on the song's beats.
 *
 * Each note's position is kept in beats (quarter notes from the start of the
 * file), not seconds. Placing the tab maps tab beat b to song beat b + shift
 * and spreads the notes within a beat evenly across that song beat, so the
 * tab follows the recording even where its tempo drifts. The shift starts as
 * a guess from the file's own timing, and the drummer can move it by a beat
 * or a bar. Pure, so it's tested.
 */
import type { PadId } from "../kit/nitroMax";
import type { BeatGrid } from "./beats";
import { nearestBeat } from "./gridEdit";
import { secondsAt, type MidiDrumPart } from "./midiFile";

/** General MIDI drum notes (and the Nitro Max's extra edge and rim notes) that are pads on the kit. */
const GM_PADS: Readonly<Record<number, { pad: PadId; open: boolean }>> = {
  35: { pad: "kick", open: false },
  36: { pad: "kick", open: false },
  37: { pad: "snare", open: false },
  38: { pad: "snare", open: false },
  40: { pad: "snare", open: false },
  41: { pad: "tom3", open: false },
  43: { pad: "tom3", open: false },
  58: { pad: "tom3", open: false },
  45: { pad: "tom2", open: false },
  47: { pad: "tom2", open: false },
  48: { pad: "tom1", open: false },
  50: { pad: "tom1", open: false },
  22: { pad: "hihat", open: false },
  42: { pad: "hihat", open: false },
  26: { pad: "hihat", open: true },
  46: { pad: "hihat", open: true },
  44: { pad: "hihatPedal", open: false },
  49: { pad: "crash", open: false },
  52: { pad: "crash", open: false },
  55: { pad: "crash", open: false },
  57: { pad: "crash", open: false },
  51: { pad: "ride", open: false },
  53: { pad: "ride", open: false },
  59: { pad: "ride", open: false },
};

export interface TabNote {
  /** Quarter notes from the start of the file. */
  beat: number;
  pad: PadId;
  /** An open hi-hat. */
  open: boolean;
}

export interface DrumTab {
  notes: TabNote[];
  /** Drum notes that aren't pads on the kit (cowbell, tambourine…), left out. */
  skipped: number;
  /** From the file's time signature; songs are counted in 4. */
  beatsPerBar: number;
  /** Where the first note is in the file, in seconds, from its own tempo: the hint for placing the tab. */
  firstNoteSeconds: number;
}

/** The kit's notes from a MIDI drum part; the same pad twice at one moment counts once. */
export function drumTabFrom(part: MidiDrumPart): DrumTab {
  const notes: TabNote[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const n of part.notes) {
    const pad = GM_PADS[n.note];
    if (!pad) {
      skipped += 1;
      continue;
    }
    const key = `${n.tick}:${pad.pad}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push({ beat: n.tick / part.ppq, pad: pad.pad, open: pad.open });
  }
  const first = part.notes[0];
  return { notes, skipped, beatsPerBar: part.beatsPerBar, firstNoteSeconds: first ? secondsAt(part, first.tick) : 0 };
}

export interface PlacedNote {
  /** Index in the tab's notes. */
  id: number;
  /** Song time, seconds. */
  time: number;
  pad: PadId;
  open: boolean;
}

/**
 * The tab's notes in song time, with tab beat b on song beat b + shift.
 * Notes that fall before the song's first beat or after its last are left out.
 */
export function placeTab(tab: DrumTab, grid: BeatGrid, shift: number): PlacedNote[] {
  const beats = grid.beats;
  const out: PlacedNote[] = [];
  if (beats.length < 2) return out;
  const lastGap = beats.at(-1)! - beats.at(-2)!;
  tab.notes.forEach((note, id) => {
    const pos = note.beat + shift;
    const i = Math.floor(pos + 1e-9);
    if (i < 0 || i >= beats.length) return;
    const gap = i + 1 < beats.length ? beats[i + 1] - beats[i] : lastGap;
    out.push({ id, time: beats[i] + (pos - i) * gap, pad: note.pad, open: note.open });
  });
  return out;
}

/**
 * A first guess at the shift: the tab's first note on the song beat nearest
 * where the file's own timing puts it, keeping the tab's bar lines on the
 * song's (tab beat 0 is a beat 1, and so is song beat firstDownbeat).
 */
export function guessShift(tab: DrumTab, grid: BeatGrid): number {
  const first = tab.notes[0];
  if (!first || grid.beats.length === 0) return grid.firstDownbeat;
  const raw = nearestBeat(grid, tab.firstNoteSeconds) - Math.round(first.beat);
  // The nearest shift that puts tab beat 0 on a song beat 1.
  const offBy = (((raw - grid.firstDownbeat) % 4) + 4) % 4;
  return offBy <= 2 ? raw - offBy : raw + (4 - offBy);
}
