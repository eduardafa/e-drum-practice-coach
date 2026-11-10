/**
 * Fires a steady "tick" message so the metronome scheduler keeps running
 * when the main thread is busy or the tab is in the background (timers in
 * workers aren't throttled as hard as main-thread timers).
 */
let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<{ cmd: "start"; intervalMs: number } | { cmd: "stop" }>) => {
  if (timer !== null) clearInterval(timer);
  timer = null;
  if (e.data.cmd === "start") {
    timer = setInterval(() => self.postMessage("tick"), e.data.intervalMs);
  }
};
