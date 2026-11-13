import { describe, expect, it } from "vitest";
import type { PlayedHit } from "../playalong/matcher";
import type { PlacedNote } from "./drumTab";
import { SongTabScoring, tabMark, tabWindows, type TabNoteResult } from "./tabScoring";

const SCORING = { toleranceMs: 20, latencyOffsetMs: 0 };

/** Song second s is heard at performance time 10 000 + 1000 s ms. */
const toMs = (sec: number) => 10_000 + sec * 1000;

const note = (id: number, time: number, pad: PlacedNote["pad"], open = false): PlacedNote => ({ id, time, pad, open });

// Two beats at 120 BPM: kick and hi-hat on 1, hi-hat on the "and", snare and hi-hat on 2.
const TAB: PlacedNote[] = [
  note(0, 1, "kick"),
  note(1, 1, "hihat"),
  note(2, 1.25, "hihat"),
  note(3, 1.5, "snare"),
  note(4, 1.5, "hihat"),
];

const hit = (pad: PlayedHit["pad"], sec: number, zone: string | null = null): PlayedHit => ({
  pad,
  zone: zone ?? (pad === "hihat" ? "closed" : "head"),
  time: toMs(sec),
});

function scoring(fromSec = 0) {
  const s = new SongTabScoring(TAB, SCORING, fromSec);
  s.plan(10, toMs);
  return s;
}

describe("tabWindows", () => {
  it("gives each note half the gap to its pad's neighbors, capped at 100 ms", () => {
    const windows = tabWindows(TAB);
    expect(windows[0]).toBeCloseTo(0.1); // the only kick
    expect(windows[1]).toBeCloseTo(0.1); // hi-hats 250 ms apart: half is 125, capped
    expect(windows[3]).toBeCloseTo(0.1);
    const close = tabWindows([note(0, 1, "snare"), note(1, 1.1, "snare")]);
    expect(close[0]).toBeCloseTo(0.05);
    expect(close[1]).toBeCloseTo(0.05);
  });
});

describe("SongTabScoring", () => {
  it("scores each note on its own pad, in time", () => {
    const s = scoring();
    expect(s.hit(hit("kick", 1.005)).kind).toBe("hit");
    expect(s.hit(hit("hihat", 1)).kind).toBe("hit");
    expect(s.hit(hit("hihat", 1.29)).kind).toBe("hit"); // 40 ms late
    s.tick(toMs(1.2));
    expect(s.resultOf(2)?.result).toMatchObject({ status: "hit", verdict: "late" });
    expect(s.score()).toMatchObject({ played: 3, hit: 3, onTime: 2, late: 1, missed: 0, wrongDrum: 0 });
  });

  it("calls a hit on another drum, in a note's window, a wrong drum for that note", () => {
    const s = scoring();
    s.hit(hit("kick", 1));
    s.hit(hit("hihat", 1));
    s.hit(hit("hihat", 1.25));
    // Tom 1 where the snare should be.
    expect(s.hit(hit("tom1", 1.5)).kind).toBe("extra");
    s.hit(hit("hihat", 1.5));
    s.tick(toMs(2));
    expect(s.resultOf(3)).toEqual({ result: { status: "missed" }, wrongDrum: true });
    expect(s.score()).toMatchObject({ played: 5, hit: 4, missed: 1, wrongDrum: 1, extra: 0 });
  });

  it("counts a hit near no note as an extra, not a wrong drum", () => {
    const s = scoring();
    s.hit(hit("crash", 3));
    s.tick(toMs(4));
    expect(s.score()).toMatchObject({ missed: 5, wrongDrum: 0, extra: 1 });
  });

  it("doesn't count a wrong drum when the right one follows in time", () => {
    const s = scoring();
    s.hit(hit("tom1", 1.49));
    s.hit(hit("snare", 1.5));
    s.hit(hit("hihat", 1.5));
    s.tick(toMs(2));
    expect(s.resultOf(3)?.result.status).toBe("hit");
    expect(s.score().wrongDrum).toBe(0);
  });

  it("lets one wrong hit explain one missed note, not two", () => {
    const s = scoring();
    // A tom on beat 2, where both the snare and the hi-hat were due, and nothing else.
    s.hit(hit("tom1", 1.5));
    s.tick(toMs(2));
    expect(s.score()).toMatchObject({ missed: 5, wrongDrum: 1 });
  });

  it("tells closed from open hi-hat, as exercises do", () => {
    const s = scoring();
    s.hit(hit("hihat", 1.25, "open"));
    s.tick(toMs(2));
    expect(s.resultOf(2)).toEqual({ result: { status: "missed" }, wrongDrum: true });
  });

  it("only scores notes it was handed, from where the song started", () => {
    const s = new SongTabScoring(TAB, SCORING, 1.4);
    s.plan(1.3, toMs);
    expect(s.resultOf(3)).toBeNull();
    s.plan(2, toMs);
    expect(s.resultOf(2)).toBeNull(); // before the start
    expect(s.resultOf(3)?.result.status).toBe("pending");
  });

  it("waits for notes it can't place on the clock yet", () => {
    const s = new SongTabScoring(TAB, SCORING, 0);
    s.plan(10, () => null);
    expect(s.resultOf(0)).toBeNull();
    s.plan(10, toMs);
    expect(s.resultOf(0)?.result.status).toBe("pending");
  });

  it("removes the latency offset from hits", () => {
    const s = new SongTabScoring(TAB, { toleranceMs: 20, latencyOffsetMs: 30 }, 0);
    s.plan(10, toMs);
    s.hit(hit("kick", 1.03));
    expect(s.resultOf(0)?.result).toMatchObject({ status: "hit", verdict: "onTime" });
  });
});

describe("tabMark", () => {
  const results = new Map<number, TabNoteResult>([
    [0, { result: { status: "hit", deltaMs: 5, verdict: "onTime" }, wrongDrum: false }],
    [1, { result: { status: "missed" }, wrongDrum: false }],
    [2, { result: { status: "missed" }, wrongDrum: true }],
    [3, { result: { status: "pending" }, wrongDrum: false }],
  ]);

  it("shows how a written note went", () => {
    expect(tabMark([0], results)).toBe("onTime");
    expect(tabMark([1], results)).toBe("missed");
    expect(tabMark([2], results)).toBe("wrongDrum");
    expect(tabMark([3], results)).toBe("pending");
    expect(tabMark([9], results)).toBe("pending");
  });

  it("shows the worst of two strokes written as one note", () => {
    expect(tabMark([0, 1], results)).toBe("missed");
    expect(tabMark([1, 2], results)).toBe("wrongDrum");
    expect(tabMark([3, 0], results)).toBe("onTime");
  });
});
