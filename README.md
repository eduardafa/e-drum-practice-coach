# E-drum Practice Coach

A web app you plug your electronic drum kit into that scores your practice. It reads every hit from an
**Alesis Nitro Max** over the **Web MIDI API**, lights it up on a drawing of the kit, runs a
sample-accurate metronome, and tells you how early or late each hit was, in milliseconds.

## v1 features

- Connect to the kit over USB with Web MIDI. The kit is selected automatically, and hot-plugging works.
- Live kit view on Canvas 2D at 60fps. Pads flash by how hard they were hit and are coloured by
  timing: early is blue, on time is green, late is orange.
- Lookahead metronome on Web Audio, with tempo, beats per bar, subdivisions and an accented downbeat.
- Per-hit timing in ms, a per-pad timing strip over the last 5 s, and session stats.
- Adjustable on-time window and latency offset.
- Keyboard fallback for trying the app without a kit.

## Running it

Requires Node 26 (see `.nvmrc`), pnpm 12 (pinned in `packageManager`) and Chrome or Edge.

```sh
pnpm install
pnpm dev           # http://localhost:5173
pnpm test          # unit tests
pnpm build         # type-check + production build
```

Plug the kit in over USB, click **Connect kit**, allow MIDI access, then press **M** to start the
metronome.

Without a kit: <kbd>Space</kbd> kick, <kbd>S</kbd> snare, <kbd>A</kbd> hi-hat, <kbd>Z</kbd> hi-hat pedal,
<kbd>Q</kbd> crash, <kbd>W</kbd>/<kbd>E</kbd>/<kbd>D</kbd> toms, <kbd>R</kbd> ride.

## How timing works

MIDI timestamps and the audio clock are separate clocks. Clicks are scheduled ahead of time on the audio
clock, converted to `performance.now()` time (including output latency) as they are scheduled, and
stored as a timing grid. Each MIDI hit is then compared with the nearest grid point. The full reasoning
is in [docs/decisions/0002-timing-model.md](docs/decisions/0002-timing-model.md).

## Code layout

```
src/
  midi/     Web MIDI connection and MIDI byte parsing
  audio/    metronome scheduler, worker timer, audio-to-performance clock mapping
  timing/   timing grid and hit scoring
  kit/      Nitro Max note map and pad layout
  live/     Coach (wiring) and LiveState (shared per-hit state)
  render/   Canvas 2D kit renderer
docs/decisions/   architecture decision records
```

## Roadmap

- **v1** (this): live kit view, metronome, hit timing
- **v2**: groove and rudiment library as scrolling notation, accuracy score, "slow down until 95%" mode
- **v3**: practice history, streaks, timing stats over time, pad heatmaps
