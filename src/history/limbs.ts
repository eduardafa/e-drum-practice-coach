/**
 * Timing per hand, foot and pad, from the note results saved in history,
 * and the biggest tendency in words a beginner understands.
 *
 * Which limb plays a note comes from the exercise: the sticking for
 * rudiments, and for grooves the usual right-handed setup (hi-hat, ride
 * and crash with the right hand, snare with the left, kick with the right
 * foot, hi-hat pedal with the left). Toms in a groove have no fixed hand,
 * so they count for their pad but not for a hand.
 */
import type { PadId } from "../kit/nitroMax";
import type { HistoryRecord, SessionRecord } from "./record";
import { practiceDate } from "./streak";

export type Limb = "RH" | "LH" | "RF" | "LF";

export const LIMBS: readonly { id: Limb; label: string; short: string }[] = [
  { id: "RH", label: "Right hand", short: "right hand" },
  { id: "LH", label: "Left hand", short: "left hand" },
  { id: "RF", label: "Right foot", short: "right foot (kick)" },
  { id: "LF", label: "Left foot", short: "left foot (hi-hat pedal)" },
];

const GROOVE_LIMB: Partial<Record<PadId, Limb>> = {
  hihat: "RH",
  ride: "RH",
  crash: "RH",
  snare: "LH",
  kick: "RF",
  hihatPedal: "LF",
};

/** The limb that plays a note: its sticking if written, else the right-handed groove setup. */
export function limbOf(voice: { pad: PadId; hand: "R" | "L" | null }): Limb | null {
  if (voice.pad === "kick") return "RF";
  if (voice.pad === "hihatPedal") return "LF";
  if (voice.hand === "R") return "RH";
  if (voice.hand === "L") return "LH";
  return GROOVE_LIMB[voice.pad] ?? null;
}

export interface TimingStat {
  /** Notes played (matched to a hit). */
  hits: number;
  missed: number;
  /** Average timing: negative is early, positive late. */
  meanMs: number | null;
  /** Standard deviation of the timing: how much it varies from hit to hit. */
  spreadMs: number | null;
}

export interface TimingStats {
  limbs: Map<Limb, TimingStat>;
  pads: Map<PadId, TimingStat>;
  sessions: number;
}

/** Running sums for a mean and sample standard deviation (Welford). */
class Acc {
  n = 0;
  missed = 0;
  private mean = 0;
  private m2 = 0;
  add(x: number) {
    this.n++;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.m2 += d * (x - this.mean);
  }
  stat(): TimingStat {
    return {
      hits: this.n,
      missed: this.missed,
      meanMs: this.n ? this.mean : null,
      spreadMs: this.n >= 2 ? Math.sqrt(this.m2 / (this.n - 1)) : null,
    };
  }
}

const isSession = (r: HistoryRecord): r is SessionRecord => r.kind === "session";

/** Timing per limb and per pad over the sessions played on or after `from` (null: all). */
export function timingStats(records: readonly HistoryRecord[], from: Temporal.PlainDate | null): TimingStats {
  const limbs = new Map<Limb, Acc>();
  const pads = new Map<PadId, Acc>();
  const get = <K>(map: Map<K, Acc>, key: K) => {
    let acc = map.get(key);
    if (!acc) map.set(key, (acc = new Acc()));
    return acc;
  };

  let sessions = 0;
  for (const r of records) {
    if (!isSession(r)) continue;
    if (from !== null && Temporal.PlainDate.compare(practiceDate(r), from) < 0) continue;
    sessions++;
    for (const [index, , deltaMs] of r.notes) {
      const voice = r.voices[index];
      if (!voice) continue;
      const limb = limbOf(voice);
      const accs = [get(pads, voice.pad), ...(limb ? [get(limbs, limb)] : [])];
      for (const acc of accs) {
        if (deltaMs === null) acc.missed++;
        else acc.add(deltaMs);
      }
    }
  }
  const stats = <K>(map: Map<K, Acc>) => new Map([...map].map(([k, acc]) => [k, acc.stat()] as const));
  return { limbs: stats(limbs), pads: stats(pads), sessions };
}

// ---- The biggest tendency, in words ------------------------------------------

/** Fewer hits than this say more about luck than about the drummer. */
export const MIN_HITS = 16;
/** An average this far off the click is a habit worth working on. */
export const LEAN_MS = 8;
/** Hits varying this much (standard deviation) feel uneven. */
export const UNEVEN_MS = 25;

export type Tendency =
  | { kind: "not-enough" }
  | { kind: "overall"; direction: "early" | "late"; ms: number }
  | { kind: "limb"; limb: Limb; direction: "early" | "late"; ms: number }
  | { kind: "uneven"; limb: Limb; ms: number }
  | { kind: "balanced" };

/**
 * The one thing most worth working on. Everything leaning the same way is
 * reported as a whole, not pinned on one limb; otherwise the limb furthest
 * off the click, then the least consistent one.
 */
export function tendency(limbs: ReadonlyMap<Limb, TimingStat>): Tendency {
  const enough = LIMBS.flatMap(({ id }) => {
    const s = limbs.get(id);
    return s && s.hits >= MIN_HITS && s.meanMs !== null ? [{ limb: id, mean: s.meanMs, spread: s.spreadMs ?? 0, hits: s.hits }] : [];
  });
  if (enough.length === 0) return { kind: "not-enough" };

  const total = enough.reduce((n, s) => n + s.hits, 0);
  const overall = enough.reduce((sum, s) => sum + s.mean * s.hits, 0) / total;
  const sameWay = enough.every((s) => Math.sign(s.mean) === Math.sign(overall) && Math.abs(s.mean) >= LEAN_MS);
  if (enough.length > 1 && sameWay) {
    return { kind: "overall", direction: overall < 0 ? "early" : "late", ms: Math.round(Math.abs(overall)) };
  }

  const furthest = enough.reduce((a, b) => (Math.abs(b.mean) > Math.abs(a.mean) ? b : a));
  if (Math.abs(furthest.mean) >= LEAN_MS) {
    return { kind: "limb", limb: furthest.limb, direction: furthest.mean < 0 ? "early" : "late", ms: Math.round(Math.abs(furthest.mean)) };
  }

  const loosest = enough.reduce((a, b) => (b.spread > a.spread ? b : a));
  if (loosest.spread >= UNEVEN_MS) return { kind: "uneven", limb: loosest.limb, ms: Math.round(loosest.spread) };
  return { kind: "balanced" };
}

const limbName = (limb: Limb) => LIMBS.find((l) => l.id === limb)?.short ?? limb;
const isFoot = (limb: Limb) => limb === "RF" || limb === "LF";

/** The tendency as a headline and a practice tip. */
export function describeTendency(t: Tendency): { headline: string; tip: string } {
  switch (t.kind) {
    case "not-enough":
      return {
        headline: "Not enough hits yet to spot a pattern.",
        tip: `Each hand and foot needs about ${MIN_HITS} hits in this range. A couple of play-along sessions is enough.`,
      };
    case "overall":
      return t.direction === "late"
        ? {
            headline: `You play a little behind the click: about ${t.ms} ms late with everything.`,
            tip: "Try to land with the click, not after it: count out loud with the metronome first. If it already feels on time, run Calibrate latency in Settings, since your setup may add a delay.",
          }
        : {
            headline: `You play a little ahead of the click: about ${t.ms} ms early with everything.`,
            tip: "Rushing is common when concentrating. Slow down 10 BPM, relax, and let each stroke fall on the click.",
          };
    case "limb": {
      const who = limbName(t.limb);
      if (isFoot(t.limb)) {
        return t.direction === "late"
          ? {
              headline: `Your ${who} is ${t.ms} ms late on average.`,
              tip: "Play quarter notes with just that foot along with the metronome at a slow tempo, then add the hands back.",
            }
          : {
              headline: `Your ${who} is ${t.ms} ms early on average.`,
              tip: "Feet often jump ahead. Play quarter notes with just that foot and wait for the click before each one.",
            };
      }
      return t.direction === "late"
        ? {
            headline: `Your ${who} drags: it's ${t.ms} ms late on average.`,
            tip: "Try slow single strokes (RLRL) with the metronome, listening for both hands to sound evenly.",
          }
        : {
            headline: `Your ${who} rushes: it's ${t.ms} ms early on average.`,
            tip: "Try slow single strokes (RLRL) with the metronome, and let that hand wait for its turn.",
          };
    }
    case "uneven":
      return {
        headline: `Your ${limbName(t.limb)} is the least steady: its hits vary by about ±${t.ms} ms.`,
        tip: "Steadiness comes before speed. Drop the tempo until every hit feels the same, then build back up.",
      };
    case "balanced":
      return {
        headline: "No strong tendency: your hands and feet are close to the click and to each other.",
        tip: "Nice work. Try a slightly faster tempo or a new exercise to keep improving.",
      };
  }
}

/** "12 ms late", "4 ms early", "on the click" (under 1 ms). */
export function formatLean(ms: number): string {
  const r = Math.round(ms);
  if (r === 0) return "on the click";
  return `${Math.abs(r)} ms ${r < 0 ? "early" : "late"}`;
}
