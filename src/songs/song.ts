/**
 * A song opened from the drummer's computer: checks on the file, a waveform
 * overview, a fingerprint to recognize it again, and time formatting. The
 * audio is decoded in the browser and never uploaded. Pure, so it's tested
 * without audio files.
 */

/** Audio types the browser can usually decode. Checked by extension, since file.type is often empty. */
export const SONG_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac"] as const;
/** Big enough for a long WAV; decoded audio takes several times this in memory. */
export const MAX_SONG_BYTES = 100 * 1024 * 1024;
/** Longer than any song a drummer plays along to, short enough to keep memory sane. */
export const MAX_SONG_SECONDS = 20 * 60;

/** Why a file can't be opened, in words for the drummer, or null if it looks fine. */
export function checkSongFile(file: { name: string; size: number }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(SONG_EXTENSIONS as readonly string[]).includes(ext)) {
    return `"${file.name}" isn't an audio file this app can open. Try an MP3, M4A, WAV, OGG or FLAC file.`;
  }
  if (file.size > MAX_SONG_BYTES) return `"${file.name}" is too big (over ${MAX_SONG_BYTES / 1024 / 1024} MB).`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  return null;
}

/** The song's name to show: the file name without its extension. */
export function songTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

/** "3:07" for 187 seconds; "1:02:05" past an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The loudest level in each of `buckets` equal slices (0 to 1), for drawing a waveform overview. */
export function waveformPeaks(samples: Float32Array, buckets: number): Float32Array {
  const peaks = new Float32Array(buckets);
  if (samples.length === 0 || buckets <= 0) return peaks;
  const size = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const end = Math.min(samples.length, Math.floor((b + 1) * size));
    for (let i = Math.floor(b * size); i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    peaks[b] = Math.min(1, max);
  }
  return peaks;
}

/** Seconds of audio the fingerprint looks at, from the start. */
const FINGERPRINT_SECONDS = 10;

/**
 * Recognizes the same song again without storing or uploading its audio: the
 * length (to a tenth of a second) and an FNV-1a hash of coarsely quantized
 * samples from its first seconds. Quantizing makes it stable across decoders'
 * tiny rounding differences.
 */
export function songFingerprint(samples: Float32Array, sampleRate: number): string {
  const n = Math.min(samples.length, Math.round(FINGERPRINT_SECONDS * sampleRate));
  const step = Math.max(1, Math.round(sampleRate / 1000)); // about 1000 points a second
  let hash = 0x811c9dc5;
  for (let i = 0; i < n; i += step) {
    const q = Math.round(samples[i] * 64) & 0xff;
    hash ^= q;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const length = Math.round((samples.length / sampleRate) * 10);
  return `${length.toString(36)}-${hash.toString(36)}`;
}
