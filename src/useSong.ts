/**
 * The song opened from this computer: decoding, its waveform and fingerprint,
 * finding its beats in a worker (or reusing the grid saved for it), and the
 * list of songs opened before. Audio is never stored or uploaded.
 */
import { useEffect, useRef, useState } from "react";
import { coach } from "./appState";
import type { OpenSong } from "./SongPanel";
import { analyzeSong } from "./songs/analyzeSong";
import type { BeatGrid } from "./songs/beats";
import { drumTabFrom } from "./songs/drumTab";
import { MidiError } from "./songs/midiFile";
import { readTabFile } from "./songs/tabFile";
import { SONG_VOLUME } from "./live/coach";
import { tabTimeline } from "./songs/tabSong";
import type { SongLoop } from "./songs/player";
import { stretchChannels } from "./songs/stretch";
import { checkSongFile, MAX_SONG_SECONDS, songFingerprint, songTitle, waveformPeaks } from "./songs/song";
import { loadSongs, remember, saveSongs, type RememberedSong } from "./songs/songStore";
import { forgetTab, keepTabsFor } from "./songs/tabStore";

/** A MIDI file bigger than this isn't a drum part. */
const MAX_TAB_FILE_BYTES = 4 * 1024 * 1024;
/** A tab on its own has no waveform: a flat line this many slices wide, with its beats drawn on it. */
const TAB_PEAKS = 800;
/** The lowest rate an AudioBuffer allows: a silent track only needs a length. */
const SILENCE_RATE = 3000;

/** A silent track `seconds` long, for a tab practiced without its song. */
function silence(seconds: number): AudioBuffer {
  return new AudioBuffer({ length: Math.max(1, Math.ceil(seconds * SILENCE_RATE)), sampleRate: SILENCE_RATE, numberOfChannels: 1 });
}

/** `beforeOpen` lets App stop a session and close its panels once a song has opened. */
export function useSong(beforeOpen: () => void) {
  const [song, setSong] = useState<OpenSong | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Finding the beats: 0 to 1 while it runs, null otherwise. */
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [remembered, setRemembered] = useState<RememberedSong[]>(loadSongs);
  const cancelAnalysis = useRef<(() => void) | null>(null);
  /** Making a slowed copy (EDU-122): the speed it's for and how far along (0 to 1), or null. */
  const [slowing, setSlowing] = useState<{ speed: number; done: number } | null>(null);
  /** The open song as decoded, to make slowed copies from. */
  const songAudio = useRef<AudioBuffer | null>(null);
  /** The last slowed copy, kept while the song is open (a whole song's worth of audio, so only one). */
  const slowedCopy = useRef<{ speed: number; buffer: AudioBuffer } | null>(null);
  const slowingAbort = useRef<AbortController | null>(null);
  const resetSpeed = () => {
    slowingAbort.current?.abort();
    slowingAbort.current = null;
    slowedCopy.current = null;
    setSlowing(null);
  };

  // Stop a running analysis, or a slowed copy being made, if the page goes away.
  useEffect(
    () => () => {
      cancelAnalysis.current?.();
      slowingAbort.current?.abort();
    },
    [],
  );

  const store = (next: RememberedSong[]) => {
    setRemembered(next);
    saveSongs(next);
    // A song that drops off the list takes its remembered tab with it.
    keepTabsFor(next.map((s) => s.fingerprint));
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
      coach.endSongPlayAlong();
      resetSpeed();
      songAudio.current = buffer;
      coach.song.load(buffer);
      // Its loop comes back too (EDU-121); the player checks it fits.
      if (saved?.loop) coach.song.setLoop(saved.loop, SONG_VOLUME);
      setSong({
        title,
        duration: buffer.duration,
        peaks: waveformPeaks(mono, 800),
        fingerprint,
        grid: saved?.grid ?? null,
        found: saved ? (saved.found ?? saved.grid) : null,
        loop: coach.song.loop,
        speed: 1,
      });
      const entry = (grid: BeatGrid, found?: BeatGrid): RememberedSong => ({
        fingerprint,
        title,
        duration: buffer.duration,
        lastOpened: Temporal.Now.instant().toString(),
        grid,
        ...(found && { found }),
        ...(coach.song.loop && { loop: coach.song.loop }),
      });

      if (saved) {
        // Opened before: its beats come back at once, corrections included.
        store(remember(remembered, entry(saved.grid, saved.found)));
        return;
      }
      setAnalyzing(0);
      const run = analyzeSong(mono, buffer.sampleRate, setAnalyzing);
      cancelAnalysis.current = run.cancel;
      try {
        const grid = await run.result;
        setSong((s) => (s && s.fingerprint === fingerprint ? { ...s, grid, found: grid } : s));
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
    coach.endSongPlayAlong();
    resetSpeed();
    songAudio.current = null;
    coach.song.load(null);
    setSong(null);
  };

  /**
   * Plays the open song at `speed` (EDU-122), without changing its pitch: a
   * slowed copy is made the first time (a second or two for a whole song, with
   * progress), then swapped in where the song is. Full speed goes back to the
   * original. Picking again while a copy is being made cancels that one.
   */
  const setSpeed = async (speed: number) => {
    const audio = songAudio.current;
    if (!song || !audio) return;
    const { fingerprint } = song;
    const apply = (slowed: AudioBuffer | null) => {
      coach.song.setSpeed(speed, slowed, SONG_VOLUME);
      setSong((s) => (s && s.fingerprint === fingerprint ? { ...s, speed: coach.song.speed } : s));
    };
    slowingAbort.current?.abort();
    slowingAbort.current = null;
    setSlowing(null);
    if (speed === 1) return apply(null);
    if (slowedCopy.current?.speed === speed) return apply(slowedCopy.current.buffer);
    const abort = new AbortController();
    slowingAbort.current = abort;
    setSlowing({ speed, done: 0 });
    try {
      const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      const stretched = await stretchChannels(channels, speed, (done) => setSlowing({ speed, done }), abort.signal);
      if (abort.signal.aborted || songAudio.current !== audio) return;
      const slowed = new AudioBuffer({ length: stretched[0].length, numberOfChannels: stretched.length, sampleRate: audio.sampleRate });
      stretched.forEach((data, c) => slowed.copyToChannel(data, c));
      slowedCopy.current = { speed, buffer: slowed };
      apply(slowed);
    } catch {
      // Canceled: another speed was picked, or the song closed.
    } finally {
      if (slowingAbort.current === abort) {
        slowingAbort.current = null;
        setSlowing(null);
      }
    }
  };

  /**
   * Replaces the open song's beats with the drummer's correction, and saves
   * it. Passing the beats as found goes back to them.
   */
  const setGrid = (grid: BeatGrid) => {
    if (!song) return;
    const { fingerprint, found } = song;
    setSong((s) => (s && s.fingerprint === fingerprint ? { ...s, grid } : s));
    setRemembered((list) => {
      const saved = list.find((s) => s.fingerprint === fingerprint);
      if (!saved) return list;
      const { found: _, ...rest } = saved;
      const next = list.map((s) =>
        s === saved ? { ...rest, grid, ...(found && grid !== found && { found }) } : s,
      );
      saveSongs(next);
      return next;
    });
  };

  /**
   * Sets (or clears, with null) the section of the open song that repeats,
   * and saves it with the song.
   */
  const setLoop = (loop: SongLoop | null) => {
    if (!song) return;
    coach.song.setLoop(loop, SONG_VOLUME);
    const applied = coach.song.loop;
    const { fingerprint } = song;
    setSong((s) => (s && s.fingerprint === fingerprint ? { ...s, loop: applied } : s));
    setRemembered((list) => {
      const saved = list.find((s) => s.fingerprint === fingerprint);
      if (!saved) return list;
      const { loop: _, ...rest } = saved;
      const next = list.map((s) => (s === saved ? { ...rest, ...(applied && { loop: applied }) } : s));
      saveSongs(next);
      return next;
    });
  };

  /**
   * Opens a drum tab file (MIDI or Guitar Pro) on its own, to practice
   * without the song: its own beats, at `speed` of its tempo, played on a
   * silent track of the right length so everything a song has works on it.
   * Never stored.
   */
  const openTab = async (file: File) => {
    setError(null);
    if (file.size > MAX_TAB_FILE_BYTES) {
      setError(`"${file.name}" is too big to be a drum tab.`);
      return;
    }
    try {
      const part = await readTabFile(new Uint8Array(await file.arrayBuffer()));
      const tab = drumTabFrom(part);
      if (tab.notes.length === 0) {
        setError(`"${file.name}" has drums, but none on the kit's pads.`);
        return;
      }
      cancelAnalysis.current?.();
      cancelAnalysis.current = null;
      setAnalyzing(null);
      beforeOpen();
      coach.endSongPlayAlong();
      const name = songTitle(file.name);
      const { grid, duration } = tabTimeline(part, tab, 1);
      resetSpeed();
      songAudio.current = null;
      coach.song.load(silence(duration));
      setSong({
        title: name,
        duration,
        peaks: new Float32Array(TAB_PEAKS),
        fingerprint: `tab:${name}:${file.size}:${file.lastModified}`,
        // A tab on its own has no loop for now, and its own speed (it changes the tab's timeline).
        loop: null,
        speed: 1,
        grid,
        found: grid,
        tab: { name, part, tab, speed: 1 },
      });
    } catch (e) {
      setError(e instanceof MidiError ? `"${file.name}": ${e.message}` : `"${file.name}" couldn't be read.`);
    }
  };

  /** Plays the open tab (on its own) at `speed` of its tempo, keeping the place in it. */
  const setTabSpeed = (speed: number) => {
    const current = song?.tab;
    if (!song || !current || current.speed === speed) return;
    coach.endSongPlayAlong();
    const place = coach.song.position() * (current.speed / speed);
    const { grid, duration } = tabTimeline(current.part, current.tab, speed);
    coach.song.load(silence(duration));
    coach.song.seek(place, SONG_VOLUME);
    setSong({ ...song, duration, grid, found: grid, tab: { ...current, speed } });
  };

  /** Removes a song (its saved beats, and its tab) from this browser. */
  const forget = (fingerprint: string) => {
    forgetTab(fingerprint);
    store(remembered.filter((s) => s.fingerprint !== fingerprint));
  };

  return { song, loading, error, analyzing, slowing, remembered, open, openTab, setTabSpeed, close, forget, setGrid, setLoop, setSpeed };
}
