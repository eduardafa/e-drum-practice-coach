# 0002: One clock for scoring: `performance.now()`, with the audio clock mapped onto it

- Status: Accepted
- Date: 2026-11-10
- Ticket: EDU-5

## Context

Scoring a hit means comparing two times: when the drummer hit the pad, and when they heard the click.
The browser gives each of these on a different clock:

| Event | Clock | Unit |
|---|---|---|
| MIDI message (`MIDIMessageEvent.timeStamp`) | `performance.now()` | ms |
| Metronome click (`AudioContext.currentTime`) | audio hardware clock | s |

The two clocks have different origins and drift apart slowly. Audio is also heard some time after it is
scheduled (output latency), which varies by device. Bluetooth headphones can add 150 ms or more.

## Decision

1. **Score everything in `performance.now()` milliseconds.** MIDI timestamps are already in it, and they
   record when the message arrived, so they don't depend on how busy the main thread is.
2. **Schedule clicks on the audio clock** with the lookahead pattern ("A Tale of Two Clocks"): a worker
   timer wakes every 25 ms and schedules every click due in the next 120 ms. Click timing is then
   sample-accurate however late a wake-up is.
3. **Convert each click to `performance.now()` time when it is scheduled**, using
   `AudioContext.getOutputTimestamp()`. That call pairs an audio-clock time with the `performance.now()`
   time at which the speakers play it, so the conversion includes output latency. A smoothed offset
   (`ClockMapper`, an exponential moving average that jumps on discontinuities) absorbs jitter and drift.
   Where `getOutputTimestamp()` isn't available, we fall back to `currentTime + baseLatency + outputLatency`.
4. **Store the converted times in a `TimingGrid`**, which is what hits are scored against. Subdivision
   points are included, so eighth-note or sixteenth-note playing scores correctly.
5. **Run the scheduler timer in a Web Worker**, because main-thread timers are throttled in background tabs.

## Consequences

- Latency that the browser can't see remains: USB and module processing on the way in, and the
  driver-reported output latency on the way out. The manual latency offset covers it (see
  [0005](0005-scoring-rules.md)). Automatic calibration ("tap along to 16 clicks") is a good follow-up.
- If the tab is suspended, the scheduler skips the missed clicks rather than playing them in a burst.
