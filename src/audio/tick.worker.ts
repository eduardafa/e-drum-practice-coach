/**
 * Fires a steady "tick" message so the metronome scheduler keeps running
 * when the main thread is busy or the tab is in the background (timers in
 * workers aren't throttled as hard as main-thread timers).
 *
 * This is a dedicated worker: only the page that created it can send it
 * messages, so there's no origin to check (worker messages carry an empty
 * origin). Messages are still validated, since their shape isn't guaranteed
 * at runtime.
 */
import { parseTickCommand } from "./tickCommand";

let timer: ReturnType<typeof setInterval> | null = null;

self.addEventListener("message", (e: MessageEvent<unknown>) => {
  const command = parseTickCommand(e.data);
  if (!command) return;
  if (timer !== null) clearInterval(timer);
  timer = null;
  if (command.cmd === "start") {
    timer = setInterval(() => self.postMessage("tick"), command.intervalMs);
  }
});
