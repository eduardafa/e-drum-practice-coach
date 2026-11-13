import { describe, expect, it } from "vitest";
import { checkSongFile, formatDuration, MAX_SONG_BYTES, songFingerprint, songTitle, tabSearchUrl, waveformPeaks } from "./song";

describe("checkSongFile", () => {
  it("accepts common audio files, whatever the case of the extension", () => {
    expect(checkSongFile({ name: "Back in Black.mp3", size: 9_000_000 })).toBeNull();
    expect(checkSongFile({ name: "track.M4A", size: 5_000_000 })).toBeNull();
    expect(checkSongFile({ name: "take.wav", size: 40_000_000 })).toBeNull();
  });

  it("explains what's wrong with anything else", () => {
    expect(checkSongFile({ name: "notes.txt", size: 100 })).toMatch(/isn't an audio file/);
    expect(checkSongFile({ name: "huge.wav", size: MAX_SONG_BYTES + 1 })).toMatch(/too big/);
    expect(checkSongFile({ name: "empty.mp3", size: 0 })).toMatch(/empty/);
    expect(checkSongFile({ name: "no-extension", size: 100 })).toMatch(/isn't an audio file/);
  });
});

describe("songTitle", () => {
  it("drops the extension", () => {
    expect(songTitle("04 Ghosts I.mp3")).toBe("04 Ghosts I");
    expect(songTitle("my.song.final.wav")).toBe("my.song.final");
  });
});

describe("formatDuration", () => {
  it("shows minutes and seconds, and hours when needed", () => {
    expect(formatDuration(187)).toBe("3:07");
    expect(formatDuration(59.9)).toBe("0:59");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(-3)).toBe("0:00");
  });
});

describe("waveformPeaks", () => {
  it("keeps the loudest level of each slice", () => {
    const samples = Float32Array.from([0.1, -0.5, 0.2, 0.9, -0.3, 0.0]);
    expect([...waveformPeaks(samples, 3)].map((v) => +v.toFixed(2))).toEqual([0.5, 0.9, 0.3]);
  });

  it("handles silence and empty input", () => {
    expect([...waveformPeaks(new Float32Array(10), 2)]).toEqual([0, 0]);
    expect([...waveformPeaks(new Float32Array(0), 4)]).toEqual([0, 0, 0, 0]);
  });
});

describe("songFingerprint", () => {
  const sr = 8000;
  const tone = (freq: number, seconds: number) =>
    Float32Array.from({ length: sr * seconds }, (_, i) => 0.5 * Math.sin((2 * Math.PI * freq * i) / sr));

  it("is the same for the same audio, and survives tiny decoder rounding", () => {
    const a = tone(220, 12);
    const b = a.map((v) => v + 1e-5);
    expect(songFingerprint(a, sr)).toBe(songFingerprint(a, sr));
    expect(songFingerprint(b, sr)).toBe(songFingerprint(a, sr));
  });

  it("differs for different audio or a different length", () => {
    expect(songFingerprint(tone(220, 12), sr)).not.toBe(songFingerprint(tone(330, 12), sr));
    expect(songFingerprint(tone(220, 12), sr)).not.toBe(songFingerprint(tone(220, 13), sr));
  });
});

/** The search words a tab link sends. */
const query = (title: string) => new URL(tabSearchUrl(title)).searchParams.get("pattern");

describe("tabSearchUrl", () => {
  it("searches Songsterr for the song's name", () => {
    expect(tabSearchUrl("Back in Black")).toBe("https://www.songsterr.com/?pattern=Back%20in%20Black");
  });

  it("cleans up a file name: underscores and a leading track number", () => {
    expect(query("04_Ghosts_I")).toBe("Ghosts I");
    expect(query("1. Seven Nation Army")).toBe("Seven Nation Army");
    expect(query("12 - Song 2")).toBe("Song 2");
  });

  it("keeps a name that is only a number, and escapes the rest", () => {
    expect(query("1979")).toBe("1979");
    expect(query("AC/DC & Friends?")).toBe("AC/DC & Friends?");
  });
});
