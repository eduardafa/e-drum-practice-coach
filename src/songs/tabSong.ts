/**
 * A drum tab practiced on its own, without the song: its beats come straight
 * from the MIDI file's timing (tempo changes included), slowed down by a
 * speed factor for learning. It then runs on the same machinery as a song
 * (a silent track of the right length plays on the audio clock), so the
 * scrolling tab, the next-pad rings, Hear the tab, the click, the countdown
 * and Play along all work unchanged. Pure, so it's tested.
 */
import type { BeatGrid } from "./beats";
import type { DrumTab } from "./drumTab";
import { secondsAt, type MidiDrumPart } from "./midiFile";
import { SONG_BEATS_PER_BAR } from "./songSteps";

/** Speeds offered for a tab on its own, as fractions of the file's tempo. */
export const TAB_SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

export interface TabTimeline {
  grid: BeatGrid;
  /** Seconds: to the end of the bar after the tab's last note. */
  duration: number;
}

/** The tab's beats in seconds at `speed` (1 = the file's tempo), from beat 0 to a bar past its last note. */
export function tabTimeline(part: Pick<MidiDrumPart, "ppq" | "tempos">, tab: DrumTab, speed: number): TabTimeline {
  const lastBeat = tab.notes.reduce((max, n) => Math.max(max, n.beat), 0);
  const count = (Math.floor(lastBeat / SONG_BEATS_PER_BAR) + 2) * SONG_BEATS_PER_BAR;
  const beats = Array.from({ length: count + 1 }, (_, k) => secondsAt(part, k * part.ppq) / speed);
  const duration = beats.pop()!;
  return { grid: { beats, firstDownbeat: 0, bpm: 60 / (beats[1] - beats[0]) }, duration };
}
