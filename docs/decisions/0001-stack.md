# 0001: React + TypeScript + Vite, Canvas 2D for drawing

- Status: Accepted
- Date: 2026-11-10
- Ticket: EDU-5

## Context

The project brief left the stack open: "React or Svelte, Canvas or WebGL". The core problems
(timing accuracy, audio latency, 60fps drawing) depend on browser APIs rather than on the UI
framework, so the stack should stay small and familiar and keep those parts in plain, testable code.

## Decision

- **React 19 + TypeScript (strict) + Vite.** React has the largest ecosystem and is the most
  familiar to contributors. Its rendering cost doesn't matter here because the hot paths live
  outside it (see [0003](0003-hot-path-outside-react.md)).
- **Canvas 2D** for the kit view and timing strip. A dozen shapes with glow and fade effects is easy
  work for Canvas 2D at 60fps.
- **pnpm** as package manager (pinned via `packageManager` in `package.json`). Strict, non-flat `node_modules` catches undeclared dependencies, and installs are faster.
- **Vitest** for unit tests of the pure logic (MIDI parsing, scheduling, clock mapping, scoring).
- **No backend yet.** v1 needs none. Settings persist in `localStorage` as a per-browser convenience.
- **Target browsers: Chrome and Edge.** Firefox supports Web MIDI behind a site-permission prompt.
  Safari has no Web MIDI.

## Consequences

- If v2's scrolling notation needs thousands of moving sprites, we may move that view to WebGL
  (for example PixiJS). The renderer is isolated in `src/render/`, so that change stays local.
- Svelte would have meant less boilerplate and smaller bundles. We accept that cost in exchange for
  React's ecosystem and familiarity.
