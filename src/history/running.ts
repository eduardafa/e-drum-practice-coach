/**
 * A running mean and sample standard deviation (Welford's method): one pass,
 * no stored values, and numerically stable for thousands of hits.
 */
export class RunningStats {
  n = 0;
  private m = 0;
  private m2 = 0;

  add(x: number): void {
    this.n++;
    const d = x - this.m;
    this.m += d / this.n;
    this.m2 += d * (x - this.m);
  }

  get mean(): number | null {
    return this.n ? this.m : null;
  }

  /** Sample standard deviation; null under two values. */
  get spread(): number | null {
    return this.n >= 2 ? Math.sqrt(this.m2 / (this.n - 1)) : null;
  }
}
