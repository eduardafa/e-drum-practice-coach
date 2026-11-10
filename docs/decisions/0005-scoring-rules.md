# 0005: Scoring: nearest grid point, ±15 ms on-time window, manual latency offset

- Status: Accepted
- Date: 2026-11-10
- Ticket: EDU-5

## Context

v1 scores every hit as early or late in milliseconds against the metronome. There's no notation yet,
so we don't know which note the drummer *meant* to play.

## Decision

- **Score against the nearest grid point.** The grid is quarter notes by default, and eighths,
  triplets or sixteenths can be selected. A hit counts only if it is within half a grid interval of a
  point, so it can't be matched to a click it obviously wasn't aiming for.
- **Delta = hit time − grid time.** Negative is early, positive is late. A hit is **on time** when
  |delta| ≤ the window. The window defaults to **±15 ms** and can be set from 5 to 40 ms. 15 ms sits
  between what a trained listener notices (roughly 10 ms) and what feels loose (25–30 ms).
- **Manual latency offset** (−100 to +100 ms) is subtracted from every hit before scoring. It covers
  latency the browser can't measure (see [0002](0002-timing-model.md)).
- Hits are scored only while the metronome runs. Otherwise they just light up the kit.
- Colours: early is blue, on time is green, late is orange. The blue and orange pair stays
  distinguishable for the most common forms of colour blindness.

## Consequences

- "Nearest point" will misjudge hits that are wildly off (more than half an interval). v2's notation
  will replace it with matching against the expected notes.
- Session stats (on-time %, mean signed error, mean absolute error) are kept in memory only. History
  is v3.
