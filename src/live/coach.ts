/**
 * Wires MIDI input, the metronome, the timing grid and the live state
 * together. One instance lives for the lifetime of the page.
 */
import { Metronome } from "../audio/metronome";
import { PreviewPlayer } from "../audio/previewPlayer";
import { subdivisionFor } from "../exercises/practice";
import type { Exercise } from "../exercises/types";
import { cueLeadMs, cuesAt, type PadCue } from "../playalong/cues";
import { secondsLeft } from "../playalong/getReady";
import { LearnSession } from "../playalong/learn";
import { PlayAlongSession } from "../playalong/session";
import type { MetronomeSettings } from "../audio/schedule";
import { lookupNote } from "../kit/nitroMax";
import { MidiConnection, type TimedMidiEvent } from "../midi/connection";
import { DEFAULT_SCORING, scoreHit, TimingGrid, type ScoringOptions } from "../timing/grid";
import type { SkillLevel } from "../profiles";
import { calibrationSetup, CalibrationSession, type CalibrationProgress } from "./calibration";
import { countAt } from "./counts";
import { LiveState } from "./liveState";

/** The MIDI controller number of the hi-hat pedal position (foot controller). */
const HIHAT_PEDAL_CC = 4;

export const DEFAULT_METRONOME: MetronomeSettings = {
  bpm: 90,
  beatsPerBar: 4,
  subdivision: 1,
  clickSubdivisions: false,
};

/** When a session started: the wall-clock moment for history, and performance.now() to measure its length. */
export interface SessionTiming {
  start: Temporal.Instant;
  timeZone: string;
  durationMs: number;
}

export type SessionEndListener = (session: PlayAlongSession, timing: SessionTiming) => void;

export class Coach {
  readonly midi = new MidiConnection();
  readonly grid = new TimingGrid();
  readonly live = new LiveState();
  readonly metronome: Metronome;
  /** Plays exercises in the library browser; stopped whenever the metronome starts. */
  readonly preview = new PreviewPlayer();
  scoring: ScoringOptions = { ...DEFAULT_SCORING };
  private calibration: CalibrationSession | null = null;
  /** The drummer's metronome settings, restored when calibration ends. */
  private settingsBeforeCalibration: MetronomeSettings | null = null;
  private unsubscribers: Array<() => void> = [];
  /** Bars started since the metronome started; -1 before the first downbeat. */
  private bar = -1;
  private playAlong: PlayAlongSession | null = null;
  /** Wait mode: no clock, each step waits for its pads. Never runs together with the metronome. */
  private learning: LearnSession | null = null;
  /** When the session's get-ready countdown ends (performance.now() ms); 0 when there's none. */
  private countdownEndMs = 0;
  /** How far ahead the kit view lights the next pad: one beat at the session's tempo. */
  private cueLeadMs = 600;
  private sessionStart: { at: Temporal.Instant; timeZone: string; perf: number } | null = null;
  private sessionEndListeners = new Set<SessionEndListener>();

  constructor(settings: MetronomeSettings = DEFAULT_METRONOME) {
    this.metronome = new Metronome(settings, this.grid);
    this.unsubscribers.push(
      this.midi.onEvent((e) => this.handleMidi(e)),
      this.metronome.onStep((step) => {
        const { beatsPerBar, subdivision } = this.metronome.currentSettings;
        if (step.beatInBar === 0 && step.subInBeat === 0) this.bar += 1;
        const count = countAt(step, beatsPerBar, subdivision);
        this.live.addCount({ time: step.performanceTime, ...count, bar: Math.max(0, this.bar) });
        // Bar 0 is the count-in; the exercise starts on the next downbeat, one bar later.
        if (this.bar === 0 && step.beatInBar === 0 && step.subInBeat === 0 && this.playAlong) {
          const beatMs = step.intervalSec * subdivision * 1000;
          this.cueLeadMs = cueLeadMs(beatMs);
          this.playAlong.preview(step.performanceTime + beatMs * beatsPerBar);
        }
        if (this.bar === 1 && step.beatInBar === 0 && step.subInBeat === 0) this.playAlong?.begin(step.performanceTime);
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
    this.endLearn();
    this.preview.stop();
    this.live.resetSession();
    this.bar = -1;
    await this.metronome.start();
  }

  stopMetronome(): void {
    this.metronome.stop();
  }

  /** The play-along session, running or finished, or null. */
  get session(): PlayAlongSession | null {
    return this.playAlong;
  }

  /**
   * Starts a play-along session at `bpm`: an optional get-ready countdown of
   * `countdownSec` seconds, a bar of count-in, then `loops` repetitions. Sets
   * the metronome's beats and subdivision to fit the exercise, and returns the
   * settings used so the UI can show them. Call from a user gesture.
   */
  async startSession(exercise: Exercise, loops: number, bpm: number, countdownSec = 0): Promise<MetronomeSettings> {
    this.endLearn();
    this.preview.stop();
    this.metronome.stop();
    const settings = {
      ...this.metronome.currentSettings,
      bpm,
      beatsPerBar: exercise.timeSignature.beats,
      subdivision: subdivisionFor(exercise),
    };
    this.metronome.setSettings(settings);
    this.playAlong = new PlayAlongSession(exercise, loops, settings.bpm, this.scoring);
    // Read the wall clock once per session, for history only; timing never uses it.
    this.sessionStart = { at: Temporal.Now.instant(), timeZone: Temporal.Now.timeZoneId(), perf: performance.now() };
    this.live.resetSession();
    this.bar = -1;
    // Cleared first: the metronome is already running for a moment before start() resolves.
    this.countdownEndMs = 0;
    this.countdownEndMs = await this.metronome.start(countdownSec);
    return settings;
  }

  /** Starts wait mode on an exercise: no metronome, each step waits until its pads are hit. */
  startLearn(exercise: Exercise, loops: number): void {
    if (this.calibrating) return;
    this.preview.stop();
    this.endSession();
    this.metronome.stop();
    this.live.resetSession();
    this.learning = new LearnSession(exercise, loops);
  }

  /** The wait-mode run, active or finished, or null. */
  get learn(): LearnSession | null {
    return this.learning;
  }

  endLearn(): void {
    this.learning = null;
  }

  /** Which pads the kit view should light at `now`: wait mode's step, or the session's next notes from the count-in on. */
  cuesAt(now: number): PadCue[] {
    if (this.learning) return this.learning.cues();
    const session = this.playAlong;
    if (!session || !this.metronome.running) return [];
    return cuesAt(session.upcomingNotes(), now - this.scoring.latencyOffsetMs, this.cueLeadMs);
  }

  /** The get-ready countdown's number to show at `now` (5, 4, … 1), or null when there's no countdown running. */
  countdownAt(now: number): number | null {
    if (this.playAlong?.phase !== "countIn" || !this.metronome.running) return null;
    return secondsLeft(this.countdownEndMs, now);
  }

  /** Called once when a session finishes by itself (not when it's stopped or abandoned). */
  onSessionEnd(listener: SessionEndListener): () => void {
    this.sessionEndListeners.add(listener);
    return () => this.sessionEndListeners.delete(listener);
  }

  /** Resolves missed notes up to `now`, and stops the clicks once the session is over. Call often. */
  tickSession(now: number): void {
    const session = this.playAlong;
    if (!session) return;
    const wasDone = session.phase === "done";
    session.tick(now);
    if (!wasDone && session.phase === "done" && this.sessionStart) {
      const { at, timeZone, perf } = this.sessionStart;
      for (const l of this.sessionEndListeners) l(session, { start: at, timeZone, durationMs: now - perf });
    }
    if (session.phase === "done" && this.metronome.running) this.metronome.stop();
  }

  /** Abandons or closes the session. */
  endSession(): void {
    if (!this.playAlong) return;
    if (this.playAlong.phase !== "done") this.metronome.stop();
    this.playAlong = null;
  }

  /**
   * Plays one loop of an exercise at `bpm`, stopping the metronome and any
   * session first so the two don't play over each other. Call from a user gesture.
   */
  async startPreview(exercise: Exercise, bpm: number, onEnd: () => void): Promise<void> {
    if (this.calibrating) return;
    this.endLearn();
    this.endSession();
    this.metronome.stop();
    const ctx = await this.metronome.audioContext();
    // The pad voices have no limiter, so a boosted click volume isn't applied to them.
    this.preview.play(ctx, exercise, bpm, Math.min(1, this.metronome.volume), onEnd);
  }

  /** Starts a calibration run for a skill level. Call from a user gesture. */
  async startCalibration(level: SkillLevel): Promise<void> {
    this.endLearn();
    this.preview.stop();
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
    this.preview.stop();
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
    // CC 4 is the hi-hat pedal (foot controller): how far it's pressed.
    if (event.kind === "controlChange" && event.controller === HIHAT_PEDAL_CC) {
      this.live.hihatPedal.observe(event.value);
      return;
    }
    if (event.kind !== "noteOn") return;
    const mapping = lookupNote(event.note);
    // The module's own open/closed choice tells which end of the pedal's range means "pressed".
    if (mapping?.pad === "hihat") this.live.hihatPedal.learn(mapping.zone.includes("open"));
    const played = { pad: mapping?.pad ?? null, zone: mapping?.zone ?? null, time, velocity: event.velocity };
    this.playAlong?.hit(played);
    this.learning?.hit(played);
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
