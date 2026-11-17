/**
 * The starter library: a first-steps path, common grooves, fills and rudiments,
 * written as drum tab. See grid.ts for the symbols. Every exercise is checked
 * by library.test.ts.
 */
import { fromGrid } from "./grid";
import type { Exercise } from "./types";

const FOUR_FOUR = { beats: 4, unit: 4 } as const;
const SIX_EIGHT = { beats: 6, unit: 8 } as const;

/**
 * First steps: the Money beat built up one limb at a time, for someone who has
 * never played. Each step adds one thing to what came before, slowly (from
 * 40 BPM), and every step is scored like any exercise, so progress shows in
 * History. Steps 1, 2 and 4 are the metronome guide's first three steps.
 * Sticking is given only for the one-voice steps (hi-hat alone): on a two-voice
 * staff the sticking row collides with the feet's rests. The other steps follow
 * the groove convention (hi-hat right hand, snare left), as their text says.
 */
const FIRST_STEPS_TEMPO = { min: 40, suggested: 60, max: 100 } as const;

export const FIRST_STEPS: readonly Exercise[] = [
  fromGrid({
    id: "first-hihat-quarters",
    name: "Step 1: Hi-hat on every click",
    category: "first-steps",
    description:
      "One hit on the closed hi-hat with your right hand on each click. Count \"1, 2, 3, 4\" out loud and land each hit right on top of the click.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 4,
    lanes: { hihat: "x x x x" },
    sticking: "R R R R",
  }),
  fromGrid({
    id: "first-hihat-eighths",
    name: "Step 2: Hi-hat on every \"&\"",
    category: "first-steps",
    description:
      "Two even hits per click with your right hand: one on the click, one exactly halfway to the next. Count \"1 & 2 & 3 & 4 &\". This is the hi-hat part of the Money beat.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: { hihat: "x x x x  x x x x" },
    sticking: "R R R R  R R R R",
  }),
  fromGrid({
    id: "first-kick-snare",
    name: "Step 3: Kick and snare",
    category: "first-steps",
    description:
      "Kick pedal with your right foot on 1 and 3, snare with your left hand on 2 and 4: one hit per click, switching between them. This is the backbone of the Money beat.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 4,
    lanes: {
      snare: "- x - x",
      kick: "x - x -",
    },
  }),
  fromGrid({
    id: "first-hihat-kick",
    name: "Step 4: Hi-hat and kick",
    category: "first-steps",
    description:
      "Keep the hi-hat eighths from step 2 and press the kick together with the hi-hat on 1 and 3. The two should sound as one hit.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x",
      kick: "x - - -  x - - -",
    },
  }),
  fromGrid({
    id: "first-hihat-snare",
    name: "Step 5: Hi-hat and snare",
    category: "first-steps",
    description:
      "Hi-hat eighths with your right hand, and the snare with your left hand together with the hi-hat on 2 and 4. Next, add the kick from step 4 and you're playing the Money beat.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x",
      snare: "- - x -  - - x -",
    },
  }),
];

/**
 * First steps, part 2: after the Money beat, one change at a time: the kick
 * moves, the right hand moves to the ride, hands and feet swap speeds, then a
 * first fill and the crash that follows it. It leads to the sixteenth-note
 * hi-hat groove. Two-bar steps put the fill at the end, so looping plays
 * beat → fill → (crash) → beat, as in a song.
 */
export const FIRST_STEPS_2: readonly Exercise[] = [
  fromGrid({
    id: "first2-kick-and-of-3",
    name: "Part 2, step 1: Extra kick on the \"and\" of 3",
    category: "first-steps",
    description:
      "The Money beat with one more kick, right after beat 3, on its \"and\". Count \"3 &\" and press the kick on both. The hands don't change.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x",
      snare: "- - x -  - - x -",
      kick: "x - - -  x x - -",
    },
  }),
  fromGrid({
    id: "first2-ride",
    name: "Part 2, step 2: Money beat on the ride",
    category: "first-steps",
    description:
      "The Money beat with your right hand on the ride cymbal instead of the hi-hat. Keep your left foot pressed down on the hi-hat pedal so it stays quiet.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      ride: "x x x x  x x x x",
      snare: "- - x -  - - x -",
      kick: "x - - -  x - - -",
    },
  }),
  fromGrid({
    id: "first2-quarter-hihat",
    name: "Part 2, step 3: Quarter-note hi-hat, eighth-note kicks",
    category: "first-steps",
    description:
      "Swap speeds: the hi-hat slows to one hit per click, and the kick doubles up on 1 & and 3 &. Snare stays on 2 and 4. Go slowly: the feet now move faster than the hands.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x - x -  x - x -",
      snare: "- - x -  - - x -",
      kick: "x x - -  x x - -",
    },
  }),
  fromGrid({
    id: "first2-first-fill",
    name: "Part 2, step 4: Your first fill",
    category: "first-steps",
    description:
      "One bar of the Money beat, then a bar that ends with a fill: four snare hits on 3 & 4 &, with your right hand leaving the hi-hat. Then straight back to the beat.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x  x x x x  - - - -",
      snare: "- - x -  - - x -  - - x -  x x x x",
      kick: "x - - -  x - - -  x - - -  - - - -",
    },
  }),
  fromGrid({
    id: "first2-fill-crash",
    name: "Part 2, step 5: Fill, then crash on 1",
    category: "first-steps",
    description:
      "The fill from step 4, and after it a crash with the kick on beat 1, instead of the hi-hat. That's how a fill ends in a song. Then back to the hi-hat.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      crash: "x - - -  - - - -  - - - -  - - - -",
      hihat: "- x x x  x x x x  x x x x  - - - -",
      snare: "- - x -  - - x -  - - x -  x x x x",
      kick: "x - - -  x - - -  x - - -  - - - -",
    },
  }),
];

/**
 * First steps, part 3: after the sixteenth-note groove, how a beat is played
 * rather than which drums: loud and soft notes on the hi-hat, a ghost note on
 * the snare, a fill around the toms into a crash, and the open hi-hat. It
 * leads to the open hi-hat groove, which adds closing the hi-hat with the
 * foot. Back at part 1's tempos: each step is a new kind of movement.
 */
export const FIRST_STEPS_3: readonly Exercise[] = [
  fromGrid({
    id: "first3-hihat-accents",
    name: "Part 3, step 1: Loud and soft on the hi-hat",
    category: "first-steps",
    description:
      "The Money beat, with the hi-hat loud on the counts (1, 2, 3, 4) and soft on every \"&\". Lift the stick high for the loud ones and keep it low for the soft ones.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "X x X x  X x X x",
      snare: "- - x -  - - x -",
      kick: "x - - -  x - - -",
    },
  }),
  fromGrid({
    id: "first3-ghost-note",
    name: "Part 3, step 2: One ghost note",
    category: "first-steps",
    description:
      "The Money beat with one very quiet snare note, a ghost note, on the \"&\" of 4, just before beat 1. Barely touch the pad: you should feel it more than hear it.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x",
      snare: "- - x -  - - x g",
      kick: "x - - -  x - - -",
    },
  }),
  fromGrid({
    id: "first3-tom-fill",
    name: "Part 3, step 3: A fill on the toms",
    category: "first-steps",
    description:
      "One bar of the Money beat, then a bar that ends with a fill on the toms: two hits on tom 1, then two on tom 2, on 3 & 4 &. Then a crash with the kick on beat 1, and back to the hi-hat.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      crash: "x - - -  - - - -  - - - -  - - - -",
      hihat: "- x x x  x x x x  x x x x  - - - -",
      snare: "- - x -  - - x -  - - x -  - - - -",
      tom1: "- - - -  - - - -  - - - -  x x - -",
      tom2: "- - - -  - - - -  - - - -  - - x x",
      kick: "x - - -  x - - -  x - - -  - - - -",
    },
  }),
  fromGrid({
    id: "first3-open-hihat",
    name: "Part 3, step 4: Open the hi-hat on the \"&\" of 4",
    category: "first-steps",
    description:
      "The Money beat, but on the last \"&\" lift your left foot so the hi-hat rings open. Press it down again on beat 1. Only the hands are scored, so take your time with the foot.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: FIRST_STEPS_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x o",
      snare: "- - x -  - - x -",
      kick: "x - - -  x - - -",
    },
  }),
];

export const GROOVES: readonly Exercise[] = [
  fromGrid({
    id: "rock-8ths",
    name: "Money beat",
    category: "groove",
    description:
      "Also called the basic rock beat: eighth notes on the hi-hat, snare on 2 and 4, kick on 1 and 3. The foundation of most rock and pop.",
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

/**
 * Fills: one bar of the Money beat, then a bar with a fill, so each exercise
 * practices going into the fill and coming back out on beat 1, which is where
 * beginners get lost. Easiest first. Sticking is written only for the fill;
 * the groove bar follows the groove convention (hi-hat right hand, snare left).
 */
const FILL_TEMPO = { min: 40, suggested: 60, max: 120 } as const;

export const FILLS: readonly Exercise[] = [
  fromGrid({
    id: "fill-snare-quarters",
    name: "Fill 1: Quarter notes on the snare",
    category: "fill",
    description:
      "A bar of the Money beat, then four snare hits, one on each click, alternating hands. Come back to the hi-hat and kick on beat 1.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: FILL_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x | - - - -  - - - -",
      snare: "- - x -  - - x - | x - x -  x - x -",
      kick: "x - - -  x - - - | - - - -  - - - -",
    },
    sticking: "- - - -  - - - - | R - L -  R - L -",
  }),
  fromGrid({
    id: "fill-snare-eighths",
    name: "Fill 2: Eighth notes on the snare",
    category: "fill",
    description:
      "A bar of the Money beat, then eight snare hits, on every count and every \"&\", alternating hands. Count \"1 & 2 & 3 & 4 &\" out loud.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: FILL_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x | - - - -  - - - -",
      snare: "- - x -  - - x - | x x x x  x x x x",
      kick: "x - - -  x - - - | - - - -  - - - -",
    },
    sticking: "- - - -  - - - - | R L R L  R L R L",
  }),
  fromGrid({
    id: "fill-down-the-toms",
    name: "Fill 3: Down the toms",
    category: "fill",
    description:
      "Eighth notes moving around the kit, two on each drum: snare, tom 1, tom 2, tom 3. Keep alternating hands as you move, and land back on the hi-hat on 1.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: FILL_TEMPO,
    stepsPerBar: 8,
    lanes: {
      hihat: "x x x x  x x x x | - - - -  - - - -",
      snare: "- - x -  - - x - | x x - -  - - - -",
      tom1: "- - - -  - - - - | - - x x  - - - -",
      tom2: "- - - -  - - - - | - - - -  x x - -",
      tom3: "- - - -  - - - - | - - - -  - - x x",
      kick: "x - - -  x - - - | - - - -  - - - -",
    },
    sticking: "- - - -  - - - - | R L R L  R L R L",
  }),
  fromGrid({
    id: "fill-sixteenths-beat-4",
    name: "Fill 4: Sixteenth notes on beat 4",
    category: "fill",
    description:
      "Keep the beat going for three counts, then four fast snare hits on beat 4 (\"4 e & a\"), alternating hands. A short fill is the easiest way into faster notes.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: { min: 40, suggested: 55, max: 110 },
    stepsPerBar: 16,
    lanes: {
      hihat: "x-x- x-x- x-x- x-x- | x-x- x-x- x-x- ----",
      snare: "---- x--- ---- x--- | ---- x--- ---- xxxx",
      kick: "x--- ---- x--- ---- | x--- ---- x--- ----",
    },
    sticking: "---- ---- ---- ---- | ---- ---- ---- RLRL",
  }),
  fromGrid({
    id: "fill-sixteenths-around",
    name: "Fill 5: Sixteenth notes around the kit",
    category: "fill",
    description:
      "Two counts of the beat, then sixteenth notes on beats 3 and 4: snare, tom 1, tom 2 and tom 3, two hits each. Slow it down until every hit is even.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: { min: 40, suggested: 50, max: 100 },
    stepsPerBar: 16,
    lanes: {
      hihat: "x-x- x-x- x-x- x-x- | x-x- x-x- ---- ----",
      snare: "---- x--- ---- x--- | ---- x--- xx-- ----",
      tom1: "---- ---- ---- ---- | ---- ---- --xx ----",
      tom2: "---- ---- ---- ---- | ---- ---- ---- xx--",
      tom3: "---- ---- ---- ---- | ---- ---- ---- --xx",
      kick: "x--- ---- x--- ---- | x--- ---- ---- ----",
    },
    sticking: "---- ---- ---- ---- | ---- ---- RLRL RLRL",
  }),
  fromGrid({
    id: "fill-toms-crash",
    name: "Fill 6: Toms, then crash on 1",
    category: "fill",
    description:
      "A short fill on beats 3 and 4: snare, snare, tom 1, tom 2. Then a crash with the kick on beat 1, the way a fill ends in a song, and back to the hi-hat.",
    timeSignature: FOUR_FOUR,
    bars: 2,
    tempo: FILL_TEMPO,
    stepsPerBar: 8,
    lanes: {
      crash: "x - - -  - - - - | - - - -  - - - -",
      hihat: "- x x x  x x x x | x x x x  - - - -",
      snare: "- - x -  - - x - | - - x -  x x - -",
      tom1: "- - - -  - - - - | - - - -  - - x -",
      tom2: "- - - -  - - - - | - - - -  - - - x",
      kick: "x - - -  x - - - | x - - -  - - - -",
    },
    sticking: "- - - -  - - - - | - - - -  R L R L",
  }),
];

export const RUDIMENTS: readonly Exercise[] = [
  fromGrid({
    id: "accents-1-3",
    name: "Accents on 1 and 3",
    category: "rudiment",
    description:
      "Eighth notes on the snare, alternating hands. Hit beats 1 and 3 loud (lift the stick high) and every other note soft (stick low). The results show how many accents stood out.",
    timeSignature: FOUR_FOUR,
    bars: 1,
    tempo: { min: 40, suggested: 60, max: 120 },
    stepsPerBar: 8,
    lanes: { snare: "Xx xx Xx xx" },
    sticking: "RL RL RL RL",
  }),
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

export const EXERCISES: readonly Exercise[] = [...FIRST_STEPS, ...FIRST_STEPS_2, ...FIRST_STEPS_3, ...GROOVES, ...FILLS, ...RUDIMENTS];

export function findExercise(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}
