/**
 * Messages to and from the beat-finding worker. The worker validates what it
 * receives, because a TypeScript type is only a compile-time label: at
 * runtime a message could have any shape.
 */
import type { BeatGrid } from "./beats";

export interface BeatsRequest {
  samples: Float32Array;
  sampleRate: number;
}

export type BeatsReply = { kind: "progress"; done: number } | { kind: "done"; grid: BeatGrid } | { kind: "error"; message: string };

/** The request, or null for anything that isn't a well-formed one. */
export function parseBeatsRequest(data: unknown): BeatsRequest | null {
  if (typeof data !== "object" || data === null) return null;
  const samples = "samples" in data ? data.samples : undefined;
  const sampleRate = "sampleRate" in data ? data.sampleRate : undefined;
  if (!(samples instanceof Float32Array)) return null;
  if (typeof sampleRate !== "number" || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) return null;
  return { samples, sampleRate };
}
