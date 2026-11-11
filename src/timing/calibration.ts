/**
 * Latency calibration maths. The drummer plays along to a click; each hit's
 * raw delta (hit time minus click time, with no latency offset applied) is
 * collected, and the system latency is estimated from those deltas.
 *
 * Pure functions only, so the method can be unit-tested.
 */

export interface CalibrationOptions {
  /** Fewest hits that must remain after outlier rejection. */
  minHits: number;
  /** Tukey fence multiplier: hits beyond Q1/Q3 ∓ k·IQR are dropped. */
  iqrFactor: number;
  /**
   * The estimate counts as confident when the uncertainty of the median is at
   * or below this, in ms. Below it, the result is still usable, just less precise.
   */
  targetUncertaintyMs: number;
  /** Fail when the estimated offset is larger than this, in ms. */
  maxAbsOffsetMs: number;
}

export const DEFAULT_CALIBRATION: CalibrationOptions = {
  minHits: 8,
  iqrFactor: 1.5,
  targetUncertaintyMs: 5,
  maxAbsOffsetMs: 200,
};

export type CalibrationResult =
  | {
      ok: true;
      /** Latency to subtract from every hit, rounded to whole ms. */
      offsetMs: number;
      /** Standard deviation of the hits that were kept, in ms: how steady the drummer was. */
      spreadMs: number;
      /** Standard error of the median, in ms: how precisely the offset is known. */
      uncertaintyMs: number;
      /** Whether uncertaintyMs reached the target. */
      confident: boolean;
      used: number;
      rejected: number;
    }
  | {
      ok: false;
      reason: "tooFewHits" | "outOfRange";
      /** Present when enough hits were collected to measure it. */
      offsetMs?: number;
      spreadMs?: number;
      uncertaintyMs?: number;
      used: number;
      rejected: number;
    };

/** Value at fraction `q` (0–1) of sorted values, interpolating between neighbours. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new Error("quantile of an empty list");
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values.toSorted((a, b) => a - b), 0.5);
}

/** Sample standard deviation (n − 1). Zero for fewer than two values. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const sq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sq / (values.length - 1));
}

/**
 * Standard error of the median for roughly normal data: about 1.2533 · SD / √n.
 * It shrinks as hits accumulate, so a less steady drummer reaches the same
 * precision by playing longer. Infinite with no hits.
 */
export function medianStandardError(spread: number, count: number): number {
  return count > 0 ? (1.2533 * spread) / Math.sqrt(count) : Number.POSITIVE_INFINITY;
}

/** Splits values into those inside the Tukey fences and those outside. */
export function rejectOutliers(
  values: readonly number[],
  iqrFactor: number,
): { kept: number[]; rejected: number[] } {
  if (values.length < 4) return { kept: [...values], rejected: [] };
  const sorted = values.toSorted((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const fence = iqrFactor * (q3 - q1);
  const kept: number[] = [];
  const rejected: number[] = [];
  for (const v of values) (v < q1 - fence || v > q3 + fence ? rejected : kept).push(v);
  return { kept, rejected };
}

/**
 * Estimates the latency offset from raw calibration deltas (ms, positive =
 * the hit registered after the click). The median of the kept hits is used
 * rather than the mean, so a few stray hits can't pull it.
 */
export function computeCalibration(
  deltasMs: readonly number[],
  options: CalibrationOptions = DEFAULT_CALIBRATION,
): CalibrationResult {
  const { kept, rejected } = rejectOutliers(deltasMs, options.iqrFactor);
  const counts = { used: kept.length, rejected: rejected.length };
  if (kept.length < options.minHits) return { ok: false, reason: "tooFewHits", ...counts };

  const offsetMs = Math.round(median(kept));
  const spreadMs = standardDeviation(kept);
  const uncertaintyMs = medianStandardError(spreadMs, kept.length);
  if (Math.abs(offsetMs) > options.maxAbsOffsetMs) {
    return { ok: false, reason: "outOfRange", offsetMs, spreadMs, uncertaintyMs, ...counts };
  }
  const confident = uncertaintyMs <= options.targetUncertaintyMs;
  return { ok: true, offsetMs, spreadMs, uncertaintyMs, confident, ...counts };
}

/**
 * Whether a result is clearly negative: below zero by more than its own
 * uncertainty. System latency (USB, the drum module) can only make hits
 * register late, and audio output latency is already compensated, so a
 * clearly negative offset usually means the drummer plays ahead of the click.
 * Applying it would count those early hits as on time.
 */
export function isClearlyNegative(result: Pick<Extract<CalibrationResult, { ok: true }>, "offsetMs" | "uncertaintyMs">): boolean {
  return result.offsetMs < -result.uncertaintyMs;
}
