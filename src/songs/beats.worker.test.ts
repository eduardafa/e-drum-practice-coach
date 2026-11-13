import { afterEach, describe, expect, it, vi } from "vitest";
import type { BeatsReply } from "./beatsMessages";
import { TEST_RATE, testSong } from "./testSongs";

/** Loads the worker against a stand-in `self`, returning how to message it and what it replied. */
async function loadWorker() {
  let listener: ((e: { data: unknown; origin: string }) => void) | null = null;
  const replies: BeatsReply[] = [];
  vi.stubGlobal("self", {
    location: { origin: "https://example.test" },
    addEventListener: (_type: string, l: typeof listener) => (listener = l),
    postMessage: (m: BeatsReply) => replies.push(m),
  });
  vi.resetModules();
  await import("./beats.worker");
  return { send: (data: unknown) => listener?.({ data, origin: "" }), replies };
}

afterEach(() => vi.unstubAllGlobals());

describe("beats worker", () => {
  it("finds the beats for a request from its page, whose messages have an empty origin", async () => {
    const { send, replies } = await loadWorker();
    const { samples } = testSong({ bpm: 120, seconds: 12, kick: [0, 4], snare: [2, 6], hats: 2 });
    send({ samples, sampleRate: TEST_RATE });
    expect(replies.at(-1)).toMatchObject({ kind: "done", grid: { bpm: expect.closeTo(120, 0) } });
    expect(replies.some((r) => r.kind === "progress")).toBe(true);
  });

  it("answers a malformed message with an error", async () => {
    const { send, replies } = await loadWorker();
    send({ samples: "not audio" });
    expect(replies).toEqual([{ kind: "error", message: "Bad request" }]);
  });
});
