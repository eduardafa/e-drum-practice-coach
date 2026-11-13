import { describe, expect, it } from "vitest";
import { positionAt } from "./player";

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
