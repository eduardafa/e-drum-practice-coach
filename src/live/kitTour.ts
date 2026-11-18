/**
 * Step 0 of First steps, "Meet your kit" (EDU-141): before any rhythm, learn
 * which pad is which. First a tour: one pad at a time is lit on the kit view
 * with its name, what it's for and how it's written, and the drummer hits it.
 * Then a short quiz: the app names a drum without lighting it, and the
 * drummer finds it. No click and no timing.
 *
 * Pure state, driven by the coach's hits, so the rules are tested without a
 * kit. The kit view reads `cues()` like it does for wait mode and mapping.
 */
import type { PadId } from "../kit/nitroMax";
import type { PadCue } from "../playalong/cues";

export interface TourPad {
  pad: PadId;
  /** What to call it, e.g. "Tom 3 (floor tom)". */
  name: string;
  /** Said mid-sentence, e.g. "hit the floor tom (tom 3)". */
  said: string;
  /** What it's for and which limb plays it, for a right-handed kit (mirrored for left-handed drummers). */
  role: string;
}

/** The tour's order: the Money beat's pads first, then the rest of the kit. */
export const TOUR_PADS: readonly TourPad[] = [
  { pad: "hihat", name: "Hi-hat", said: "hi-hat", role: "Two cymbals held closed by a pedal. Your right hand keeps time on it in most beats." },
  {
    pad: "snare",
    name: "Snare", said: "snare",
    role: "The drum just in front of you. It plays the backbeat, on 2 and 4, usually with your left hand.",
  },
  { pad: "kick", name: "Kick (bass drum)", said: "kick", role: "The low thump, played with your right foot on the big pedal." },
  {
    pad: "hihatPedal",
    name: "Hi-hat pedal", said: "hi-hat pedal",
    role: "Your left foot. Keep it pressed to close the hi-hat; press it on its own for a soft \"chick\".",
  },
  { pad: "crash", name: "Crash", said: "crash", role: "A cymbal for big moments, often on beat 1 right after a fill." },
  { pad: "ride", name: "Ride", said: "ride", role: "The cymbal on the right, for keeping time instead of the hi-hat." },
  { pad: "tom1", name: "Tom 1 (high tom)", said: "high tom (tom 1)", role: "The smaller tom above the kick. Toms are mostly for fills." },
  { pad: "tom2", name: "Tom 2 (middle tom)", said: "middle tom (tom 2)", role: "Next to tom 1, a little lower in pitch." },
  { pad: "tom3", name: "Tom 3 (floor tom)", said: "floor tom (tom 3)", role: "The biggest, lowest tom, to the right of your seat." },
];

/** How many drums the quiz asks for. */
export const QUIZ_LENGTH = 6;

export type TourPhase = "tour" | "quiz" | "done";

/** What the last hit was, for the feedback line. */
export type TourFeedback =
  | { kind: "right"; pad: PadId }
  /** Hit `hit` (null: a pad the app doesn't know) instead of `asked`. */
  | { kind: "wrong"; asked: PadId; hit: PadId | null };

export function tourPad(pad: PadId): TourPad {
  return TOUR_PADS.find((p) => p.pad === pad) ?? { pad, name: pad, said: pad, role: "" };
}

export class KitTour {
  private index = 0;
  private readonly skipped = new Set<PadId>();
  private quiz: PadId[] = [];
  private quizIndex = 0;
  /** Whether the current question has had a wrong hit: then it's lit, and it doesn't count as right first time. */
  private missedOnce = false;
  private rightFirstTime = 0;
  private listeners = new Set<() => void>();
  /** Bumped on every change, for React's useSyncExternalStore. */
  version = 0;
  feedback: TourFeedback | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  get phase(): TourPhase {
    if (this.index < TOUR_PADS.length) return "tour";
    return this.quizIndex < this.quiz.length ? "quiz" : "done";
  }

  /** The pad asked for now, or null when done. */
  get current(): PadId | null {
    if (this.phase === "tour") return TOUR_PADS[this.index].pad;
    return this.quiz[this.quizIndex] ?? null;
  }

  /** Position from 1, and the total, within the current phase: "3 of 9", "2 of 6". */
  get progress(): { at: number; of: number } {
    return this.phase === "tour"
      ? { at: this.index + 1, of: TOUR_PADS.length }
      : { at: Math.min(this.quizIndex + 1, this.quiz.length), of: this.quiz.length };
  }

  /** Quiz questions answered right on the first hit, and how many there were. */
  get score(): { right: number; of: number } {
    return { right: this.rightFirstTime, of: this.quiz.length };
  }

  /** Lit on the kit view: the tour's pad always, a quiz pad only after a wrong hit. */
  cues(): PadCue[] {
    const pad = this.current;
    if (!pad) return [];
    return this.phase === "tour" || this.missedOnce ? [{ pad, strength: 1 }] : [];
  }

  hit(played: { pad: PadId | null }): void {
    const asked = this.current;
    if (!asked) return;
    if (played.pad !== asked) {
      this.feedback = { kind: "wrong", asked, hit: played.pad };
      this.missedOnce = true;
      this.changed();
      return;
    }
    this.feedback = { kind: "right", pad: asked };
    if (this.phase === "tour") {
      this.index++;
      if (this.phase !== "tour") this.startQuiz();
    } else {
      if (!this.missedOnce) this.rightFirstTime++;
      this.quizIndex++;
    }
    this.missedOnce = false;
    this.changed();
  }

  /** The tour's pad isn't on this kit: move on, and leave it out of the quiz. */
  skip(): void {
    if (this.phase !== "tour") return;
    this.skipped.add(TOUR_PADS[this.index].pad);
    this.feedback = null;
    this.index++;
    if (this.phase !== "tour") this.startQuiz();
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Random pads from the ones toured, never the same one twice in a row, each used before any repeats. */
  private startQuiz(): void {
    const pool = TOUR_PADS.map((p) => p.pad).filter((p) => !this.skipped.has(p));
    const quiz: PadId[] = [];
    let bag: PadId[] = [];
    while (pool.length > 0 && quiz.length < QUIZ_LENGTH) {
      if (bag.length === 0) bag = [...pool];
      const last = quiz.at(-1);
      let choices = bag.filter((p) => p !== last);
      // Only the last pad is left in the bag: take another one early rather than repeat it.
      if (choices.length === 0) choices = pool.length > 1 ? pool.filter((p) => p !== last) : pool;
      const pick = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      const at = bag.indexOf(pick);
      if (at !== -1) bag.splice(at, 1);
      quiz.push(pick);
    }
    this.quiz = quiz;
    this.quizIndex = 0;
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
