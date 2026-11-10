/**
 * Pure metronome step arithmetic, kept separate from Web Audio so it can be
 * tested. Times are in seconds on the audio clock.
 */

export type Subdivision = 1 | 2 | 3 | 4;

export function isSubdivision(value: unknown): value is Subdivision {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: number;
  /** Grid points per beat: 1 = quarters, 2 = eighths, 3 = triplets, 4 = sixteenths. */
  subdivision: Subdivision;
  /** Click on subdivisions too, not only on beats. */
  clickSubdivisions: boolean;
}

export const MIN_BPM = 30;
export const MAX_BPM = 300;

export interface ScheduleCursor {
  nextTime: number;
  beatInBar: number;
  subInBeat: number;
}

export interface ScheduledStep {
  time: number;
  intervalSec: number;
  beat: boolean;
  downbeat: boolean;
}

export function stepInterval(settings: MetronomeSettings): number {
  return 60 / settings.bpm / settings.subdivision;
}

/**
 * Returns every step whose time is before `horizon`, advancing the cursor
 * past them. Settings are read per step, so tempo changes apply from the
 * next step without a jump.
 */
export function takeStepsUntil(
  cursor: ScheduleCursor,
  settings: MetronomeSettings,
  horizon: number,
): ScheduledStep[] {
  const steps: ScheduledStep[] = [];
  while (cursor.nextTime < horizon) {
    // A subdivision change can leave subInBeat out of range; snap to the next beat.
    if (cursor.subInBeat >= settings.subdivision) {
      cursor.subInBeat = 0;
      cursor.beatInBar = (cursor.beatInBar + 1) % settings.beatsPerBar;
    }
    if (cursor.beatInBar >= settings.beatsPerBar) cursor.beatInBar = 0;

    const intervalSec = stepInterval(settings);
    const beat = cursor.subInBeat === 0;
    steps.push({
      time: cursor.nextTime,
      intervalSec,
      beat,
      downbeat: beat && cursor.beatInBar === 0,
    });

    cursor.nextTime += intervalSec;
    cursor.subInBeat += 1;
    if (cursor.subInBeat >= settings.subdivision) {
      cursor.subInBeat = 0;
      cursor.beatInBar = (cursor.beatInBar + 1) % settings.beatsPerBar;
    }
  }
  return steps;
}
