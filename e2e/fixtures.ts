/**
 * What every browser test shares: a simulated drummer, a check that the page
 * logged no errors (a Content-Security-Policy violation is one), and small
 * helpers for the app's controls.
 */
import { test as base, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    /** The keys the simulated drummer presses on each click, or null when it isn't playing. */
    drummerHits?: Hit[] | null;
    /** Set when the drummer keeps playing where a click is left out (a quiet bar): how many ms off the beat (negative: early). */
    drummerKeepTimeMs?: number | null;
  }
}

/** One pad the drummer hits on each click: its keyboard key, and how many ms after the click (0: right on it). */
export interface Hit {
  code: string;
  lateMs: number;
}

export interface Drummer {
  /**
   * Hits a pad on every click the drummer hears from now on: the click's
   * scheduled time plus the audio output's delay, as a real drummer would.
   * `code` is the keyboard key of the pad (the app's keyboard fallback), or
   * several pads, each with its own lateness, to hit them together or apart.
   * With `keepTime`, it also keeps playing at the same beat where a click is
   * left out (a quiet bar), `keepTime.lateMs` off the beat (negative: early,
   * no earlier than -60 ms).
   */
  play(code: string | Hit[], keepTime?: { lateMs: number }): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Runs in the page before the app: wraps OscillatorNode.start, which every
 * click goes through (metronome, count-in and a song's click alike), and
 * presses the drummer's keys at the moment that click will be heard. Beat and
 * downbeat clicks only (1500 and 2000 Hz), not subdivisions.
 */
function hookClicks() {
  window.drummerHits = null;
  window.drummerKeepTimeMs = null;
  /** The last beat the drummer played (audio-clock seconds, as heard), and the gap between beats. */
  let lastBeat = 0;
  let beatSec = 0;
  /** Beats heard as clicks, recent ones only: a beat kept without a click is skipped if a click came for it. */
  const clicked: number[] = [];
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- the page runs this function's source alone: it can't reach outside it
  const press = (ctx: AudioContext, hits: Hit[], heard: number, offsetMs: number) => {
    for (const { code, lateMs } of hits) {
      setTimeout(
        () => {
          window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
          setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true })), 30);
        },
        Math.max(0, (heard - ctx.currentTime) * 1000 + lateMs + offsetMs),
      );
    }
  };
  /**
   * Keeps the beat going at `beat` (audio seconds) if no click comes for it.
   * Checked 60 ms before the beat: the metronome schedules clicks about 100 ms
   * ahead, so a click for it would be known by then. At most 8 beats in a row.
   */
  const keepTime = (ctx: AudioContext, beat: number, left: number) => {
    const offsetMs = window.drummerKeepTimeMs;
    if (offsetMs === null || offsetMs === undefined || left === 0) return;
    setTimeout(
      () => {
        const hits = window.drummerHits;
        if (!hits || clicked.some((t) => Math.abs(t - beat) < beatSec / 4)) return;
        lastBeat = beat;
        press(ctx, hits, beat, offsetMs);
        keepTime(ctx, beat + beatSec, left - 1);
      },
      Math.max(0, (beat - ctx.currentTime) * 1000 - 60),
    );
  };
  // oxlint-disable-next-line typescript/unbound-method -- wrapped below, and always called with the node as `this`
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
    const hits = window.drummerHits;
    const ctx = this.context;
    if (hits && when && this.frequency.value >= 1500 && ctx instanceof AudioContext) {
      const heard = when + (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      if (lastBeat > 0 && heard > lastBeat) beatSec = heard - lastBeat;
      lastBeat = heard;
      clicked.push(heard);
      if (clicked.length > 16) clicked.shift();
      press(ctx, hits, heard, 0);
      if (beatSec > 0) keepTime(ctx, heard + beatSec, 8);
    }
    start.call(this, when);
  };
}

// Each fixture hands its value to the test with `provide` (Playwright's `use`, renamed so the React hooks lint rule
// doesn't take it for React's use()).
export const test = base.extend<{ drummer: Drummer; clickHook: void; noPageErrors: void }>({
  // Before any page loads (a beforeEach may navigate before a test asks for the drummer).
  clickHook: [
    async ({ page }, provide) => {
      await page.addInitScript(hookClicks);
      await provide();
    },
    { auto: true },
  ],
  drummer: async ({ page }, provide) => {
    await provide({
      play: async (code, keepTime) => {
        const hits = typeof code === "string" ? [{ code, lateMs: 0 }] : code;
        await page.evaluate(
          ([h, k]) => {
            window.drummerHits = h;
            window.drummerKeepTimeMs = k;
          },
          [hits, keepTime?.lateMs ?? null] as const,
        );
      },
      stop: async () => {
        await page.evaluate(() => {
          window.drummerHits = null;
          window.drummerKeepTimeMs = null;
        });
      },
    });
  },
  // Every test fails if the page logged an error or threw, CSP violations included.
  noPageErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        // Signed out with no server: the app's own /api calls answer 404, which the browser logs.
        if (m.type() === "error" && !/status of 404/.test(m.text())) errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await provide();
      expect(errors, "errors logged by the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens the exercise library on one of its tabs. */
export async function openLibrary(page: Page, tab: string): Promise<void> {
  await page.getByRole("button", { name: "Choose an exercise" }).click();
  await page.getByRole("tab", { name: tab }).click();
}

/** Chooses an exercise from the library (its "Practice this" button). */
export async function chooseExercise(page: Page, tab: string, name: string): Promise<void> {
  await openLibrary(page, tab);
  await page.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Practice this" }).click();
}

/** The number in a percentage like "93%". */
export async function percentOf(text: Promise<string | null>): Promise<number> {
  const match = /(\d+)%/.exec((await text) ?? "");
  if (!match) throw new Error(`no percentage in "${await text}"`);
  return Number(match[1]);
}
