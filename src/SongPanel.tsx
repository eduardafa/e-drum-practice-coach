import { useEffect, useMemo, useRef, useState } from "react";
import { BeatGridTools } from "./BeatGridTools";
import type { DrumTab } from "./songs/drumTab";
import type { MidiDrumPart } from "./songs/midiFile";
import { DrumTabPanel } from "./DrumTabPanel";
import { SONG_VOLUME, type Coach } from "./live/coach";
import { GET_READY_OPTIONS } from "./playalong/getReady";
import { releasing } from "./releasing";
import type { BeatGrid } from "./songs/beats";
import { formatDuration, tabSearchUrl } from "./songs/song";

export interface OpenSong {
  title: string;
  duration: number;
  /** Loudest level per slice, 0 to 1, for the waveform. */
  peaks: Float32Array;
  /** Recognizes this song again later, without storing its audio. */
  fingerprint: string;
  /** Its beats, once found (or saved from before, corrections included); null while they're being found. */
  grid: BeatGrid | null;
  /** The beats as the app found them, to go back to after corrections; null while they're being found. */
  found: BeatGrid | null;
  /** Set when this is a drum tab practiced on its own, with no song: its beats are the file's. */
  tab?: { name: string; part: MidiDrumPart; tab: DrumTab; speed: number };
}

/** Beat lines for the waveform, in its 0..peaks coordinates: every beat, with each beat 1 separately. */
function beatLines(grid: BeatGrid, duration: number, width: number): { beats: string; downbeats: string } {
  let beats = "", downbeats = "";
  grid.beats.forEach((t, i) => {
    const x = ((t / duration) * width).toFixed(2);
    if ((i - grid.firstDownbeat) % 4 === 0 && i >= grid.firstDownbeat) downbeats += `M${x} -1V1`;
    else beats += `M${x} -1V1`;
  });
  return { beats, downbeats };
}

/** The progress bar's fill; a new object only when the whole-percent value changes. */
const analysisStyles = new Map<number, { width: string }>();
function analysisStyle(done: number): { width: string } {
  const pct = Math.floor(done * 100);
  let style = analysisStyles.get(pct);
  if (!style) analysisStyles.set(pct, (style = { width: `${pct}%` }));
  return style;
}

/** The waveform as one SVG path: a mirrored bar per peak, drawn in a 0..peaks × -1..1 box. */
function waveformPath(peaks: Float32Array): string {
  let d = "";
  peaks.forEach((p, i) => {
    const h = Math.max(0.02, p);
    d += `M${i + 0.5} ${-h}V${h}`;
  });
  return d;
}

/**
 * An opened song, in the notation's place: its name and length, the waveform
 * with a playhead, play / pause, and click, drag or arrow keys to move around.
 * The position comes from the player's audio clock every frame. Play along
 * scores every hit against the song's beats, from where the playhead is.
 */
export function SongPanel({
  coach,
  song,
  analyzing,
  onGridChange,
  getReadySec,
  onGetReadyChange,
  onTabSpeed,
  showMetronome,
  onClose,
}: {
  coach: Coach;
  song: OpenSong;
  /** Finding the beats: 0 to 1, or null when not running. */
  analyzing: number | null;
  /** The drummer corrected the beats. */
  onGridChange: (grid: BeatGrid) => void;
  /** Seconds of get-ready countdown before playing along; 0 for none. */
  getReadySec: number;
  onGetReadyChange: (seconds: number) => void;
  /** For a tab on its own: play it at this fraction of its tempo. */
  onTabSpeed: (speed: number) => void;
  /** Show the small metronome (Settings): beside a drum tab when one is open. */
  showMetronome: boolean;
  onClose: () => void;
}) {
  const tabOnly = song.tab !== undefined;
  const fixedTab = useMemo(
    () => song.tab && { name: song.tab.name, tab: song.tab.tab, speed: song.tab.speed, onSpeed: onTabSpeed },
    [song.tab, onTabSpeed],
  );
  /** Playing, and whether it's somewhere in the middle (for "Resume"): React only re-renders when these change. */
  const [playing, setPlaying] = useState(false);
  const [midway, setMidway] = useState(false);
  /** Drumming along, scored (countdown included). */
  const [along, setAlong] = useState(false);
  const seekRef = useRef<HTMLInputElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const playedSvgRef = useRef<SVGSVGElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const path = useMemo(() => waveformPath(song.peaks), [song.peaks]);
  const lines = useMemo(
    () => (song.grid ? beatLines(song.grid, song.duration, song.peaks.length) : null),
    [song.grid, song.duration, song.peaks.length],
  );

  // Every frame, outside React (like the notation's playhead): move the playhead, the played part and the time.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const pos = coach.song.position();
      const progress = song.duration > 0 ? pos / song.duration : 0;
      const pct = `${(progress * 100).toFixed(2)}%`;
      if (playedRef.current) playedRef.current.style.width = pct;
      // The played part shows the same waveform, clipped: its SVG stays full width while its box grows.
      if (playedSvgRef.current) playedSvgRef.current.style.width = progress > 0 ? `${(100 / progress).toFixed(2)}%` : "100%";
      if (headRef.current) headRef.current.style.left = pct;
      const text = `${formatDuration(pos)} / ${formatDuration(song.duration)}`;
      if (timeRef.current && timeRef.current.textContent !== text) timeRef.current.textContent = text;
      const seek = seekRef.current;
      // Not while the drummer is dragging it, so the thumb doesn't jump back under their finger.
      if (seek && document.activeElement !== seek) seek.value = pos.toFixed(1);
      seek?.setAttribute("aria-valuetext", `${formatDuration(pos)} of ${formatDuration(song.duration)}`);
      setPlaying(coach.song.playing);
      setAlong(coach.playingAlong);
      setMidway(pos > 0 && pos < song.duration);
      coach.tickSongClick(song.grid);
      coach.tickSongTab();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      coach.stopSongClick();
    };
  }, [coach, song]);


  return (
    <section className={`notation open song-panel ${tabOnly ? "tab-only" : ""}`} aria-label={tabOnly ? "Drum tab" : "Song"}>
      <div className="notation-header">
        <span className="notation-label">{tabOnly ? "Drum tab" : "Song"}</span>
        <span className="song-title">{song.title}</span>
        {along ? (
          <button className="secondary" onClick={releasing(() => coach.endSongPlayAlong())}>
            Stop
          </button>
        ) : (
          <>
            <button
              className="primary play"
              disabled={!song.grid}
              title={song.grid ? "Drum along: every hit is scored against the song's beats" : "Waiting for the song's beats"}
              onClick={releasing(() => song.grid && void coach.startSongPlayAlong(song.grid, getReadySec))}
            >
              Play along
            </button>
            <button className="secondary" onClick={releasing(() => (playing ? coach.song.pause() : void coach.playSong()))}>
              {playing ? "Pause" : midway ? "Resume" : "Listen"}
            </button>
            {midway && !playing && (
              <button className="secondary" onClick={releasing(() => coach.song.seek(0, SONG_VOLUME))}>
                Back to the start
              </button>
            )}
            <select
              aria-label="Countdown before playing along"
              title="Time to get to the kit before the song starts"
              value={getReadySec}
              onChange={(e) => {
                e.currentTarget.blur();
                onGetReadyChange(Number(e.target.value));
              }}
            >
              {GET_READY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "No countdown" : `${n} s to get ready`}
                </option>
              ))}
            </select>
            <button className="secondary" onClick={releasing(onClose)}>
              {tabOnly ? "Close tab" : "Close song"}
            </button>
          </>
        )}
        <span className="song-tempo">
          {song.grid ? `≈ ${Math.round(song.grid.bpm)} BPM` : analyzing !== null ? `Finding the beats… ${Math.floor(analyzing * 100)}%` : ""}
        </span>
        <span ref={timeRef} className="song-time">
          0:00 / {formatDuration(song.duration)}
        </span>
        {!tabOnly && (
        <a
          className="song-tab-link"
          href={tabSearchUrl(song.title)}
          target="_blank"
          rel="noopener noreferrer"
          title="Search Songsterr for this song's drum tab, in a new tab. Only the song's name is sent."
        >
          Find the drum tab
        </a>
        )}
      </div>
      <div className="song-wave">
        <svg viewBox={`0 -1 ${song.peaks.length} 2`} preserveAspectRatio="none" aria-hidden>
          <path d={path} className="song-wave-all" />
          {lines && <path d={lines.beats} className="song-beat" />}
          {lines && <path d={lines.downbeats} className="song-downbeat" />}
        </svg>
        {analyzing !== null && (
          <div className="song-analyzing" aria-hidden>
            <div style={analysisStyle(analyzing)} />
          </div>
        )}
        <div ref={playedRef} className="song-wave-played" aria-hidden>
          <svg ref={playedSvgRef} viewBox={`0 -1 ${song.peaks.length} 2`} preserveAspectRatio="none">
            <path d={path} />
          </svg>
        </div>
        <div ref={headRef} className="song-wave-head" aria-hidden />
        {/* An invisible native slider over the waveform: click or drag to move, arrow keys for 1 s steps. */}
        <input
          ref={seekRef}
          className="song-seek"
          type="range"
          min={0}
          max={song.duration}
          step={1}
          defaultValue={0}
          aria-label="Song position"
          onInput={(e) => coach.song.seek(Number(e.currentTarget.value), SONG_VOLUME)}
        />
      </div>
      {/* A new song starts with no tab: the file belongs to the song it was opened with. */}
      <DrumTabPanel
        key={song.fingerprint}
        coach={coach}
        grid={song.grid}
        fixed={fixedTab}
        showMetronome={showMetronome}
      />
      {song.grid && !along && !tabOnly && (
        <BeatGridTools
          coach={coach}
          grid={song.grid}
          found={song.found}
          duration={song.duration}
          onChange={onGridChange}
        />
      )}
      <p className="hint">
        {along
          ? coach.hasSongTab
            ? "Playing along: each note of the tab is checked, the right drum and in time, and marked on the tab (violet: the wrong drum). Your timing numbers are in the side panel and the timing strip."
            : "Playing along: every hit is scored against the song's beats (and the counts in between, if you chose them in the side panel). Your numbers are in the side panel and the timing strip."
          : song.grid
            ? tabOnly
              ? "The tab plays at its own tempo; slow it down with Speed. Play along starts from the playhead: click the line above to choose where."
              : "The lines are the song's beats; the stronger ones are beat 1. Play along starts from the playhead: click the waveform to choose where."
            : "Finding the song's beats: the lines appear on the waveform when it's done. You can listen to the song meanwhile."}
      </p>
    </section>
  );
}
