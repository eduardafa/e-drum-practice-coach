/**
 * Checks an exercise against the format's rules. Returns every problem found,
 * so a broken exercise fails its test with a full explanation.
 */
import { MAX_BPM, MIN_BPM } from "../audio/schedule";
import { NITRO_MAX_PADS, type PadId } from "../kit/nitroMax";
import { exerciseLengthTicks, type Exercise } from "./types";

const PAD_IDS: ReadonlySet<string> = new Set(NITRO_MAX_PADS.map((p) => p.id));
const PAD_ORDER = new Map<PadId, number>(NITRO_MAX_PADS.map((p, i) => [p.id, i]));
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Order notes are kept in: by tick, then by pad in kit order. */
export function compareNotes(a: { tick: number; pad: PadId }, b: { tick: number; pad: PadId }): number {
  return a.tick - b.tick || (PAD_ORDER.get(a.pad) ?? 0) - (PAD_ORDER.get(b.pad) ?? 0);
}

export function validateExercise(exercise: Exercise): string[] {
  const errors: string[] = [];
  const { id, timeSignature: ts, bars, tempo, notes } = exercise;

  if (!ID_PATTERN.test(id)) errors.push(`id "${id}" must be lowercase letters, digits and hyphens`);
  if (exercise.name.trim() === "") errors.push("name is empty");
  if (exercise.description.trim() === "") errors.push("description is empty");
  if (!Number.isInteger(ts.beats) || ts.beats < 1 || ts.beats > 16) {
    errors.push(`time signature beats ${ts.beats} must be a whole number from 1 to 16`);
  }
  if (ts.unit !== 4 && ts.unit !== 8) errors.push(`time signature unit ${String(ts.unit)} must be 4 or 8`);
  if (!Number.isInteger(bars) || bars < 1) errors.push(`bars ${bars} must be a whole number of at least 1`);
  if (!(tempo.min <= tempo.suggested && tempo.suggested <= tempo.max)) {
    errors.push(`tempo must satisfy min ≤ suggested ≤ max (got ${tempo.min}, ${tempo.suggested}, ${tempo.max})`);
  }
  if (tempo.min < MIN_BPM || tempo.max > MAX_BPM) {
    errors.push(`tempo must stay within ${MIN_BPM}–${MAX_BPM} BPM`);
  }
  if (notes.length === 0) errors.push("has no notes");

  const length = exerciseLengthTicks(exercise);
  const seen = new Set<string>();
  notes.forEach((note, i) => {
    const where = `note ${i} (tick ${note.tick}, ${note.pad})`;
    if (!Number.isInteger(note.tick) || note.tick < 0 || note.tick >= length) {
      errors.push(`${where}: tick must be a whole number from 0 to ${length - 1}`);
    }
    if (!PAD_IDS.has(note.pad)) errors.push(`${where}: unknown pad`);
    if (note.open && note.pad !== "hihat") errors.push(`${where}: only the hi-hat can be open`);
    const key = `${note.tick}:${note.pad}`;
    if (seen.has(key)) errors.push(`${where}: two notes on the same pad at the same tick`);
    seen.add(key);
    const prev = notes[i - 1];
    if (prev && compareNotes(prev, note) > 0) errors.push(`${where}: notes are out of order`);
  });

  return errors;
}

/** Checks a whole library: every exercise valid, and ids unique. */
export function validateLibrary(exercises: readonly Exercise[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const exercise of exercises) {
    if (ids.has(exercise.id)) errors.push(`duplicate id "${exercise.id}"`);
    ids.add(exercise.id);
    for (const error of validateExercise(exercise)) errors.push(`${exercise.id}: ${error}`);
  }
  return errors;
}
