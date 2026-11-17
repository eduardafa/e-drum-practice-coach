/** Runs beat finding in its worker. The samples are transferred, not copied; `cancel` stops it. */
import type { BeatGrid } from "./beats";

export interface SongAnalysis {
  grid: BeatGrid;
  /** Seconds between the song's hi-hat notes, or null when it isn't clear (EDU-130). */
  hihatStep: number | null;
}
import type { BeatsReply, BeatsRequest } from "./beatsMessages";

export function analyzeSong(
  samples: Float32Array,
  sampleRate: number,
  onProgress: (done: number) => void,
): { result: Promise<SongAnalysis>; cancel: () => void } {
  const worker = new Worker(new URL("./beats.worker.ts", import.meta.url), { type: "module" });
  let settle: ((value: SongAnalysis | Error) => void) | null = null;
  const result = new Promise<SongAnalysis>((resolve, reject) => {
    settle = (value) => {
      worker.terminate();
      if (value instanceof Error) reject(value);
      else resolve(value);
    };
  });
  worker.addEventListener("message", (e: MessageEvent<BeatsReply>) => {
    const msg = e.data;
    if (msg.kind === "progress") onProgress(msg.done);
    else if (msg.kind === "done") settle?.({ grid: msg.grid, hihatStep: msg.hihatStep });
    else settle?.(new Error(msg.message));
  });
  worker.addEventListener("error", () => settle?.(new Error("The beat finder stopped unexpectedly.")));
  const request: BeatsRequest = { samples, sampleRate };
  worker.postMessage(request, [samples.buffer]);
  return { result, cancel: () => settle?.(new Error("canceled")) };
}
