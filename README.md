# E-drum Practice Coach

[![CI](https://github.com/eduardafa/e-drum-practice-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/eduardafa/e-drum-practice-coach/actions/workflows/ci.yml)

A web app you plug your electronic drum kit into that scores your practice. It reads every hit from an
**Alesis Nitro Max** over the **Web MIDI API**, lights it up on a drawing of the kit, runs a
sample-accurate metronome, and tells you how early or late each hit was, in milliseconds.

## v1 features

- Connect to the kit over USB with Web MIDI. The kit is selected automatically, and hot-plugging works.
- Live kit view on Canvas 2D at 60fps. Pads flash by how hard they were hit and are coloured by
  timing: early is blue, on time is green, late is orange.
- Lookahead metronome on Web Audio, with tempo, beats per bar, subdivisions and an accented downbeat.
- A "How to play with the metronome" guide for new drummers: counting "1 & 2 &", and four steps to the money
  beat, each with a one-tap metronome setup and a live count that lights up in time with the clicks.
- Per-hit timing in ms, a per-pad timing strip over the last 5 s, and session stats.
- A side panel with only what you need while playing, so it fits without scrolling: Start/Stop (<kbd>M</kbd>),
  the live count, tempo − / + buttons (hold Shift for 5 BPM steps), and on-time %, average and consistency.
  Set-once metronome and scoring settings open in a Settings panel over the kit view; <kbd>Esc</kbd> closes it.
- Skill levels (First steps, Beginner, Intermediate, Advanced) with on-time windows of ±70, ±35, ±20 and ±10 ms,
  and a suggestion when your playing fits another level better. The window and latency offset stay adjustable.
- Latency calibration: play along to the click and the app measures your setup's delay and sets the
  offset. It adapts to your skill level (Beginner, Intermediate, Advanced) and keeps listening until the
  measurement is precise, so steadier playing finishes sooner.
- Drum notation: pick a groove or rudiment from the starter library and it appears as standard drum notation
  above the kit view, with a playhead that follows the metronome. Picking one also sets the metronome to fit
  it. The notation is engraved with [VexFlow](https://www.vexflow.com/), loaded only when an exercise is
  picked.
- Play along: start a session from the notation strip (2 to 16 loops, after a one-bar count-in). Each note is
  ringed with its result as you play, and a results screen shows your accuracy, notes on time, early, late and
  missed, extra hits, timing, consistency and a per-pad breakdown, with retry and 5 BPM slower/faster.
  Accuracy is partial credit by default (full credit inside the on-time window, less the further off a hit is)
  or strict (only on-time notes count), chosen in Settings; extra hits count against both.
- Keyboard fallback for trying the app without a kit.

## Running it

Requires Node 26 (see `.nvmrc`), pnpm 12 (pinned in `packageManager`) and Chrome or Edge.

```sh
pnpm install
pnpm dev           # http://localhost:5173
pnpm test          # unit tests
pnpm lint          # oxlint, including type-aware rules
pnpm typecheck     # tsc (TypeScript 7)
pnpm build         # type-check + production build
```

Plug the kit in over USB, click **Connect kit**, allow MIDI access, then press **M** to start the
metronome. Before your first session, click **Calibrate latency** and hit any pad on each click, so
the scores account for your setup's delay.

Without a kit: <kbd>Space</kbd> kick, <kbd>S</kbd> snare, <kbd>A</kbd> hi-hat, <kbd>Z</kbd> hi-hat pedal,
<kbd>Q</kbd> crash, <kbd>W</kbd>/<kbd>E</kbd>/<kbd>D</kbd> toms, <kbd>R</kbd> ride.

## Deployment

The app is static and runs on Cloudflare Workers (static assets only, no server code). CI deploys it:

- **Merge to `main`**: deploys to production, after lint, type-check, tests and build pass.
- **Pull request**: uploads a preview version and comments its URL on the PR.

The deploy uses the exact build the checks produced. Config lives in `wrangler.jsonc`, and response headers
(Content Security Policy, a Permissions-Policy that allows MIDI only for this site, caching) live in
`public/_headers`. The deploy job reads the `CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID`
variable from the `production` and `preview` GitHub environments, so the checks job never has access to the
token. Only `main` can
deploy to `production`. The job is skipped while the secrets aren't set.

## CI security

GitHub Actions are pinned to full commit SHAs, with the version as a comment (`@<sha> # v7.0.1`), and CI fails
if one isn't. To pin a new action, run [pinact](https://github.com/suzuki-shunsuke/pinact):

```sh
pinact run          # pins every action in .github/workflows
```

Dependabot opens a weekly PR that updates the pins.

Workflow files are linted with [actionlint](https://github.com/rhysd/actionlint), which runs
[shellcheck](https://github.com/koalaman/shellcheck) on every `run:` script when it is installed. To run it
locally:

```sh
actionlint          # checks .github/workflows
```

[zizmor](https://github.com/zizmorcore/zizmor) audits the workflows for security problems, such as leaked
credentials, script injection, or a pinned SHA that only exists in a fork:

```sh
GH_TOKEN=$(gh auth token) zizmor .github/
```

## Security scanning

The `Security` workflow runs [Trivy](https://github.com/aquasecurity/trivy) on every pull request, on pushes to
`main` and weekly. It fails on HIGH or CRITICAL vulnerabilities that have a fix, and on any committed secret.
The full report, including lower severities and config checks, goes to the repository's Security tab.

To ignore a finding, add it to `.trivyignore.yaml` with a reason and an expiry date (at most 90 days).

The `CodeQL` workflow analyses the TypeScript code and the workflow files themselves, with the
`security-extended` queries, on every pull request, on pushes to `main` and weekly. A pull request can't merge
if it adds a high or critical CodeQL security alert.

## Supply chain

- pnpm doesn't install a package version until it has been public for 3 days (`minimumReleaseAge` in
  `pnpm-workspace.yaml`), and dependency build scripts are blocked unless explicitly allowed.
- Dependabot opens weekly update PRs for npm packages and GitHub Actions, and security-fix PRs when a
  vulnerability is disclosed.
- Secret scanning with push protection blocks commits that contain credentials.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## How timing works

MIDI timestamps and the audio clock are separate clocks. Clicks are scheduled ahead of time on the audio
clock, converted to `performance.now()` time (including output latency) as they are scheduled, and
stored as a timing grid. Each MIDI hit is then compared with the nearest grid point.

## Code layout

```
src/
  midi/     Web MIDI connection and MIDI byte parsing
  audio/    metronome scheduler, worker timer, audio-to-performance clock mapping
  timing/   timing grid and hit scoring
  kit/      Nitro Max note map and pad layout
  exercises/ exercise format (48 ticks per quarter), drum-tab builder, validator, starter library
  playalong/ expected-note timeline, hit matching, sessions and accuracy scoring
  live/     Coach (wiring) and LiveState (shared per-hit state)
  guide/    the metronome guide's steps, as data
  notation/ rhythm spelling, VexFlow engraving (loaded on demand) and the playhead mapping
  render/   Canvas 2D kit renderer
```

## Roadmap

- **v1** (this): live kit view, metronome, hit timing
- **v2**: groove and rudiment library as scrolling notation, accuracy score, "slow down until 95%" mode
- **v3**: practice history, streaks, timing stats over time, pad heatmaps
