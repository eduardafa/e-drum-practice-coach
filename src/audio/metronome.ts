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
import type { TickCommand } from "./tickCommand";
import { playClick } from "./voices";
import { DEFAULT_VOLUME } from "./volume";

const TICK_MS = 25;
const LOOKAHEAD_SEC = 0.12;
const START_DELAY_SEC = 0.1;

export interface BeatListener {
  (step: ScheduledStep & { performanceTime: number }): void;
}

export class Metronome {
  private ctx: AudioContext | null = null;
  private worker: Worker | null = null;
  private cursor: ScheduleCursor | null = null;
  private readonly clock = new ClockMapper();
  private listeners = new Set<BeatListener>();
  /** Clicks go through this: volume gain, then a limiter, then the speakers. */
  private bus: GainNode | null = null;
  private volumeValue = DEFAULT_VOLUME;

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

  /** Click volume as a gain, 0 to MAX_VOLUME (see ./volume). Applies to clicks already scheduled too. */
  get volume(): number {
    return this.volumeValue;
  }

  set volume(volume: number) {
    this.volumeValue = volume;
    if (this.bus) this.bus.gain.value = volume;
  }

  setSettings(settings: MetronomeSettings): void {
    this.settings = settings;
  }

  /** Called for every scheduled step, ahead of time, with its audible time. */
  onStep(listener: BeatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The page's audio context, created on first use and resumed. Shared with
   * exercise previews. Must be called from a user gesture the first time
   * (autoplay policy).
   */
  async audioContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.bus = clickBus(this.ctx, this.volumeValue);
    }
    await this.ctx.resume();
    return this.ctx;
  }

  /** Must be called from a user gesture the first time (autoplay policy). */
  async start(): Promise<void> {
    if (this.running) return;
    const ctx = await this.audioContext();

    this.grid.clear();
    this.clock.reset();
    this.cursor = {
      nextTime: ctx.currentTime + START_DELAY_SEC,
      beatInBar: 0,
      subInBeat: 0,
    };

    if (!this.worker) {
      this.worker = new Worker(new URL("./tick.worker.ts", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", () => this.schedule());
    }
    this.worker.postMessage({ cmd: "start", intervalMs: TICK_MS } satisfies TickCommand);
    this.schedule();
  }

  stop(): void {
    this.cursor = null;
    this.worker?.postMessage({ cmd: "stop" } satisfies TickCommand);
    this.grid.clear();
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    void this.ctx?.close();
    this.ctx = null;
    this.bus = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const cursor = this.cursor;
    if (!ctx || !bus || !cursor) return;

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
      if (step.beat || this.settings.clickSubdivisions) {
        playClick(ctx, bus, step.time, step.downbeat ? "downbeat" : step.beat ? "beat" : "sub", 1);
      }
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
}

/**
 * Volume gain into a fast limiter. Above 100% the gain pushes the click past
 * full scale; the limiter (instant attack, hard knee, high ratio) holds the
 * peaks just under it, so a boost is louder, not clipped.
 */
function clickBus(ctx: AudioContext, volume: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0;
  limiter.release.value = 0.1;
  gain.connect(limiter).connect(ctx.destination);
  return gain;
}
