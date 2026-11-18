/**
 * The one note to fix (EDU-138). The results screen gives totals, but a
 * beginner usually makes the same mistake on the same note every loop: the
 * snare on 3 is always late, or the "&" of 4 always gets skipped. This finds
 * that note when one clearly stands out from the rest of the pattern.
 *
 * Works from a saved session record and the exercise's notes (for where
 * each note is written), so a session opened from History gets it too.
 */
import { ticksPerBar, ticksPerBeat, type Exercise } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import { PAD_SAID } from "../kit/padNames";
import type { SessionRecord } from "./record";

export type Problem = "late" | "early" | "missed";

/** A note must go wrong (the same way) at least this share of the times it came round. */
export const MOSTLY = 0.5;

/** ...and this much more often than the rest of the pattern does, so it's this note, not the whole session. */
export const STANDS_OUT = 0.3;

/** ...and at least this many times: one slip isn't a habit. */
export const MIN_TIMES = 2;

export interface NoteToFix {
  problem: Problem;
  pad: PadId;
  /** The notes, by index in the exercise: one, or a few on the same drum with the same problem (the kick on 1 and 3). */
  indexes: number[];
  /** Where they're written, e.g. "on beat 3" or "on the "&" of beats 2 and 4". */
  where: string;
  /** How to count the first of them, for the tip: "3", "and", "e", "a". */
  say: string;
  /** How many times they went wrong this way, out of how many times they came round. */
  times: number;
  of: number;
}

const SYLLABLE: Record<string, { name: string; say: string }> = {
  "1/2": { name: '"&"', say: "and" },
  "1/4": { name: '"e"', say: "e" },
  "3/4": { name: '"a"', say: "a" },
  "1/3": { name: '"trip"', say: "trip" },
  "2/3": { name: '"let"', say: "let" },
};

interface Position {
  bar: number;
  beat: number;
  /** Empty on the beat itself. */
  syllable: string;
  say: string;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Where a tick sits in the count, or null for a spot with no common name (a 32nd note). */
function positionOf(tick: number, exercise: Pick<Exercise, "timeSignature">): Position | null {
  const barTicks = ticksPerBar(exercise.timeSignature);
  const beatTicks = ticksPerBeat(exercise.timeSignature);
  const inBar = tick % barTicks;
  const beat = Math.floor(inBar / beatTicks) + 1;
  const offset = inBar % beatTicks;
  const bar = Math.floor(tick / barTicks) + 1;
  if (offset === 0) return { bar, beat, syllable: "", say: String(beat) };
  const d = gcd(offset, beatTicks);
  const syllable = SYLLABLE[`${offset / d}/${beatTicks / d}`];
  return syllable ? { bar, beat, syllable: syllable.name, say: syllable.say } : null;
}

function list(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "on beat 3", "on beats 1 and 3", "on the "&" of beat 4", "on beat 1 and the "&" of beat 2", "... in bar 2". */
function describe(positions: readonly Position[], bars: number): string {
  const groups = new Map<string, Position[]>();
  for (const p of positions) {
    const key = `${p.bar}|${p.syllable}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const parts = [...groups.values()].map((group) => {
    const beats = `${group.length === 1 ? "beat" : "beats"} ${list(group.map((p) => String(p.beat)))}`;
    const said = group[0].syllable ? `the ${group[0].syllable} of ${beats}` : beats;
    return bars > 1 ? `${said} in bar ${group[0].bar}` : said;
  });
  return `on ${list(parts)}`;
}

/**
 * The note (or same-drum notes) that went wrong most consistently, or null
 * when nothing stands out: the session went well, or everything drifted
 * together (the average timing already says that).
 */
export function noteToFix(
  record: Pick<SessionRecord, "voices" | "notes" | "toleranceMs">,
  exercise: Pick<Exercise, "notes" | "timeSignature" | "bars">,
): NoteToFix | null {
  if (exercise.notes.length !== record.voices.length) return null;
  const tally = record.voices.map(() => ({ played: 0, late: 0, early: 0, missed: 0 }));
  for (const [index, , deltaMs] of record.notes) {
    const t = tally[index];
    if (!t) continue;
    t.played++;
    if (deltaMs === null) t.missed++;
    else if (deltaMs > record.toleranceMs) t.late++;
    else if (deltaMs < -record.toleranceMs) t.early++;
  }

  // Every note's worst problem, and how often it happened.
  const candidates: { index: number; problem: Problem; times: number; share: number }[] = [];
  tally.forEach((t, index) => {
    if (t.played === 0) return;
    for (const problem of ["missed", "late", "early"] as const) {
      const times = t[problem];
      if (times >= MIN_TIMES && times / t.played >= MOSTLY) candidates.push({ index, problem, times, share: times / t.played });
    }
  });
  if (candidates.length === 0) return null;

  const best = Math.max(...candidates.map((c) => c.share));
  const top = candidates.filter((c) => c.share === best);
  // Ties: keep the ones on the same drum with the same problem as the earliest, e.g. the kick late on 1 and 3.
  const first = top.toSorted((a, b) => exercise.notes[a.index].tick - exercise.notes[b.index].tick)[0];
  const pad = record.voices[first.index].pad;
  const chosen = top
    .filter((c) => c.problem === first.problem && record.voices[c.index].pad === pad)
    .toSorted((a, b) => exercise.notes[a.index].tick - exercise.notes[b.index].tick);
  const chosenSet = new Set(chosen.map((c) => c.index));

  // The rest of the pattern's share of the same problem: the chosen note must stand out from it.
  let restTimes = 0;
  let restPlayed = 0;
  tally.forEach((t, index) => {
    if (chosenSet.has(index)) return;
    restTimes += t[first.problem];
    restPlayed += t.played;
  });
  const restShare = restPlayed > 0 ? restTimes / restPlayed : 0;
  if (best - restShare < STANDS_OUT) return null;

  const positions = chosen.map((c) => positionOf(exercise.notes[c.index].tick, exercise));
  if (positions.some((p) => p === null)) return null;
  const known = positions.filter((p): p is Position => p !== null);

  return {
    problem: first.problem,
    pad,
    indexes: chosen.map((c) => c.index),
    where: describe(known, exercise.bars),
    say: known[0].say,
    times: chosen.reduce((sum, c) => sum + c.times, 0),
    of: chosen.reduce((sum, c) => sum + tally[c.index].played, 0),
  };
}

const WAS: Record<Problem, string> = { late: "late", early: "early", missed: "missed" };

/** What went wrong, said plainly: "The snare on beat 3 was late 6 of 8 times." */
export function noteToFixHeadline(fix: NoteToFix): string {
  const pad = PAD_SAID[fix.pad];
  return `The ${pad} ${fix.where} was ${WAS[fix.problem]} ${fix.times} of ${fix.of} times.`;
}

/** One thing to try about it. */
export function noteToFixTip(fix: NoteToFix): string {
  switch (fix.problem) {
    case "late":
      return `Count out loud and land the hit right on "${fix.say}", not after it.`;
    case "early":
      return `You're rushing it: wait for "${fix.say}" and hit right on the word.`;
    case "missed":
      return "Try the pattern with Learn, where the app waits for each hit, until this note comes without thinking.";
  }
}
