/**
 * The starter library: common grooves and rudiments, written as drum tab.
 * See grid.ts for the symbols. Every exercise is checked by library.test.ts.
 */
import { fromGrid } from "./grid";
import type { Exercise } from "./types";

const FOUR_FOUR = { beats: 4, unit: 4 } as const;
const SIX_EIGHT = { beats: 6, unit: 8 } as const;

export const GROOVES: readonly Exercise[] = [
  fromGrid({
    id: "rock-8ths",
    name: "Rock beat",
    category: "groove",
    description: "Eighth notes on the hi-hat, snare on 2 and 4, kick on 1 and 3. The foundation of most rock and pop.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 60, suggested: 80, max: 140 },
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x",
      snare: "- - x -  - - x -",
      kick: "x - - -  x - - -",
    },
  }),
  fromGrid({
    id: "rock-16ths",
    name: "Sixteenth-note hi-hat groove",
    category: "groove",
    description: "Sixteenths on the hi-hat with a kick on the 'and' of 3. Keep the hi-hat even while the kick moves.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 50, suggested: 70, max: 110 },
    stepsPerBar: 16,
    lanes: {
      hihat: "xxxx xxxx xxxx xxxx",
      snare: "---- x--- ---- x---",
      kick: "x--- ---- x-x- ----",
    },
  }),
  fromGrid({
    id: "half-time-ghosts",
    name: "Half-time groove with ghost notes",
    category: "groove",
    description: "Snare backbeat on 3 only, with quiet ghost notes in between. The ghost notes should be barely audible.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 60, suggested: 80, max: 120 },
    stepsPerBar: 16,
    lanes: {
      hihat: "x-x- x-x- x-x- x-x-",
      snare: "---g ---g X--g --g-",
      kick: "x--- --x- --x- ----",
    },
  }),
  fromGrid({
    id: "open-hihat",
    name: "Open hi-hat groove",
    category: "groove",
    description: "Open the hi-hat on the 'and' of 4 and close it with the pedal exactly on beat 1.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 60, suggested: 85, max: 130 },
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x o",
      hihatPedal: "x - - -  - - - -",
      snare: "- - x -  - - x -",
      kick: "x - - -  x - - -",
    },
  }),
  fromGrid({
    id: "six-eight",
    name: "6/8 groove",
    category: "groove",
    description: "Two groups of three eighth notes per bar: kick on 1, snare on 4. Tempo counts eighth notes.",
    timeSignature: SIX_EIGHT,
    bars: 1,
    tempo: { min: 90, suggested: 120, max: 180 },
    stepsPerBar: 6,
    lanes: {
      hihat: "xxx xxx",
      snare: "--- x--",
      kick: "x-- ---",
    },
  }),
];

export const RUDIMENTS: readonly Exercise[] = [
  fromGrid({
    id: "single-strokes",
    name: "Single strokes",
    category: "rudiment",
    description: "Alternate hands on sixteenth notes, accenting each beat. Both hands should sound the same.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 60, suggested: 80, max: 160 },
    stepsPerBar: 16,
    lanes: { snare: "Xxxx Xxxx Xxxx Xxxx" },
    sticking: "RLRL RLRL RLRL RLRL",
  }),
  fromGrid({
    id: "double-strokes",
    name: "Double strokes",
    category: "rudiment",
    description: "Two strokes per hand on sixteenth notes. The second stroke of each pair should be as strong as the first.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 60, suggested: 70, max: 140 },
    stepsPerBar: 16,
    lanes: { snare: "xxxx xxxx xxxx xxxx" },
    sticking: "RRLL RRLL RRLL RRLL",
  }),
  fromGrid({
    id: "paradiddle",
    name: "Single paradiddle",
    category: "rudiment",
    description: "RLRR LRLL, accenting the first note of each group, so the accent moves between hands.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 50, suggested: 70, max: 130 },
    stepsPerBar: 16,
    lanes: { snare: "Xxxx Xxxx Xxxx Xxxx" },
    sticking: "RLRR LRLL RLRR LRLL",
  }),
  fromGrid({
    id: "flam-taps",
    name: "Flam taps",
    category: "rudiment",
    description: "An accented flam followed by a tap with the same hand, alternating sides. Keep the grace note low and close.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 40, suggested: 60, max: 110 },
    stepsPerBar: 16,
    lanes: { snare: "FxFx FxFx FxFx FxFx" },
    sticking: "RRLL RRLL RRLL RRLL",
  }),
  fromGrid({
    id: "triplet-singles",
    name: "Triplet single strokes",
    category: "rudiment",
    description: "Eighth-note triplets with alternating hands, accenting each beat, so the accent switches hands every beat.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 50, suggested: 70, max: 140 },
    stepsPerBar: 12,
    lanes: { snare: "Xxx Xxx Xxx Xxx" },
    sticking: "RLR LRL RLR LRL",
  }),
];

export const EXERCISES: readonly Exercise[] = [...GROOVES, ...RUDIMENTS];

export function findExercise(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}
