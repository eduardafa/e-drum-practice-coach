import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAX_BPM, MIN_BPM, type MetronomeSettings, type Subdivision } from "./audio/schedule";
import { Coach, DEFAULT_METRONOME } from "./live/coach";
import type { MidiStatus } from "./midi/connection";
import { formatDelta, KitRenderer } from "./render/kitRenderer";
import { DEFAULT_SCORING, type ScoringOptions } from "./timing/grid";
import { loadSettings, saveSettings } from "./settings";

/** Keyboard fallback so the app can be tried without a kit. */
const KEY_TO_NOTE: Record<string, number> = {
  Space: 36, // kick
  KeyS: 38, // snare
  KeyA: 42, // closed hi-hat
  KeyZ: 44, // hi-hat pedal
  KeyQ: 49, // crash
  KeyW: 48, // tom 1
  KeyE: 45, // tom 2
  KeyD: 43, // tom 3
  KeyR: 51, // ride
};

const saved = loadSettings();
const coach = new Coach(saved.metronome ?? DEFAULT_METRONOME);
coach.scoring = saved.scoring ?? { ...DEFAULT_SCORING };

function useMidiStatus(): MidiStatus {
  return useSyncExternalStore(
    (cb) => coach.midi.onStatus(cb),
    () => coach.midi.getStatus(),
  );
}

interface Stats {
  scored: number;
  onTimePct: number | null;
  meanMs: number | null;
  meanAbsMs: number | null;
  lastNote: string;
}

function readStats(): Stats {
  const l = coach.live;
  const last = l.lastHit;
  return {
    scored: l.scoredHits,
    onTimePct: l.scoredHits ? (100 * l.onTimeHits) / l.scoredHits : null,
    meanMs: l.scoredHits ? l.sumDeltaMs / l.scoredHits : null,
    meanAbsMs: l.scoredHits ? l.sumAbsDeltaMs / l.scoredHits : null,
    lastNote: last
      ? `note ${last.note} · ${last.pad ? `${last.pad} ${last.zone}` : "unmapped"} · vel ${last.velocity}`
      : "—",
  };
}

/** Polls the live state a few times a second; per-hit React renders aren't needed. */
function useStats(): Stats {
  const [stats, setStats] = useState(readStats);
  useEffect(() => {
    const id = setInterval(() => setStats(readStats()), 150);
    return () => clearInterval(id);
  }, []);
  return stats;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const midi = useMidiStatus();
  const stats = useStats();
  const [metronome, setMetronome] = useState<MetronomeSettings>(
    saved.metronome ?? DEFAULT_METRONOME,
  );
  const [scoring, setScoring] = useState<ScoringOptions>(coach.scoring);
  const [running, setRunning] = useState(false);
  const [volume, setVolume] = useState(coach.metronome.volume);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new KitRenderer(canvas, coach.live, {
      getToleranceMs: () => coach.scoring.toleranceMs,
    });
    renderer.start();
    return () => renderer.dispose();
  }, []);

  useEffect(() => {
    coach.metronome.setSettings(metronome);
    coach.scoring = scoring;
    saveSettings({ metronome, scoring });
  }, [metronome, scoring]);

  useEffect(() => {
    coach.metronome.volume = volume;
  }, [volume]);

  const toggleMetronome = async () => {
    if (coach.metronome.running) {
      coach.stopMetronome();
      setRunning(false);
    } else {
      await coach.startMetronome();
      setRunning(true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "KeyM") {
        void toggleMetronome();
        return;
      }
      const note = KEY_TO_NOTE[e.code];
      if (note !== undefined) {
        e.preventDefault();
        coach.simulateHit(note, 100, e.timeStamp);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const updateMetronome = (patch: Partial<MetronomeSettings>) =>
    setMetronome((m) => ({ ...m, ...patch }));
  const updateScoring = (patch: Partial<ScoringOptions>) => setScoring((s) => ({ ...s, ...patch }));

  return (
    <div className="app">
      <header className="topbar">
        <h1>E-drum Practice Coach</h1>
        <MidiPanel status={midi} />
      </header>

      <main className="stage">
        <canvas ref={canvasRef} className="kit-canvas" aria-label="Live view of the drum kit" />
      </main>

      <aside className="controls">
        <section>
          <h2>Metronome</h2>
          <button className={`primary ${running ? "active" : ""}`} onClick={() => void toggleMetronome()}>
            {running ? "Stop" : "Start"} <kbd>M</kbd>
          </button>
          <label className="field">
            <span>Tempo</span>
            <input
              type="range"
              min={MIN_BPM}
              max={MAX_BPM}
              value={metronome.bpm}
              onChange={(e) => updateMetronome({ bpm: Number(e.target.value) })}
            />
            <input
              type="number"
              className="num"
              min={MIN_BPM}
              max={MAX_BPM}
              value={metronome.bpm}
              onChange={(e) => {
                const bpm = Number(e.target.value);
                if (bpm >= MIN_BPM && bpm <= MAX_BPM) updateMetronome({ bpm });
              }}
            />
            <span className="unit">BPM</span>
          </label>
          <label className="field">
            <span>Beats per bar</span>
            <select
              value={metronome.beatsPerBar}
              onChange={(e) => updateMetronome({ beatsPerBar: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Score against</span>
            <select
              value={metronome.subdivision}
              onChange={(e) => updateMetronome({ subdivision: Number(e.target.value) as Subdivision })}
            >
              <option value={1}>Quarter notes</option>
              <option value={2}>Eighth notes</option>
              <option value={3}>Triplets</option>
              <option value={4}>Sixteenth notes</option>
            </select>
          </label>
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={metronome.clickSubdivisions}
              onChange={(e) => updateMetronome({ clickSubdivisions: e.target.checked })}
            />
            <span>Click on subdivisions</span>
          </label>
          <label className="field">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </label>
        </section>

        <section>
          <h2>Scoring</h2>
          <label className="field">
            <span>On-time window</span>
            <input
              type="range"
              min={5}
              max={40}
              value={scoring.toleranceMs}
              onChange={(e) => updateScoring({ toleranceMs: Number(e.target.value) })}
            />
            <span className="unit">±{scoring.toleranceMs} ms</span>
          </label>
          <label className="field">
            <span>Latency offset</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={scoring.latencyOffsetMs}
              onChange={(e) => updateScoring({ latencyOffsetMs: Number(e.target.value) })}
            />
            <span className="unit">{formatDelta(scoring.latencyOffsetMs)}</span>
          </label>
          <p className="hint">
            If your hits feel on time but always score late, raise the offset by about your average.
          </p>
        </section>

        <section>
          <h2>This session</h2>
          <dl className="stats">
            <dt>Scored hits</dt>
            <dd>{stats.scored}</dd>
            <dt>On time</dt>
            <dd>{stats.onTimePct === null ? "—" : `${stats.onTimePct.toFixed(0)}%`}</dd>
            <dt>Average</dt>
            <dd>{stats.meanMs === null ? "—" : formatDelta(stats.meanMs)}</dd>
            <dt>Average |error|</dt>
            <dd>{stats.meanAbsMs === null ? "—" : `${stats.meanAbsMs.toFixed(1)} ms`}</dd>
          </dl>
          <p className="last-note">Last hit: {stats.lastNote}</p>
        </section>

        <p className="hint">
          No kit? Use the keyboard: <kbd>Space</kbd> kick, <kbd>S</kbd> snare, <kbd>A</kbd> hi-hat,{" "}
          <kbd>Q</kbd> crash, <kbd>W</kbd>/<kbd>E</kbd>/<kbd>D</kbd> toms, <kbd>R</kbd> ride.
        </p>
      </aside>
    </div>
  );
}

function MidiPanel({ status }: { status: MidiStatus }) {
  switch (status.state) {
    case "unsupported":
      return (
        <div className="midi warn">
          This browser doesn't support Web MIDI. Use Chrome, Edge or Firefox.
        </div>
      );
    case "idle":
      return (
        <button className="primary" onClick={() => void coach.midi.connect()}>
          Connect kit
        </button>
      );
    case "requesting":
      return <div className="midi">Waiting for MIDI permission…</div>;
    case "denied":
      return <div className="midi warn">MIDI access denied: {status.message}</div>;
    case "ready":
      if (status.devices.length === 0) {
        return <div className="midi warn">No MIDI devices found. Plug in the kit over USB.</div>;
      }
      return (
        <label className="midi">
          <span className={`dot ${status.selectedId ? "on" : ""}`} aria-hidden />
          <select
            value={status.selectedId ?? ""}
            onChange={(e) => coach.midi.select(e.target.value || null)}
          >
            <option value="">No input</option>
            {status.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      );
  }
}
