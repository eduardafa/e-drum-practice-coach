/**
 * The song opened from this computer: decoding, its waveform and fingerprint,
 * finding its beats in a worker (or reusing the grid saved for it), and the
 * list of songs opened before. Audio is never stored or uploaded.
 */
import { useEffect, useRef, useState } from "react";
import { coach } from "./appState";
import type { OpenSong } from "./SongPanel";
import { analyzeSong } from "./songs/analyzeSong";
import { checkSongFile, MAX_SONG_SECONDS, songFingerprint, songTitle, waveformPeaks } from "./songs/song";
import { loadSongs, remember, saveSongs, type RememberedSong } from "./songs/songStore";

/** `beforeOpen` lets App stop a session and close its panels once a song has opened. */
export function useSong(beforeOpen: () => void) {
  const [song, setSong] = useState<OpenSong | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Finding the beats: 0 to 1 while it runs, null otherwise. */
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [remembered, setRemembered] = useState<RememberedSong[]>(loadSongs);
  const cancelAnalysis = useRef<(() => void) | null>(null);

  // Stop a running analysis if the page goes away.
  useEffect(() => () => cancelAnalysis.current?.(), []);

  const store = (next: RememberedSong[]) => {
    setRemembered(next);
    saveSongs(next);
  };

  const open = async (file: File) => {
    const problem = checkSongFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Decoded at a fixed rate on an offline context: no audio permission needed, and the beat
      // analysis sees the same rate whatever the device. The buffer plays on any context.
      const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await file.arrayBuffer());
      if (buffer.duration > MAX_SONG_SECONDS) {
        setError(`"${file.name}" is longer than ${MAX_SONG_SECONDS / 60} minutes.`);
        return;
      }
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
      const mono = new Float32Array(left.length);
      for (let i = 0; i < mono.length; i++) mono[i] = (left[i] + right[i]) / 2;
      const fingerprint = songFingerprint(mono, buffer.sampleRate);
      const title = songTitle(file.name);
      const saved = remembered.find((s) => s.fingerprint === fingerprint);

      cancelAnalysis.current?.();
      beforeOpen();
      coach.song.load(buffer);
      setSong({ title, duration: buffer.duration, peaks: waveformPeaks(mono, 800), fingerprint, grid: saved?.grid ?? null });
      const entry = (grid: RememberedSong["grid"]): RememberedSong => ({
        fingerprint,
        title,
        duration: buffer.duration,
        lastOpened: Temporal.Now.instant().toString(),
        grid,
      });

      if (saved) {
        // Opened before: its beats come back at once.
        store(remember(remembered, entry(saved.grid)));
        return;
      }
      setAnalyzing(0);
      const run = analyzeSong(mono, buffer.sampleRate, setAnalyzing);
      cancelAnalysis.current = run.cancel;
      try {
        const grid = await run.result;
        setSong((s) => (s && s.fingerprint === fingerprint ? { ...s, grid } : s));
        setRemembered((list) => {
          const next = remember(list, entry(grid));
          saveSongs(next);
          return next;
        });
      } catch {
        // Canceled (another song or closed) or failed: the song still plays, just without beats.
      } finally {
        if (cancelAnalysis.current === run.cancel) {
          cancelAnalysis.current = null;
          setAnalyzing(null);
        }
      }
    } catch {
      setError(`"${file.name}" couldn't be opened. It may be damaged, or in a format this browser can't play.`);
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    cancelAnalysis.current?.();
    cancelAnalysis.current = null;
    setAnalyzing(null);
    coach.song.load(null);
    setSong(null);
  };

  /** Removes a song (and its saved beats) from this browser. */
  const forget = (fingerprint: string) => store(remembered.filter((s) => s.fingerprint !== fingerprint));

  return { song, loading, error, analyzing, remembered, open, close, forget };
}
