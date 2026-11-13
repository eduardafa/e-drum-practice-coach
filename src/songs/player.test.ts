import { describe, expect, it } from "vitest";
import { audioTimeAt, positionAt } from "./player";

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

describe("audioTimeAt", () => {
  it("maps a song position to the audio clock while playing", () => {
    expect(audioTimeAt({ offset: 10, startedAt: 100 }, 12.5)).toBe(102.5);
  });

  it("has no audio time while paused", () => {
    expect(audioTimeAt({ offset: 10, startedAt: null }, 12.5)).toBeNull();
  });
});
