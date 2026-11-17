import { describe, expect, it } from "vitest";
import type { Dynamic } from "../exercises/types";
import { dynamicsTip, NOTE_GAP, sessionDynamics, type DynamicsResult } from "./dynamics";
import type { NoteTuple, SessionRecord } from "./record";

type Voice = SessionRecord["voices"][number];

const voice = (dynamic: Dynamic): Voice => ({ pad: "snare", dynamic, hand: null });

/** A session of one loop: one played note per voice, at these velocities (null: missed). */
function session(played: [Dynamic, number | null][]): Pick<SessionRecord, "voices" | "notes"> {
  return {
    voices: played.map(([d]) => voice(d)),
    notes: played.map(([, velocity], index): NoteTuple => [index, 0, velocity === null ? null : 3, velocity]),
  };
}

describe("sessionDynamics", () => {
  it("says nothing when the exercise asks for no accents or ghost notes", () => {
    expect(sessionDynamics(session([["normal", 80], ["normal", 90]]))).toBeNull();
  });

  it("counts accents clearly louder than the normal notes' median", () => {
    const result = sessionDynamics(
      session([
        ["normal", 70],
        ["normal", 80],
        ["normal", 90],
        ["accent", 80 + NOTE_GAP],
        ["accent", 80 + NOTE_GAP - 1],
        ["accent", 127],
      ]),
    );
    expect(result).toMatchObject({ reference: 80, accents: { played: 3, good: 2 }, ghosts: null, sameStrength: false });
  });

  it("counts ghost notes clearly softer than the normal notes", () => {
    const result = sessionDynamics(session([["normal", 90], ["normal", 90], ["ghost", 40], ["ghost", 85]]));
    expect(result).toMatchObject({ reference: 90, ghosts: { played: 2, good: 1 }, accents: null });
  });

  it("leaves missed notes and unknown velocities out", () => {
    const result = sessionDynamics(session([["normal", 80], ["normal", 80], ["accent", null], ["accent", 110]]));
    expect(result?.accents).toEqual({ played: 1, good: 1 });
    const unknown: Pick<SessionRecord, "voices" | "notes"> = {
      voices: [voice("normal"), voice("accent")],
      notes: [
        [0, 0, 2, 80],
        [1, 0, 2, null],
      ],
    };
    expect(sessionDynamics(unknown)).toBeNull();
  });

  it("compares with the middle of all notes when there are too few normal notes", () => {
    const result = sessionDynamics(session([["accent", 110], ["ghost", 40], ["accent", 112], ["ghost", 44]]));
    expect(result?.reference).toBe(77);
    expect(result?.accents?.good).toBe(2);
    expect(result?.ghosts?.good).toBe(2);
  });

  it("notices when every hit had the same strength", () => {
    const result = sessionDynamics(session([["normal", 100], ["accent", 100], ["normal", 100], ["accent", 100]]));
    expect(result?.sameStrength).toBe(true);
    expect(result?.accents?.good).toBe(0);
  });

  it("counts every loop of the exercise", () => {
    const record: Pick<SessionRecord, "voices" | "notes"> = {
      voices: [voice("normal"), voice("accent")],
      notes: [
        [0, 0, 1, 80],
        [1, 0, 1, 110],
        [0, 1, 1, 80],
        [1, 1, 1, 82],
      ],
    };
    expect(sessionDynamics(record)?.accents).toEqual({ played: 2, good: 1 });
  });
});

const result = (accents: [number, number] | null, ghosts: [number, number] | null, sameStrength = false): DynamicsResult => ({
  accents: accents && { good: accents[0], played: accents[1] },
  ghosts: ghosts && { good: ghosts[0], played: ghosts[1] },
  reference: 80,
  sameStrength,
});

describe("dynamicsTip", () => {
  it("explains a keyboard (or fixed velocity) instead of scolding", () => {
    expect(dynamicsTip(result([0, 8], null, true))).toMatch(/same strength/);
  });

  it("asks for louder accents, softer ghosts, or both", () => {
    expect(dynamicsTip(result([2, 8], null))).toMatch(/accents don't stand out/);
    expect(dynamicsTip(result(null, [1, 8]))).toMatch(/ghost notes are nearly as loud/);
    expect(dynamicsTip(result([2, 8], [1, 8]))).toMatch(/too alike/);
  });

  it("praises clear contrast", () => {
    expect(dynamicsTip(result([7, 8], [6, 8]))).toMatch(/Nice control/);
  });
});
