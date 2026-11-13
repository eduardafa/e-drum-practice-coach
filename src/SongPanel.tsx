import { useEffect, useMemo, useRef, useState } from "react";
import { SONG_VOLUME, type Coach } from "./live/coach";
import { releasing } from "./releasing";
import { formatDuration } from "./songs/song";

export interface OpenSong {
  title: string;
  duration: number;
  /** Loudest level per slice, 0 to 1, for the waveform. */
  peaks: Float32Array;
  /** Recognizes this song again later, without storing its audio. */
  fingerprint: string;
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
 * The position comes from the player's audio clock every frame.
 */
export function SongPanel({ coach, song, onClose }: { coach: Coach; song: OpenSong; onClose: () => void }) {
  /** Playing, and whether it's somewhere in the middle (for "Resume"): React only re-renders when these change. */
  const [playing, setPlaying] = useState(false);
  const [midway, setMidway] = useState(false);
  const seekRef = useRef<HTMLInputElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const playedSvgRef = useRef<SVGSVGElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const path = useMemo(() => waveformPath(song.peaks), [song.peaks]);

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
      setMidway(pos > 0 && pos < song.duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [coach, song]);


  return (
    <section className="notation open song-panel" aria-label="Song">
      <div className="notation-header">
        <span className="notation-label">Song</span>
        <span className="song-title">{song.title}</span>
        <button className="primary play" onClick={releasing(() => (playing ? coach.song.pause() : void coach.playSong()))}>
          {playing ? "Pause" : midway ? "Resume" : "Play"}
        </button>
        <button className="secondary" onClick={releasing(onClose)}>
          Close song
        </button>
        <span ref={timeRef} className="song-time">
          0:00 / {formatDuration(song.duration)}
        </span>
      </div>
      <div className="song-wave">
        <svg viewBox={`0 -1 ${song.peaks.length} 2`} preserveAspectRatio="none" aria-hidden>
          <path d={path} className="song-wave-all" />
        </svg>
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
      <p className="hint">
        Playing along to the song with scoring comes next. For now, play the song and drum along freely: your hits
        still light up the kit.
      </p>
    </section>
  );
}
