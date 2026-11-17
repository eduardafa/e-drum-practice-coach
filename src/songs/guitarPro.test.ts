import { Settings, exporter, importer } from "@coderline/alphatab/core";
import { describe, expect, it } from "vitest";
import { readGuitarProDrums } from "./guitarPro";
import { MidiError } from "./midiFile";
import { isMidiFile, readTabFile } from "./tabFile";

/** A Guitar Pro 7 file (.gp) from alphaTex, alphaTab's text format; `edit` can change the score first. */
function gpFile(tex: string, edit?: (score: ReturnType<typeof importer.ScoreLoader.loadAlphaTex>) => void): Uint8Array {
  const settings = new Settings();
  const score = importer.ScoreLoader.loadAlphaTex(tex, settings);
  edit?.(score);
  return new exporter.Gp7Exporter().export(score, settings);
}

const DRUMS = `\\track "Drums" \\instrument percussion \\articulation defaults`;
/** One bar of a basic beat in quarter notes: hi-hat on every beat, kick on 1 and 3, snare on 2 and 4. */
const BEAT = "(42 36).4 (42 38).4 (42 36).4 (42 38).4";

/** "beat:note" for each drum note, in beats from the start. */
const hits = (bytes: Uint8Array) => {
  const part = readGuitarProDrums(bytes);
  return part.notes.map((n) => `${n.tick / part.ppq}:${n.note}`).toSorted((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
};

describe("readGuitarProDrums", () => {
  it("reads the drum track's notes, tempo and time signature, leaving the other tracks out", () => {
    const file = gpFile(`\\tempo 90 \\track "Guitar" \\instrument 25 C4.4 D4 E4 F4 | ${DRUMS} ${BEAT}`, (score) => {
      // A guitar track on the drum channel must not end up in the tab.
      score.tracks[0].playbackInfo.primaryChannel = 9;
    });
    const part = readGuitarProDrums(file);
    expect(hits(file)).toEqual(["0:36", "0:42", "1:38", "1:42", "2:36", "2:42", "3:38", "3:42"]);
    expect(part.beatsPerBar).toBe(4);
    expect(60e6 / part.tempos[0].usPerQuarter).toBeCloseTo(90, 0);
  });

  it("finds drums on any channel and plays repeats out in full", () => {
    const file = gpFile(`${DRUMS} \\ro \\rc 2 ${BEAT} | (49 36).1`, (score) => {
      score.tracks[0].playbackInfo.primaryChannel = 3;
      score.tracks[0].playbackInfo.secondaryChannel = 3;
    });
    // The bar is played twice, then the crash.
    const beats = (note: number) => hits(file).filter((h) => h.endsWith(`:${note}`)).map(parseFloat);
    expect(beats(38)).toEqual([1, 3, 5, 7]);
    expect(beats(49)).toEqual([8]);
  });

  it("says why when a file has no drums or isn't Guitar Pro", () => {
    expect(() => readGuitarProDrums(gpFile(`\\track "Guitar" C4.4 D4 E4 F4`))).toThrow(/none of this file's tracks is drums/);
    expect(() => readGuitarProDrums(new TextEncoder().encode("not a tab at all"))).toThrow(MidiError);
  });
});

describe("readTabFile", () => {
  it("tells MIDI from Guitar Pro by the file's first bytes", async () => {
    const gp = gpFile(`${DRUMS} ${BEAT}`);
    expect(isMidiFile(gp)).toBe(false);
    expect((await readTabFile(gp)).notes.length).toBe(8);
    expect(isMidiFile(new TextEncoder().encode("MThd"))).toBe(true);
  });
});
