# Architecture decision records

Short records of decisions that shape the code, in the order they were made.
Each one says what we chose, why, and what we gave up.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-stack.md) | React + TypeScript + Vite, Canvas 2D for drawing | Accepted |
| [0002](0002-timing-model.md) | One clock for scoring: `performance.now()`, with the audio clock mapped onto it | Accepted |
| [0003](0003-hot-path-outside-react.md) | MIDI, audio and drawing run outside React | Accepted |
| [0004](0004-kit-note-map.md) | Kit note map as data, using Nitro Max factory defaults | Accepted (needs check on the real kit) |
| [0005](0005-scoring-rules.md) | Scoring: nearest grid point, ±15 ms on-time window, manual latency offset | Accepted |

New records copy the format: Context, Decision, Consequences.
