/**
 * Wires MIDI input, the metronome, the timing grid and the live state
 * together. One instance lives for the lifetime of the page.
 */
import { Metronome } from "../audio/metronome";
import type { MetronomeSettings } from "../audio/schedule";
import { lookupNote } from "../kit/nitroMax";
import { MidiConnection, type TimedMidiEvent } from "../midi/connection";
import { DEFAULT_SCORING, scoreHit, TimingGrid, type ScoringOptions } from "../timing/grid";
import type { SkillLevel } from "../profiles";
import { calibrationSetup, CalibrationSession, type CalibrationProgress } from "./calibration";
import { LiveState } from "./liveState";

export const DEFAULT_METRONOME: MetronomeSettings = {
  bpm: 90,
  beatsPerBar: 4,
  subdivision: 1,
  clickSubdivisions: false,
};

export class Coach {
  readonly midi = new MidiConnection();
  readonly grid = new TimingGrid();
  readonly live = new LiveState();
  readonly metronome: Metronome;
  scoring: ScoringOptions = { ...DEFAULT_SCORING };
  private calibration: CalibrationSession | null = null;
  /** The drummer's metronome settings, restored when calibration ends. */
  private settingsBeforeCalibration: MetronomeSettings | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor(settings: MetronomeSettings = DEFAULT_METRONOME) {
    this.metronome = new Metronome(settings, this.grid);
    this.unsubscribers.push(
      this.midi.onEvent((e) => this.handleMidi(e)),
      this.metronome.onStep((step) => {
        if (!step.beat) return;
        this.live.addBeat({ time: step.performanceTime, downbeat: step.downbeat });
        // No more clicks needed: the target was reached or the limit is scheduled.
        if (this.calibration?.addClick(step.performanceTime, step.intervalSec * 1000)) this.stopCalibrationClicks();
      }),
    );
  }

  get calibrating(): boolean {
    return this.calibration !== null;
  }

  async startMetronome(): Promise<void> {
    if (this.calibrating) return;
    this.live.resetSession();
    await this.metronome.start();
  }

  stopMetronome(): void {
    this.metronome.stop();
  }

  /** Starts a calibration run for a skill level. Call from a user gesture. */
  async startCalibration(level: SkillLevel): Promise<void> {
    this.metronome.stop();
    this.restoreSettings();
    const setup = calibrationSetup(level);
    this.settingsBeforeCalibration = this.metronome.currentSettings;
    this.metronome.setSettings(setup.metronome);
    this.calibration = new CalibrationSession(setup.plan, setup.options);
    this.live.resetSession();
    await this.metronome.start();
  }

  /** Current state of the run, or null when not calibrating. */
  calibrationProgress(now: number): CalibrationProgress | null {
    return this.calibration?.progress(now) ?? null;
  }

  /** Ends or abandons the run. The caller decides whether to apply the result. */
  endCalibration(): void {
    if (!this.calibration) return;
    this.calibration = null;
    this.metronome.stop();
    this.restoreSettings();
    this.live.resetSession();
  }

  /** Feeds a hit into the pipeline as if it came from the kit (keyboard fallback). */
  simulateHit(note: number, velocity: number, time: number): void {
    this.handleMidi({ event: { kind: "noteOn", channel: 9, note, velocity }, time });
  }

  dispose(): void {
    for (const u of this.unsubscribers) u();
    this.midi.dispose();
    this.metronome.dispose();
  }

  /** Stops the clicks once the run needs no more, and restores the drummer's settings. */
  private stopCalibrationClicks(): void {
    if (this.metronome.running) this.metronome.stop();
    this.restoreSettings();
  }

  private restoreSettings(): void {
    if (!this.settingsBeforeCalibration) return;
    this.metronome.setSettings(this.settingsBeforeCalibration);
    this.settingsBeforeCalibration = null;
  }

  private handleMidi({ event, time }: TimedMidiEvent): void {
    if (event.kind !== "noteOn") return;
    const mapping = lookupNote(event.note);
    if (this.calibration) {
      this.calibration.addHit(time);
      if (this.calibration.finished) this.stopCalibrationClicks();
    }
    // While calibrating, show raw timing: the offset being measured isn't applied.
    const scoring = this.calibration ? { ...this.scoring, latencyOffsetMs: 0 } : this.scoring;
    this.live.addHit({
      pad: mapping?.pad ?? null,
      zone: mapping?.zone ?? null,
      note: event.note,
      velocity: event.velocity,
      time,
      score: this.metronome.running ? scoreHit(this.grid, time, scoring) : null,
    });
  }
}
