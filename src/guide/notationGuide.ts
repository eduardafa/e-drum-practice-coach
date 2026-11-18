/**
 * "How to read drum notation": a short guide, one idea per page, each with a
 * small example drawn by the same engraver as the exercises. The examples are
 * tiny exercises written as drum tab (see exercises/grid.ts), so they're
 * checked like the library's and can be heard with the library's Listen.
 *
 * Only what the app's exercises actually show is taught: the staff positions
 * of engrave.ts, x noteheads for cymbals, quarter to sixteenth notes and
 * triplets, rests, accents, ghost notes in brackets, the open hi-hat's small
 * circle, flams and the R/L sticking letters.
 */
import { fromGrid, type GridSpec } from "../exercises/grid";
import type { Exercise } from "../exercises/types";

export interface NotationGuidePage {
  id: string;
  title: string;
  /** Short paragraphs, in plain words. */
  text: readonly string[];
  /** One bar of notation showing the idea. */
  example: Exercise;
  /** The counts to say along with the example, if counting helps here. */
  count?: string;
  /** Whether hearing the example helps (a page about where drums sit on the staff has nothing to hear). */
  listen: boolean;
}

/** The exercise the guide's last page offers to try: First steps, step 1. */
export const NOTATION_GUIDE_TRY_ID = "first-hihat-quarters";

/** Slow, like the First steps: one click per second. */
const TEMPO = { min: 40, suggested: 60, max: 100 } as const;

/** A one-bar 4/4 example. Ids start with "guide-" so they never clash with the library's. */
function example(id: string, spec: Pick<GridSpec, "stepsPerBar" | "lanes" | "sticking">): Exercise {
  return fromGrid({
    id: `guide-${id}`,
    name: "Example",
    category: "first-steps",
    description: "An example from the notation guide.",
    timeSignature: { beats: 4, unit: 4 },
    bars: 1,
    tempo: TEMPO,
    ...spec,
  });
}

export const NOTATION_GUIDE: readonly NotationGuidePage[] = [
  {
    id: "drums",
    title: "Each drum has its own place",
    text: [
      "Drum music is written on five lines, called the staff. Each drum sits on its own line or in its own space between two lines.",
      "From the bottom: the kick is in the bottom space, tom 3 (the big floor tom) in the second space, the snare in the third space, tom 2 on the fourth line and tom 1 in the top space.",
      "Notes for the hands have their stems going up. The kick, played with a foot, has its stem going down.",
    ],
    example: example("drums", {
      stepsPerBar: 8,
      lanes: { tom1: "- x - - - - - -", tom2: "- - - x - - - -", snare: "- - - - - x - -", tom3: "- - - - - - - x", kick: "x - x - x - x -" },
    }),
    listen: false,
  },
  {
    id: "cymbals",
    title: "Cymbals are written as an x",
    text: [
      "Cymbals ring instead of thumping, so they get an x instead of a round note. They sit above the drums: the ride on the top line, the hi-hat just above the staff, and the crash on a short extra line higher up.",
      "An x below the staff is the hi-hat pedal: press it down with your foot, without using a stick.",
    ],
    example: example("cymbals", {
      stepsPerBar: 4,
      lanes: { crash: "x - - -", hihat: "- x - -", ride: "- - x -", hihatPedal: "- - - x" },
    }),
    listen: false,
  },
  {
    id: "quarters",
    title: "Counting: quarter notes",
    text: [
      "The 4/4 at the start means each bar has 4 beats: one per metronome click. The upright line at the end closes the bar, and the exercise starts over from the beginning.",
      "A note with just a stem is a quarter note: it lasts one beat. Four of them fill a bar: count \"1, 2, 3, 4\", one hit per click.",
    ],
    example: example("quarters", { stepsPerBar: 4, lanes: { hihat: "x x x x" } }),
    count: "1 2 3 4",
    listen: true,
  },
  {
    id: "eighths",
    title: "Counting: eighth notes",
    text: [
      "Eighth notes are twice as fast: two per click. They're joined in pairs by one line, called a beam.",
      "Say \"&\" (\"and\") for the note halfway between two clicks: \"1 & 2 & 3 & 4 &\".",
    ],
    example: example("eighths", { stepsPerBar: 8, lanes: { hihat: "x x x x  x x x x" } }),
    count: "1 & 2 & 3 & 4 &",
    listen: true,
  },
  {
    id: "sixteenths",
    title: "Counting: sixteenth notes",
    text: [
      "Sixteenth notes are twice as fast again: four per click, joined in groups of four by two beams.",
      "Count them \"1 e & a\" (say \"one ee and uh\"), then \"2 e & a\", and so on. The numbers still land on the clicks.",
    ],
    example: example("sixteenths", { stepsPerBar: 16, lanes: { hihat: "xxxx xxxx xxxx xxxx" } }),
    count: "1 e & a 2 e & a 3 e & a 4 e & a",
    listen: true,
  },
  {
    id: "triplets",
    title: "Counting: threes",
    text: [
      "A small 3 over a group of notes means three even notes in one click, instead of two or four.",
      "Count them \"1 trip let, 2 trip let\". Only a few rudiments use them.",
    ],
    example: example("triplets", { stepsPerBar: 12, lanes: { snare: "xxx xxx xxx xxx" } }),
    count: "1 trip let 2 trip let 3 trip let 4 trip let",
    listen: true,
  },
  {
    id: "rests",
    title: "Rests: when nothing is played",
    text: [
      "A rest is a sign for silence: keep counting, but don't hit anything. Each rest lasts as long as the note it stands in for.",
      "Here the snare plays on 2 and 4, and the squiggly quarter rests on 1 and 3 say to wait.",
    ],
    example: example("rests", { stepsPerBar: 4, lanes: { snare: "- x - x" } }),
    count: "(1) 2 (3) 4",
    listen: true,
  },
  {
    id: "together",
    title: "Notes on one stem are played together",
    text: [
      "Read the staff from left to right. Notes stacked on top of each other are hit at the same moment, even when one stem goes up and the other down.",
      "This is the Money beat: hi-hat on every count, the kick with it on 1 and 3, the snare with it on 2 and 4.",
    ],
    example: example("together", {
      stepsPerBar: 8,
      lanes: { hihat: "x x x x  x x x x", snare: "- - x -  - - x -", kick: "x - - -  x - - -" },
    }),
    count: "1 & 2 & 3 & 4 &",
    listen: true,
  },
  {
    id: "dynamics",
    title: "Loud and soft: accents and ghost notes",
    text: [
      "A > over or under a note is an accent: play it louder.",
      "A note in brackets ( ) is a ghost note: play it very quietly, barely touching the pad.",
      "Here the hi-hat is loud on the counts and soft on each \"&\", with one ghost note on the snare at the end.",
    ],
    example: example("dynamics", {
      stepsPerBar: 8,
      lanes: { hihat: "X x X x  X x X x", snare: "- - x -  - - x g", kick: "x - - -  x - - -" },
    }),
    listen: true,
  },
  {
    id: "open-hihat",
    title: "The open hi-hat",
    text: [
      "A small circle (o) above a hi-hat note means open: lift your foot off the hi-hat pedal so the two cymbals ring apart.",
      "Press the pedal down again for the next note, so the hi-hat is closed again.",
    ],
    example: example("open-hihat", {
      stepsPerBar: 8,
      lanes: { hihat: "x x x x  x x x o", snare: "- - x -  - - x -", kick: "x - - -  x - - -" },
    }),
    listen: true,
  },
  {
    id: "flams",
    title: "Flams: a tiny note just before",
    text: [
      "A small slashed note just before a main note is a flam. Hit the small one softly with one stick, and the main note a moment later with the other, so they sound like one thick note.",
    ],
    example: example("flams", { stepsPerBar: 4, lanes: { snare: "f f f f" }, sticking: "R L R L" }),
    count: "1 2 3 4",
    listen: true,
  },
  {
    id: "sticking",
    title: "R and L: which hand",
    text: [
      "Letters under the notes say which hand to use: R for right, L for left. They're written on hand exercises like rudiments, where the order of the hands is the point.",
      "On a left-handed kit (Settings), the letters are swapped to match.",
    ],
    example: example("sticking", { stepsPerBar: 8, lanes: { snare: "x x x x  x x x x" }, sticking: "R L R L  R L R L" }),
    count: "1 & 2 & 3 & 4 &",
    listen: true,
  },
];
