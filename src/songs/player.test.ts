import { describe, expect, it } from "vitest";
import { audioTimeAt, planWindows, positionAt, songWindows, windowAudioTime, windowUntil, type PassCursor } from "./player";

describe("positionAt", () => {
  it("stays put while paused", () => {
    expect(positionAt({ offset: 12.5, startedAt: null }, 99, 180)).toBe(12.5);
  });

  it("advances with the audio clock while playing", () => {
    expect(positionAt({ offset: 10, startedAt: 100 }, 103.5, 180)).toBe(13.5);
  });

  it("never goes past the end or before the start", () => {
    expect(positionAt({ offset: 178, startedAt: 100 }, 110, 180)).toBe(180);
    expect(positionAt({ offset: 0, startedAt: 100 }, 99, 180)).toBe(0);
  });
});

describe("positionAt before a delayed start", () => {
  it("stays where playback will start until it does", () => {
    expect(positionAt({ offset: 30, startedAt: 100 }, 97, 200)).toBe(30);
    expect(positionAt({ offset: 30, startedAt: 100 }, 101.5, 200)).toBe(31.5);
  });
});

describe("audioTimeAt", () => {
  it("maps a song position to the audio clock while playing", () => {
    expect(audioTimeAt({ offset: 10, startedAt: 100 }, 12.5)).toBe(102.5);
  });

  it("has no audio time while paused", () => {
    expect(audioTimeAt({ offset: 10, startedAt: null }, 12.5)).toBeNull();
  });
});

describe("positionAt with a loop", () => {
  const loop = { start: 10, end: 18 };

  it("wraps back to the loop's start once past its end, again and again", () => {
    // Started at 12 at audio time 100: the end (18) comes at 106, then every 8 s.
    expect(positionAt({ offset: 12, startedAt: 100 }, 105, 180, loop)).toBe(17);
    expect(positionAt({ offset: 12, startedAt: 100 }, 106, 180, loop)).toBe(10);
    expect(positionAt({ offset: 12, startedAt: 100 }, 107.5, 180, loop)).toBe(11.5);
    expect(positionAt({ offset: 12, startedAt: 100 }, 106 + 8 * 3 + 2, 180, loop)).toBe(12);
  });

  it("doesn't wrap while paused", () => {
    expect(positionAt({ offset: 12, startedAt: null }, 500, 180, loop)).toBe(12);
  });
});

describe("songWindows", () => {
  it("is one window to the end of the song without a loop, and none while paused", () => {
    expect(songWindows({ offset: 30, startedAt: 100 }, null, 180, 101, 0.5)).toEqual([{ pass: 0, from: 30, to: 180, audioStart: 100 }]);
    expect(songWindows({ offset: 30, startedAt: null }, null, 180, 101, 0.5)).toEqual([]);
  });

  it("with a loop, runs to its end, then adds the next pass once it's within reach", () => {
    const loop = { start: 10, end: 18 };
    const state = { offset: 12, startedAt: 100 };
    // The first pass ends at 106: far off at 101, so one window.
    expect(songWindows(state, loop, 180, 101, 0.5)).toEqual([{ pass: 0, from: 12, to: 18, audioStart: 100 }]);
    // Half a second before it ends, the next pass is in reach too.
    expect(songWindows(state, loop, 180, 105.7, 0.5)).toEqual([
      { pass: 0, from: 12, to: 18, audioStart: 100 },
      { pass: 1, from: 10, to: 18, audioStart: 106 },
    ]);
    // Well into the third pass: only it (and later ones once in reach).
    expect(songWindows(state, loop, 180, 115, 0.5)).toEqual([{ pass: 2, from: 10, to: 18, audioStart: 114 }]);
  });

  it("maps each window's song time to its own audio time, so a pass's first beat lands on the jump", () => {
    const [, second] = songWindows({ offset: 12, startedAt: 100 }, { start: 10, end: 18 }, 180, 105.7, 0.5);
    expect(second && windowAudioTime(second, 10)).toBe(106);
    expect(second && windowAudioTime(second, 10.5)).toBe(106.5);
    // Plan no further than the audio horizon, nor past the window's end.
    expect(second && windowUntil(second, 106.2)).toBeCloseTo(10.2);
    expect(windowUntil({ pass: 0, from: 12, to: 18, audioStart: 100 }, 200)).toBe(18);
  });

  it("keeps a delayed start (the get-ready countdown) in the first window", () => {
    expect(songWindows({ offset: 0, startedAt: 105 }, null, 60, 100, 0.5)).toEqual([{ pass: 0, from: 0, to: 60, audioStart: 105 }]);
  });
});

describe("planWindows", () => {
  // Beats every half second; a loop over 2..4 s, started at 3 s at audio time 100 (the end comes at 101).
  const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
  const loop = { start: 2, end: 4 };
  const state = { offset: 3, startedAt: 100 };
  const firstFrom = (sec: number) => beats.findIndex((b) => b >= sec);
  const plan = (cursor: PassCursor, now: number, ahead: number) => {
    const out: [number, number][] = [];
    planWindows(songWindows(state, loop, 60, now, ahead), now + ahead, cursor, beats.length, (i) => beats[i], firstFrom, (i, at) => out.push([beats[i], at]));
    return out;
  };

  it("plans across the loop's jump: the end beat isn't played, the start beat lands exactly on the jump", () => {
    const cursor = { pass: -1, next: 0 };
    expect(plan(cursor, 100, 0.6)).toEqual([
      [3, 100],
      [3.5, 100.5],
    ]);
    // Near the end, the next pass is in reach: 4 s (the loop's end) is skipped, 2 s plays at 101.
    expect(plan(cursor, 100.6, 0.6)).toEqual([[2, 101]]);
    // Then the rest of that pass as it comes into reach (horizon 101.8, then 102.6).
    expect(plan(cursor, 101.2, 0.6)).toEqual([[2.5, 101.5]]);
    expect(plan(cursor, 102, 0.6)).toEqual([
      [3, 102],
      [3.5, 102.5],
    ]);
  });

  it("plans nothing twice across calls", () => {
    const cursor = { pass: -1, next: 0 };
    const all = [...plan(cursor, 100, 0.3), ...plan(cursor, 100.1, 0.3), ...plan(cursor, 100.3, 0.3), ...plan(cursor, 100.6, 0.6)];
    expect(all.map(([, at]) => at)).toEqual([100, 100.5, 101]);
  });
});
