/**
 * Messages the metronome sends to its tick worker. The worker validates every
 * message with parseTickCommand, because a TypeScript type is only a
 * compile-time annotation: at runtime a message could have any shape.
 */

export type TickCommand = { cmd: "start"; intervalMs: number } | { cmd: "stop" };

/** Bounds for the tick interval. The metronome uses 25 ms. */
export const MIN_TICK_MS = 1;
export const MAX_TICK_MS = 1000;

/** Returns the command, or null for anything that isn't a well-formed command. */
export function parseTickCommand(data: unknown): TickCommand | null {
  if (typeof data !== "object" || data === null) return null;
  const cmd = "cmd" in data ? data.cmd : undefined;
  const intervalMs = "intervalMs" in data ? data.intervalMs : undefined;
  if (cmd === "stop") return { cmd };
  if (
    cmd === "start" &&
    typeof intervalMs === "number" &&
    Number.isFinite(intervalMs) &&
    intervalMs >= MIN_TICK_MS &&
    intervalMs <= MAX_TICK_MS
  ) {
    return { cmd, intervalMs };
  }
  return null;
}
