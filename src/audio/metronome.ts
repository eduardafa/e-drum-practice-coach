/**
 * Lookahead metronome ("A Tale of Two Clocks" pattern).
 *
 * A worker timer wakes the scheduler every TICK_MS. Each wake schedules
 * every click that falls within the next LOOKAHEAD_SEC on the audio clock,
 * so clicks are sample-accurate even if a wake is late. Every scheduled
 * step is also written to the TimingGrid in performance.now() time, which
 * is what hits are scored against.
 */
import { ClockMapper, sampleClocks } from "./clock";
import {
  type MetronomeSettings,
  type ScheduleCursor,
  type ScheduledStep,
  takeStepsUntil,
} from "./schedule";
import type { TimingGrid } from "../timing/grid";

const TICK_MS = 25;
const LOOKAHEAD_SEC = 0.12;
const START_DELAY_SEC = 0.1;
const CLICK_DURATION_SEC = 0.03;

export interface BeatListener {
  (step: ScheduledStep & { performanceTime: number }): void;
}

export class Metronome {
  private ctx: AudioContext | null = null;
  private worker: Worker | null = null;
  private cursor: ScheduleCursor | null = null;
  private readonly clock = new ClockMapper();
  private listeners = new Set<BeatListener>();
  volume = 0.6;

  constructor(
    private settings: MetronomeSettings,
    private readonly grid: TimingGrid,
  ) {}

  get running(): boolean {
    return this.cursor !== null;
  }

  get currentSettings(): MetronomeSettings {
    return this.settings;
  }

  setSettings(settings: MetronomeSettings): void {
    this.settings = settings;
  }

  /** Called for every scheduled step, ahead of time, with its audible time. */
  onStep(listener: BeatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Must be called from a user gesture the first time (autoplay policy). */
  async start(): Promise<void> {
    if (this.running) return;
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    await this.ctx.resume();

    this.grid.clear();
    this.clock.reset();
    this.cursor = {
      nextTime: this.ctx.currentTime + START_DELAY_SEC,
      beatInBar: 0,
      subInBeat: 0,
    };

    if (!this.worker) {
      this.worker = new Worker(new URL("./tick.worker.ts", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", () => this.schedule());
    }
    this.worker.postMessage({ cmd: "start", intervalMs: TICK_MS });
    this.schedule();
  }

  stop(): void {
    this.cursor = null;
    this.worker?.postMessage({ cmd: "stop" });
    this.grid.clear();
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const cursor = this.cursor;
    if (!ctx || !cursor) return;

    this.clock.update(sampleClocks(ctx));

    // If we fell behind (tab suspended), drop the missed steps instead of firing
    // a burst of late clicks. Advancing through them keeps the bar position right.
    if (cursor.nextTime < ctx.currentTime) {
      takeStepsUntil(cursor, this.settings, ctx.currentTime);
    }

    const steps = takeStepsUntil(cursor, this.settings, ctx.currentTime + LOOKAHEAD_SEC);
    for (const step of steps) {
      // A listener may stop the metronome mid-batch (calibration does after its last click).
      if (!this.cursor) break;
      if (step.beat || this.settings.clickSubdivisions) this.click(ctx, step);
      const performanceTime = this.clock.toPerformanceMs(step.time);
      this.grid.add({
        time: performanceTime,
        intervalMs: step.intervalSec * 1000,
        beat: step.beat,
        downbeat: step.downbeat,
      });
      for (const l of this.listeners) l({ ...step, performanceTime });
    }
  }

  private click(ctx: AudioContext, step: ScheduledStep): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = step.downbeat ? 1600 : step.beat ? 1100 : 800;
    const peak = this.volume * (step.beat ? 1 : 0.4);
    // Fast attack and exponential decay give a crisp, clearly placed transient.
    gain.gain.setValueAtTime(0.0001, step.time);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), step.time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, step.time + CLICK_DURATION_SEC);
    osc.connect(gain).connect(ctx.destination);
    osc.start(step.time);
    osc.stop(step.time + CLICK_DURATION_SEC + 0.01);
  }
}
