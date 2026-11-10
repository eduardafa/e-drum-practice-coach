# 0004: Kit note map as data, using Nitro Max factory defaults

- Status: Accepted (needs a check on the real kit)
- Date: 2026-11-10
- Ticket: EDU-5

## Context

Each pad on the Alesis Nitro Max sends a MIDI note number, and some pads send different notes for
different zones (head and rim, cymbal bow and edge, open and closed hi-hat). The numbers can be
reassigned on the module.

## Decision

- The map lives in `src/kit/nitroMax.ts` as plain data (`NITRO_MAX_NOTE_MAP`), separate from the
  on-screen layout (`NITRO_MAX_PADS`).
- The defaults follow General MIDI percussion, which is what the module uses from the factory:
  kick 36, snare 38 (rim 40, cross-stick 37), toms 48, 45 and 43 (rims 50, 47 and 58), hi-hat closed 42,
  open 46 and pedal 44, crash 49 (edge 55), ride 51 (edge 59, bell 53).
- Unknown notes still register: the UI shows "Last hit: note N · unmapped", so it's easy to find and fix
  a wrong mapping.
- The kit connection is chosen automatically by matching the port name against `/nitro|alesis/i`, with
  a dropdown to override it. Hot-plugging is handled.

## Consequences

- **Open item:** check the numbers against the real kit by hitting each zone and reading the
  "Last hit" line.
- A user-editable mapping (MIDI learn) would be a natural addition once other kits matter.
- Hi-hat pedal position (CC 4) is parsed but not yet used. It could drive an open or closed hi-hat
  visual later.
