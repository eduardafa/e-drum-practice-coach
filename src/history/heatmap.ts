/**
 * Which pads were hit and how hard, from saved sessions: the data behind the
 * pad heatmap. Velocity is the MIDI value the kit sends, 1 (softest) to 127.
 *
 * Every hit counts: notes played (on time or not) and extra hits that
 * matched no note. Strength by dynamic (ghost, normal, accent) only uses
 * played notes, since an extra hit has no intended dynamic.
 */
import type { Dynamic } from "../exercises/types";
import type { PadId } from "../kit/nitroMax";
import type { HistoryRecord, SessionRecord } from "./record";
import { RunningStats } from "./running";
import { practiceDate } from "./streak";

export interface VelocityStat {
  /** Hits with a known velocity. */
  n: number;
  mean: number | null;
  /** Standard deviation: how much the strength varies from hit to hit. */
  spread: number | null;
}

export interface PadHeat {
  pad: PadId;
  /** Every hit on the pad: played notes plus extras. */
  hits: number;
  extras: number;
  velocity: VelocityStat;
}

export interface Heatmap {
  pads: Map<PadId, PadHeat>;
  /** Strength of played notes by the dynamic the exercise asked for, all pads together. */
  dynamics: Map<Dynamic, VelocityStat>;
  sessions: number;
}

const velocityStat = (acc: RunningStats): VelocityStat => ({ n: acc.n, mean: acc.mean, spread: acc.spread });

const isSession = (r: HistoryRecord): r is SessionRecord => r.kind === "session";

/** Pad hits and strength over sessions played on or after `from` (null: every session given). */
export function heatmap(records: readonly HistoryRecord[], from: Temporal.PlainDate | null = null): Heatmap {
  const pads = new Map<PadId, { hits: number; extras: number; velocity: RunningStats }>();
  const dynamics = new Map<Dynamic, RunningStats>();
  const pad = (id: PadId) => {
    let p = pads.get(id);
    if (!p) pads.set(id, (p = { hits: 0, extras: 0, velocity: new RunningStats() }));
    return p;
  };

  let sessions = 0;
  for (const r of records) {
    if (!isSession(r)) continue;
    if (from !== null && Temporal.PlainDate.compare(practiceDate(r), from) < 0) continue;
    sessions++;
    for (const [index, , deltaMs, velocity] of r.notes) {
      const voice = r.voices[index];
      if (!voice || deltaMs === null) continue; // a missed note wasn't hit
      const p = pad(voice.pad);
      p.hits++;
      if (velocity !== null) {
        p.velocity.add(velocity);
        let d = dynamics.get(voice.dynamic);
        if (!d) dynamics.set(voice.dynamic, (d = new RunningStats()));
        d.add(velocity);
      }
    }
    for (const [id, velocity] of r.extras) {
      if (id === null) continue; // a note the kit map doesn't know
      const p = pad(id);
      p.hits++;
      p.extras++;
      if (velocity !== null) p.velocity.add(velocity);
    }
  }

  return {
    pads: new Map([...pads].map(([id, p]) => [id, { pad: id, hits: p.hits, extras: p.extras, velocity: velocityStat(p.velocity) }])),
    dynamics: new Map([...dynamics].map(([d, acc]) => [d, velocityStat(acc)])),
    sessions,
  };
}

// ---- Color bins -------------------------------------------------------------

/**
 * Color steps, least to most. The colors are theme tokens (--heat-0 to
 * --heat-4 in App.css, each with its own ink color), checked against the
 * light and the dark panel.
 */
export const HEAT_STEPS = 5;

export type HeatMeasure = "hits" | "strength";

export interface Bin {
  /** Color step, 0 (least) to HEAT_STEPS - 1. */
  step: number;
  /** Inclusive range of values in this bin, e.g. 1–25 hits. */
  min: number;
  max: number;
}

/**
 * The legend's bins. Hits split 1..max into five equal ranges (fewer when
 * there are fewer than five distinct counts); strength uses the fixed MIDI
 * range, so colors mean the same thing whatever was played.
 */
export function bins(measure: HeatMeasure, maxHits: number): Bin[] {
  const top = measure === "strength" ? 127 : Math.max(1, maxHits);
  const count = Math.min(HEAT_STEPS, top);
  const result: Bin[] = [];
  for (let i = 0; i < count; i++) {
    const min = Math.floor((top * i) / count) + 1;
    const max = Math.floor((top * (i + 1)) / count);
    // Spread the used steps across the whole ramp so a few bins still contrast.
    const step = count === 1 ? HEAT_STEPS - 1 : Math.round((i * (HEAT_STEPS - 1)) / (count - 1));
    result.push({ step, min, max });
  }
  return result;
}

/** The bin a value falls in, or null for no value (no hits, or no velocity known). */
export function binOf(value: number | null, binList: readonly Bin[]): Bin | null {
  if (value === null || value <= 0) return null;
  const rounded = Math.round(value);
  return binList.find((b) => rounded >= b.min && rounded <= b.max) ?? binList.at(-1) ?? null;
}

// ---- Dynamics in words -------------------------------------------------------

/** Accents and ghost notes closer than this (in velocity) don't sound different enough. */
export const DYNAMIC_GAP = 25;

/**
 * A plain reading of how well the dynamics contrast, or null if the
 * exercises played didn't ask for different dynamics.
 */
export function dynamicsNote(dynamics: ReadonlyMap<Dynamic, VelocityStat>): string | null {
  const mean = (d: Dynamic) => dynamics.get(d)?.mean ?? null;
  const accent = mean("accent");
  const normal = mean("normal");
  const ghost = mean("ghost");
  if (accent !== null && ghost !== null) {
    return accent - ghost >= DYNAMIC_GAP * 2
      ? "Your accents and ghost notes are clearly different. Nice control."
      : "Your ghost notes and accents sound too alike: play ghosts barely touching the pad, and lift higher for accents.";
  }
  if (accent !== null && normal !== null) {
    return accent - normal >= DYNAMIC_GAP
      ? "Your accents stand out from the other notes."
      : "Your accents don't stand out yet: lift the stick higher for accented notes and keep the others low.";
  }
  if (ghost !== null && normal !== null) {
    return normal - ghost >= DYNAMIC_GAP
      ? "Your ghost notes are nicely quieter than the other notes."
      : "Your ghost notes are nearly as loud as the other notes: play them from just above the pad.";
  }
  return null;
}
