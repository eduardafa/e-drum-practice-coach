/**
 * Drumming words in plain language (EDU-143): one sentence each, written for
 * someone who has never played. Every explanation in the app reads from this
 * list, so a word means the same thing on every screen.
 */
export interface GlossaryEntry {
  /** The word as shown in the list, singular and lowercase unless it's an abbreviation. */
  word: string;
  /** One plain sentence. */
  definition: string;
}

export const GLOSSARY = [
  { word: "beat", definition: "The steady pulse you count along to; each click of the metronome is one beat." },
  { word: "bar", definition: "A group of beats, usually four, counted 1, 2, 3, 4 and then starting again." },
  { word: "tempo", definition: "How fast the music goes, measured in BPM." },
  { word: "BPM", definition: "Beats per minute: at 60 BPM there is one click every second, and higher is faster." },
  { word: "metronome", definition: "A steady click that keeps time for you, so you can tell if you speed up or slow down." },
  { word: "count-in", definition: "One bar of clicks before you start, so you feel the speed and know when to come in." },
  { word: "downbeat", definition: "The first beat of each bar, the \"1\" when you count 1, 2, 3, 4." },
  {
    word: "subdivision",
    definition: "Smaller, evenly spaced steps between the beats, like the \"&\" halfway between two clicks.",
  },
  { word: "groove", definition: "A short drum pattern that repeats to keep the beat going under a song." },
  { word: "fill", definition: "A short break from the groove, often around the drums, that leads into the next part of a song." },
  {
    word: "rudiment",
    definition: "A basic hand pattern, like right-left-right-left, practiced on its own to build control.",
  },
  { word: "sticking", definition: "Which hand plays each note: R for right and L for left." },
  { word: "accent", definition: "A note played clearly louder than the notes around it." },
  { word: "ghost note", definition: "A very quiet note, barely touched, that adds feel without standing out." },
  { word: "loop", definition: "One time through the pattern, which then starts again from the top." },
  {
    word: "on-time window",
    definition: "How close to the click a hit must land, in milliseconds either side, to count as on time.",
  },
  {
    word: "latency",
    definition: "The small delay between hitting a pad and the computer hearing it.",
  },
  {
    word: "latency offset",
    definition: "How much the app shifts your hits to make up for your setup's delay; calibrating measures it for you.",
  },
  {
    word: "consistency",
    definition: "How steady your timing is from hit to hit: the smaller the number, the more evenly your hits land.",
  },
] as const satisfies readonly GlossaryEntry[];

/** A word in the list, so a typo in a <Term> is a type error rather than a missing definition. */
export type GlossaryWord = (typeof GLOSSARY)[number]["word"];

/** Lowercase with single spaces, so "Ghost  Note" and "ghost note" match. */
function keyOf(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

const BY_KEY = new Map<string, GlossaryEntry>(GLOSSARY.map((entry) => [keyOf(entry.word), entry]));

/** The entry for a word, ignoring case and a plural "s" ("Ghost notes" finds "ghost note"); undefined when it isn't in the list. */
export function lookupTerm(word: string): GlossaryEntry | undefined {
  const key = keyOf(word);
  return BY_KEY.get(key) ?? (key.endsWith("s") ? BY_KEY.get(key.slice(0, -1)) : undefined);
}

/** The definition of a word in the list. */
export function define(word: GlossaryWord): string {
  return BY_KEY.get(keyOf(word))?.definition ?? "";
}
