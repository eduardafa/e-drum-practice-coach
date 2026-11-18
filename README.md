# E-drum Practice Coach

[![CI](https://github.com/eduardafa/e-drum-practice-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/eduardafa/e-drum-practice-coach/actions/workflows/ci.yml)

A web app you plug your electronic drum kit into that scores your practice. It reads every hit from an
**Alesis Nitro Max** over the **Web MIDI API**, lights it up on a drawing of the kit, runs a
sample-accurate metronome, and tells you how early or late each hit was, in milliseconds.

## v1 features

- Connect to the kit over USB with Web MIDI. The kit is selected automatically, and hot-plugging works.
- Live kit view on Canvas 2D at 60fps. Pads flash by how hard they were hit and are colored by
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
- Step 0, "Meet your kit", before First steps: each pad lights up on the kit view in turn with its name, what it's
  for and which limb plays it, and how it's written on the staff, and you hit it (pads your kit doesn't have can be
  skipped). Then a six-question quiz: the app names a drum without lighting it, and a wrong hit lights it as a hint. No
  click and no timing, and nothing is saved to History; it counts as done once finished on this device, or once any
  part 1 step has been played. Start it from the prompt beside the kit view or the library's First steps tab.
- First steps, in three parts, for someone who has never played: part 1 builds the Money beat one limb at a time,
  part 2 moves the kick and the right hand and adds a first fill, and part 3 is about how a beat is played: loud and
  soft on the hi-hat, a ghost note, a fill on the toms into a crash, and the open hi-hat, leading to the open hi-hat
  groove. After a session, the results screen offers the next step once you reach 90%, and History shows each part's
  progress.
- Exercise library: browse the grooves and rudiments, each with its time signature, tempo range and a drum-tab
  preview (with the sticking for rudiments). Listen plays one loop with synthesized drum sounds and a click on
  every beat. Choosing an exercise sets the metronome to fit it, at your last tempo for that exercise or its
  suggested tempo. It works with the keyboard: <kbd>Tab</kbd> and <kbd>Enter</kbd>, <kbd>Esc</kbd> to close.
- Fills: six exercises in their own library tab, each a bar of the Money beat and then a bar of fill, so they
  practice going into the fill and coming back on beat 1: quarter and eighth notes on the snare, down the toms,
  sixteenth notes on beat 4 and around the kit, and a fill that ends with a crash on 1. The fill bar shows its sticking.
- Drum notation: the chosen exercise appears as standard drum notation above the kit view, with a playhead
  that follows the metronome. The notation is engraved with [VexFlow](https://www.vexflow.com/), loaded only
  when an exercise is chosen.
- Play along: start a session from the notation strip (2 to 16 loops, after a one-bar count-in). Each note is
  ringed with its result as you play, and a results screen shows your accuracy, notes on time, early, late and
  missed, extra hits, timing, consistency and a per-pad breakdown, with retry and 5 BPM slower/faster.
  Accuracy is partial credit by default (full credit inside the on-time window, less the further off a hit is)
  or strict (only on-time notes count), chosen in Settings; extra hits count against both.
- What to work on: when the same note went wrong the same way in at least half the loops (late, early or missed), and
  clearly more often than the rest of the pattern, the results screen and the session opened from History name it
  ("The snare on beat 3 was late 6 of 8 times."), give one tip, and ring it on a small copy of the notation. The same drum
  with the same problem is named together ("the kick on beats 1 and 3"). When the whole session drifted, or nothing
  stands out, it says nothing.
- Tempo trainer: practice an exercise in rounds that speed up as you play cleanly. After each round the tempo
  goes up a step (default 4 BPM) at 90% or more, down a step below 70%, and otherwise stays, until you pass a
  round at your target tempo. A short pause and a count-in at the new tempo separate the rounds, and a chart
  shows each round's tempo and accuracy.
- Practice history, on its own page at `/history`: every finished session and tempo-trainer run is saved in your
  browser (IndexedDB) and listed by day, with your streak (days in a row with practice), today's practice time and your longest streak. Signed out, nothing
  leaves the device.
- Light and dark themes: follows the device's setting, or choose System, Light or Dark in Settings.
- Sign in with GitHub or Google from the account button in the top bar, and history syncs across devices
  automatically: each finished session uploads right away, and other devices' sessions arrive when the app opens
  or you return to it. Offline, it catches up later. The server keeps the provider's account number, your name
  and profile picture link, and your practice records, never your email. The account menu can delete the
  account and everything synced to it, and clearing history can also delete the synced copy. What's stored and
  how to delete it is on the privacy page (`public/privacy.html`, served at `/privacy`).
- Coach's notes (allow-listed accounts): on the History page, an AI model writes a few beginner-friendly tips. Pick the
  provider (Claude or OpenAI) and model on the card, each with a rough cost per tip; the cheapest is the default. It writes
  from a summary of the last 30 days' numbers, never raw hits or account details. Limited to 5 a day per account
  and a $5 monthly budget, and the same stats on the same day reuse the stored tips. The owner gets an email (via
  Resend) when the month's AI spend passes $1 and again at $4.
- Progress charts: for each exercise, accuracy and fastest tempo per day (or per week over longer spans) for the
  last 7 days, 30 days or all time, with a one-line summary such as "Money beat: 72% → 88% over 2 weeks,
  70 → 84 BPM" and a table view.
- Timing by hand, foot and pad over the same range: each one's average lean (early or late) and how much it
  varies, with the biggest tendency spelled out and a practice tip, e.g. "Your left hand drags: it's 12 ms late
  on average. Try slow single strokes". Rudiments use their sticking; grooves assume a right-handed setup.
- Loud and soft: after a session on an exercise with accents or ghost notes, the results screen (and the session
  opened from History) counts how many accents were clearly louder and ghost notes clearly softer than your own
  normal notes in that session, with one tip. It's reported next to the timing score, never mixed into it.
  "Accents on 1 and 3" in the rudiments practices it.
- Hits that should land together: when two drums written on the same beat (like the hi-hat and kick on 1) keep landing
  apart, the results screen and the session opened from History say which one comes late and by about how much, with a
  tip. It needs at least 4 pairs, a median gap of 20 ms or more, and 3 in 4 gaps leaning the same way; otherwise it says
  nothing. Like loud and soft, it doesn't change the score.
- Pad heatmap: the kit drawn from above with each pad colored by how often or how hard it was hit, for a range
  of history or the session just played, with a legend, a table, and a note on whether accents and ghost notes
  sound different enough.
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
pnpm test:e2e      # browser tests, on the build (run pnpm build first)
```

The browser tests (`e2e/`, Playwright) open the production build in Google Chrome, served with the site's real
headers, and a simulated drummer plays along: it presses the keyboard's drum keys when each click is heard. They
cover a scored session and its results, the tempo trainer, playing along to a song, looping a section, and MIDI and
Guitar Pro tabs. The song and tab files are generated in code. Chrome is muted. A test fails if the page logs any
error, including a Content-Security-Policy violation. CI runs them after the checks, on the same build, and a failed
run keeps its screenshots and traces as the `playwright-report` artifact.

To run the API locally as well, in Cloudflare's runtime:

```sh
pnpm build
pnpm exec wrangler d1 migrations apply DB --local
pnpm exec wrangler dev --var APP_ORIGIN:http://localhost:8787   # http://localhost:8787
```

After changing bindings or vars in `wrangler.jsonc`, run `pnpm types:worker` to regenerate the Worker types.

Sign-in needs OAuth credentials. The client IDs are in `wrangler.jsonc`; the secrets are Worker secrets
(`wrangler secret put GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`). Locally, put test values in a
git-ignored `.dev.vars` file and pass the IDs and origin with `--var`. GitHub and Google only redirect to
the registered production address, so a full sign-in can only be completed there.

Plug the kit in over USB, click **Connect kit**, allow MIDI access, then press **M** to start the
metronome. Before your first session, click **Calibrate latency** and hit any pad on each click, so
the scores account for your setup's delay.

Without a kit: <kbd>Space</kbd> kick, <kbd>S</kbd> snare, <kbd>A</kbd> hi-hat, <kbd>Z</kbd> hi-hat pedal,
<kbd>Q</kbd> crash, <kbd>W</kbd>/<kbd>E</kbd>/<kbd>D</kbd> toms, <kbd>R</kbd> ride.

## Deployment

The app runs on Cloudflare Workers. Cloudflare serves the built app straight from `dist/`; only `/api/*`
runs Worker code (`worker/`): sign-in with GitHub or Google, and synced practice history in a D1
database. CI deploys it:

- **Merge to `main`**: applies new database migrations (`migrations/`), then deploys to production, after
  lint, type-check, tests and build pass.
- **Pull request**: uploads a preview version and comments its URL on the PR. Previews share the
  production database, so their API answers 503 and they never run migrations.

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
  audio/    metronome scheduler, worker timer, clock mapping, synthesized click and drum voices, previews
  timing/   timing grid and hit scoring
  kit/      Nitro Max note map and pad layout
  exercises/ exercise format (48 ticks per quarter), drum-tab builder, validator, starter library, preview timing
  playalong/ expected-note timeline, hit matching, sessions and accuracy scoring
  live/     Coach (wiring) and LiveState (shared per-hit state)
  history/  practice history records (Temporal dates), streaks, progress by day and week, timing per limb and pad, pad heatmap, IndexedDB store
  guide/    the metronome guide's steps, as data
  notation/ rhythm spelling, VexFlow engraving (loaded on demand) and the playhead mapping
  render/   Canvas 2D kit renderer
worker/     the API Worker (only /api/*), its generated types, and a D1 stand-in for tests
migrations/ D1 schema, as numbered SQL files
```

## Roadmap

- **v1** (this): live kit view, metronome, hit timing
- **v2**: groove and rudiment library as scrolling notation, accuracy score, "slow down until 95%" mode
- **v3**: practice history, streaks, timing stats over time, pad heatmaps
