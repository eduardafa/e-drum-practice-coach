/**
 * Finds a song's beats off the main thread, so the page stays responsive
 * during the second or so a song takes. A dedicated worker: only the page that
 * created it can message it; messages are still validated.
 */
import { findBeats } from "./beats";
import { parseBeatsRequest, type BeatsReply } from "./beatsMessages";

const reply = (message: BeatsReply) => self.postMessage(message);
const TRUSTED_ORIGINS = new Set(
  [
    self.location.origin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].map((origin) => origin.toLowerCase()),
);

self.addEventListener("message", (e: MessageEvent<unknown>) => {
  const origin = (e.origin || "").toLowerCase();
  if (!TRUSTED_ORIGINS.has(origin)) {
    reply({ kind: "error", message: "Untrusted origin" });
    return;
  }

  const request = parseBeatsRequest(e.data);
  if (!request) {
    reply({ kind: "error", message: "Bad request" });
    return;
  }
  try {
    let last = -1;
    const grid = findBeats(request.samples, request.sampleRate, (done) => {
      const pct = Math.floor(done * 100);
      if (pct !== last) {
        last = pct;
        reply({ kind: "progress", done });
      }
    });
    reply({ kind: "done", grid });
  } catch (error) {
    reply({ kind: "error", message: String(error) });
  }
});
