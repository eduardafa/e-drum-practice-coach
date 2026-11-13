/**
 * The hi-hat pedal's position, from MIDI CC 4 (the foot controller): 0 to
 * 127 for how far the pedal is down. Kits disagree on which end means
 * "pressed", so the direction is learned from the hits themselves: the
 * module sends its own open and closed hi-hat notes, and the pedal sits
 * nearer the "pressed" end for the closed ones. Until there's enough of
 * both, high values mean pressed, the common convention.
 */

/** Hits of each kind needed before trusting the learned direction. */
const MIN_SAMPLES = 3;
/** At least this far down counts as closed, at most `OPEN_BELOW` as open. */
const CLOSED_FROM = 0.85;
const OPEN_BELOW = 0.15;

export type PedalState = "closed" | "half" | "open";

class Mean {
  n = 0;
  sum = 0;
  add(v: number): void {
    this.n++;
    this.sum += v;
  }
  get value(): number {
    return this.sum / this.n;
  }
}

export class HihatPedal {
  /** The latest raw CC 4 value, or null until the kit has sent one. */
  private raw: number | null = null;
  private readonly atClosed = new Mean();
  private readonly atOpen = new Mean();

  /** A CC 4 message arrived. */
  observe(value: number): void {
    this.raw = Math.min(127, Math.max(0, value));
  }

  /** A hi-hat hit arrived, open or closed by the module's note: evidence for the direction. */
  learn(open: boolean): void {
    if (this.raw === null) return;
    (open ? this.atOpen : this.atClosed).add(this.raw);
  }

  /** True once hits show low values mean pressed on this kit. */
  get inverted(): boolean {
    return this.atClosed.n >= MIN_SAMPLES && this.atOpen.n >= MIN_SAMPLES && this.atClosed.value < this.atOpen.value;
  }

  /** How far the pedal is pressed, 0 (up, open) to 1 (down, closed), or null if the kit sends no position. */
  pressed(): number | null {
    if (this.raw === null) return null;
    const v = this.raw / 127;
    return this.inverted ? 1 - v : v;
  }

  state(): PedalState | null {
    const p = this.pressed();
    if (p === null) return null;
    return p >= CLOSED_FROM ? "closed" : p <= OPEN_BELOW ? "open" : "half";
  }
}
