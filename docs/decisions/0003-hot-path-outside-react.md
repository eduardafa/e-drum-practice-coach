# 0003: MIDI, audio and drawing run outside React

- Status: Accepted
- Date: 2026-11-10
- Ticket: EDU-5

## Context

A fast drum fill produces 20 or more hits a second, and the kit view animates at 60fps. Sending each hit
through React state would cause a reconciliation per hit and per frame. That adds main-thread work
exactly when timing matters most.

## Decision

- Plain TypeScript classes own the hot paths: `MidiConnection`, `Metronome`, `KitRenderer`, and `Coach`
  (which wires them together). One `Coach` instance lives for the lifetime of the page.
- Hits are written to a mutable `LiveState`. The `KitRenderer` reads it on every `requestAnimationFrame`.
  Nothing triggers a React render when a hit arrives.
- React renders only the controls. Session stats are polled from `LiveState` every 150 ms. MIDI
  connection status reaches React through `useSyncExternalStore`.

## Consequences

- The core classes have no React dependency, so they are easy to test and could move to another UI.
- Two ways of handling state exist side by side. The split is explicit: React for settings and controls,
  `LiveState` for everything that happens per hit.
