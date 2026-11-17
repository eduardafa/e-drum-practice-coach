/**
 * Opening a drum tab file: a MIDI file (.mid) or a Guitar Pro file (EDU-94).
 * A MIDI file is recognized by its first bytes, whatever its name; anything
 * else is tried as Guitar Pro, whose reader (alphaTab) is only downloaded
 * then, so opening a MIDI tab or never opening a tab costs nothing extra.
 */
import { readMidiDrums, type MidiDrumPart } from "./midiFile";

/** What the file pickers offer. */
export const TAB_FILE_ACCEPT = ".mid,.midi,audio/midi,audio/x-midi,.gp,.gp3,.gp4,.gp5,.gpx";

/** "MThd", the start of every Standard MIDI File. */
export const isMidiFile = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;

/** The drum part of a MIDI or Guitar Pro file, or a MidiError saying why it can't be read. */
export async function readTabFile(bytes: Uint8Array): Promise<MidiDrumPart> {
  if (isMidiFile(bytes)) return readMidiDrums(bytes);
  const { readGuitarProDrums } = await import("./guitarPro");
  return readGuitarProDrums(bytes);
}
