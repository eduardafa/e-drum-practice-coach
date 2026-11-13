/**
 * Which pads to light up on the kit view, and how strongly: a cue grows from
 * faint to full over the `leadMs` before a note, so a beginner sees the next
 * pad coming, then fades out quickly after the note's time. Pure, so the
 * shape over time is tested without drawing.
 */
import type { PadId } from "../kit/nitroMax";

export interface PadCue {
  pad: PadId;
  /** 0 (invisible) to 1 (play it now). */
  strength: number;
}

/** How faint a cue starts at the beginning of its lead time. */
const START_STRENGTH = 0.25;
/** How long a cue fades after its note's time. */
export const CUE_FADE_MS = 150;

/** The strongest cue per pad at `now`, from notes with a time (performance.now() ms) and a pad. */
export function cuesAt(
  notes: readonly { time: number; pad: PadId }[],
  now: number,
  leadMs: number,
  fadeMs = CUE_FADE_MS,
): PadCue[] {
  const strongest = new Map<PadId, number>();
  for (const note of notes) {
    const until = note.time - now;
    let strength: number;
    if (until > leadMs || until < -fadeMs) continue;
    if (until >= 0) strength = START_STRENGTH + (1 - START_STRENGTH) * (1 - until / leadMs);
    else strength = 1 + until / fadeMs;
    if (strength > (strongest.get(note.pad) ?? 0)) strongest.set(note.pad, strength);
  }
  return [...strongest].map(([pad, strength]) => ({ pad, strength }));
}

/** One beat ahead, kept between half a second-ish and a second so fast and slow tempos both read well. */
export function cueLeadMs(beatMs: number): number {
  return Math.min(1000, Math.max(350, beatMs));
}
