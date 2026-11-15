import { describe, expect, it } from "vitest";
import { Stretcher, stretchChannels } from "./stretch";

const RATE = 44100;

function sine(freq: number, seconds: number, amp = 0.5): Float32Array {
  const out = new Float32Array(Math.round(RATE * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE);
  return out;
}

/** The frequency, from upward zero crossings over the middle of the signal (away from the edges). */
function frequency(x: Float32Array): number {
  const from = Math.floor(x.length * 0.2), to = Math.floor(x.length * 0.8);
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
  return crossings / ((to - from) / RATE);
}

function rms(x: Float32Array): number {
  const from = Math.floor(x.length * 0.2), to = Math.floor(x.length * 0.8);
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (to - from));
}

function run(input: Float32Array[], speed: number): Float32Array[] {
  const s = new Stretcher(input, speed);
  while (!s.step(1000));
  return s.output;
}

describe("Stretcher", () => {
  it.each([0.7, 0.85])("at %s speed, lasts 1/speed as long and keeps the pitch and level", (speed) => {
    const input = sine(220, 2);
    const [out] = run([input], speed);
    expect(out.length).toBe(Math.ceil(input.length / speed));
    expect(frequency(out)).toBeCloseTo(220, -0.5); // within a few Hz
    expect(Math.abs(rms(out) - rms(input)) / rms(input)).toBeLessThan(0.08);
  });

  it("at full speed gives back (nearly) the same audio", () => {
    const input = sine(330, 1);
    const [out] = run([input], 1);
    let err = 0;
    for (let i = 2000; i < input.length - 2000; i++) err = Math.max(err, Math.abs(out[i] - input[i]));
    expect(err).toBeLessThan(0.01);
  });

  it("moves every channel together, so stereo stays in place", () => {
    const left = sine(220, 1);
    const right = left.map((v) => v * 0.5);
    const [l, r] = run([left, right], 0.7);
    for (let i = 5000; i < l.length - 5000; i += 997) expect(r[i]).toBeCloseTo(l[i] * 0.5, 5);
  });

  it("keeps a click (a drum hit) where it should be in time, stretched", () => {
    const input = new Float32Array(RATE);
    input[RATE / 2] = 1; // a hit at 0.5 s
    const [out] = run([input], 0.7);
    let peak = 0;
    for (let i = 1; i < out.length; i++) if (Math.abs(out[i]) > Math.abs(out[peak])) peak = i;
    // At 70% the hit lands near 0.5 / 0.7 s, within a slice's nudge.
    expect(Math.abs(peak / RATE - 0.5 / 0.7)).toBeLessThan(0.025);
  });
});

describe("stretchChannels", () => {
  it("reports progress up to 1 and can be canceled", async () => {
    const seen: number[] = [];
    await stretchChannels([sine(220, 3)], 0.7, (p) => seen.push(p));
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((p, i) => i === 0 || p >= seen[i - 1])).toBe(true);
    const abort = new AbortController();
    abort.abort();
    await expect(stretchChannels([sine(220, 3)], 0.7, undefined, abort.signal)).rejects.toThrow("canceled");
  });
});
