/**
 * Finds a song's beats off the main thread, so the page stays responsive
 * during the second or so a song takes. A dedicated worker: only the page that
 * created it can message it; messages are still validated.
 */
import { findBeats } from "./beats";
import { parseBeatsRequest, type BeatsReply } from "./beatsMessages";

const reply = (message: BeatsReply) => self.postMessage(message);

self.addEventListener("message", (e: MessageEvent<unknown>) => {
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
