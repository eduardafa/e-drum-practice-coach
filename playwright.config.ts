/**
 * Browser tests (EDU-131): the production build, served with the site's real
 * headers, driven in Google Chrome by a simulated drummer. Build first
 * (`pnpm build`), then `pnpm test:e2e`.
 */
import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  // Sessions take real time (they play to the click), so tests run side by side.
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  forbidOnly: !!process.env.CI,
  // Timing tests on a shared CI machine can be unlucky once; twice is a real failure.
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The Chrome already installed (GitHub's runners have it), not a downloaded one: Web MIDI and Web Audio as users get them.
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    // Muted: the tests play clicks and songs. Audio starts without a click on the page.
    launchOptions: { args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `node e2e/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
