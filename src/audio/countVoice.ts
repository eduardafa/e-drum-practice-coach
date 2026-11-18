/**
 * The spoken count's voice: one short sound file holding every syllable
 * (count/count.wav, made by scripts/count-voice.py with the free Flite
 * speech synthesizer), decoded once into an AudioBuffer. Each syllable is
 * played from its slice of the buffer at an exact audio-clock time, like the
 * click, so the count is as tight as the click. Live speech (speechSynthesis)
 * can't be timed or routed like that.
 */
import countUrl from "./count/count.wav";
import { COUNT_SPRITE } from "./countSprite";
import type { SpokenSyllable } from "./spokenCount";

/** Fades the end so a syllable cut short doesn't pop. */
const FADE_OUT_SEC = 0.012;
/** The voice's level next to the click (both go through the click's volume). */
const VOICE_GAIN = 1.2;

/** How long a syllable lasts, in seconds. */
export function syllableSec(syllable: SpokenSyllable): number {
  return COUNT_SPRITE[syllable]?.duration ?? 0;
}

export class CountVoice {
  private buffer: AudioBuffer | null = null;
  private loading: Promise<AudioBuffer | null> | null = null;
  /** Syllables scheduled and maybe still sounding, so stop() can silence them. */
  private playing = new Set<AudioBufferSourceNode>();

  /** Whether the sound is decoded and ready to play. */
  get ready(): boolean {
    return this.buffer !== null;
  }

  /** Fetches and decodes the sound once; resolves to null (and the click plays alone) if that fails. */
  load(ctx: BaseAudioContext): Promise<AudioBuffer | null> {
    this.loading ??= fetch(countUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`count voice: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => (this.buffer = buffer))
      .catch(() => {
        // Try again next time.
        this.loading = null;
        return null;
      });
    return this.loading;
  }

  /** Schedules `syllable` at `time` (audio-clock seconds), lasting at most `durationSec`. */
  play(ctx: BaseAudioContext, out: AudioNode, syllable: SpokenSyllable, time: number, durationSec: number): void {
    const slice = COUNT_SPRITE[syllable];
    if (!this.buffer || !slice || durationSec <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    const gain = ctx.createGain();
    const end = time + durationSec;
    gain.gain.setValueAtTime(VOICE_GAIN, time);
    gain.gain.setValueAtTime(VOICE_GAIN, Math.max(time, end - FADE_OUT_SEC));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain).connect(out);
    source.start(time, slice.start, durationSec);
    this.playing.add(source);
    source.addEventListener("ended", () => this.playing.delete(source));
  }

  /** Silences every scheduled syllable. */
  stop(): void {
    for (const source of this.playing) {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
    }
    this.playing.clear();
  }
}
