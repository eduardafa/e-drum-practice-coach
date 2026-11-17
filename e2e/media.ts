/**
 * Files the browser tests open, made in code so nothing binary is committed:
 * a song (WAV), and a drum tab as MIDI and as Guitar Pro, built with the
 * same writers the unit tests use.
 */
import { Settings, exporter, importer } from "@coderline/alphatab/core";
import { midiFile, rockBeat, tempo } from "../src/songs/midiTestFiles";

export interface TestFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * A song `seconds` long at `bpm`: a low thump on every beat, deeper on each
 * beat 1, so the app's beat finder locks onto it and finds beat 1.
 */
export function clickSong(bpm = 120, seconds = 30): TestFile {
  const rate = 44100;
  const n = rate * seconds;
  const data = new Int16Array(n);
  const beat = 60 / bpm;
  for (let b = 0; b * beat < seconds; b++) {
    const start = Math.round(b * beat * rate);
    const pitch = b % 4 === 0 ? 60 : 90;
    for (let i = 0; i < rate * 0.12 && start + i < n; i++) {
      const t = i / rate;
      data[start + i] += Math.round(Math.exp(-t * 30) * 12000 * Math.sin(2 * Math.PI * pitch * t * (1 - t * 3)));
    }
  }
  const buffer = Buffer.alloc(44 + n * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + n * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(n * 2, 40);
  Buffer.from(data.buffer).copy(buffer, 44);
  return { name: "Test Song.wav", mimeType: "audio/wav", buffer };
}

/** Eight bars of a rock beat at 120 BPM, as a MIDI file. */
export function rockBeatMidi(): TestFile {
  return { name: "Rock Beat.mid", mimeType: "audio/midi", buffer: Buffer.from(midiFile(480, [[tempo(0, 120), ...rockBeat(480, 8)]])) };
}

/** Four bars of a basic beat at 120 BPM, as a Guitar Pro 7 file, from alphaTab's text format. */
export function rockBeatGuitarPro(): TestFile {
  const settings = new Settings();
  const bar = "(42 36).4 (42 38).4 (42 36).4 (42 38).4";
  const tex = `\\tempo 120 \\track "Drums" \\instrument percussion \\articulation defaults ${Array(4).fill(bar).join(" | ")}`;
  const score = importer.ScoreLoader.loadAlphaTex(tex, settings);
  return { name: "Rock Beat.gp", mimeType: "application/octet-stream", buffer: Buffer.from(new exporter.Gp7Exporter().export(score, settings)) };
}
