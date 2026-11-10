/**
 * Wires MIDI input, the metronome, the timing grid and the live state
 * together. One instance lives for the lifetime of the page.
 */
import { Metronome } from "../audio/metronome";
import type { MetronomeSettings } from "../audio/schedule";
import { lookupNote } from "../kit/nitroMax";
import { MidiConnection, type TimedMidiEvent } from "../midi/connection";
import { DEFAULT_SCORING, scoreHit, TimingGrid, type ScoringOptions } from "../timing/grid";
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
  private unsubscribers: Array<() => void> = [];

  constructor(settings: MetronomeSettings = DEFAULT_METRONOME) {
    this.metronome = new Metronome(settings, this.grid);
    this.unsubscribers.push(
      this.midi.onEvent((e) => this.handleMidi(e)),
      this.metronome.onStep((step) => {
        if (step.beat) this.live.addBeat({ time: step.performanceTime, downbeat: step.downbeat });
      }),
    );
  }

  async startMetronome(): Promise<void> {
    this.live.resetSession();
    await this.metronome.start();
  }

  stopMetronome(): void {
    this.metronome.stop();
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

  private handleMidi({ event, time }: TimedMidiEvent): void {
    if (event.kind !== "noteOn") return;
    const mapping = lookupNote(event.note);
    this.live.addHit({
      pad: mapping?.pad ?? null,
      zone: mapping?.zone ?? null,
      note: event.note,
      velocity: event.velocity,
      time,
      score: this.metronome.running ? scoreHit(this.grid, time, this.scoring) : null,
    });
  }
}
