/**
 * Reads the drum part of a Guitar Pro file (.gp3 to .gp7, .gpx, .gp) with
 * alphaTab (MPL-2.0), loaded only when such a file is opened (EDU-94).
 *
 * alphaTab's own MIDI generator plays the score into a Standard MIDI File,
 * with repeats, tempo changes and each drum articulation's General MIDI note
 * worked out, so the drums come back exactly as a MIDI tab would and go
 * through the same reader (readMidiDrums). Only the drum tracks are kept on
 * MIDI channel 10; any other track sharing that channel is moved off it.
 */
import { LogLevel, Logger, Settings, importer, midi } from "@coderline/alphatab/core";
import { MidiError, readMidiDrums, type MidiDrumPart } from "./midiFile";

/** General MIDI drums are on channel 10, which is 9 when counting from 0. */
const DRUM_CHANNEL = 9;

// A file that fails is explained to the drummer; alphaTab's own log would only repeat it.
Logger.logLevel = LogLevel.None;

export function readGuitarProDrums(bytes: Uint8Array): MidiDrumPart {
  const settings = new Settings();
  let score;
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  } catch {
    throw new MidiError("This isn't a MIDI or Guitar Pro file this app can read.");
  }
  const drums = score.tracks.filter((t) => t.isPercussion);
  if (drums.length === 0) throw new MidiError("No drum part found: none of this file's tracks is drums.");
  for (const track of score.tracks) {
    const info = track.playbackInfo;
    if (track.isPercussion) {
      info.primaryChannel = DRUM_CHANNEL;
      info.secondaryChannel = DRUM_CHANNEL;
    } else {
      if (info.primaryChannel === DRUM_CHANNEL) info.primaryChannel = 0;
      if (info.secondaryChannel === DRUM_CHANNEL) info.secondaryChannel = 1;
    }
  }
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(score, settings, new midi.AlphaSynthMidiFileHandler(file, true)).generate();
  return readMidiDrums(file.toBinary());
}
