import { useCallback, useEffect, useState } from "react";
import type { HistoryRecord } from "./record";
import { SignedOutError, localLedger, syncOnce, type Ledger, type SyncStore } from "./sync";

export type SyncStatus =
  | { state: "off" }
  | { state: "syncing" }
  | { state: "synced"; at: Date }
  | { state: "offline" }
  | { state: "error" };

/** After a failed sync, try again this much later (or as soon as the browser is back online). */
const RETRY_MS = 60_000;

interface Handlers {
  onPulled: (records: HistoryRecord[]) => void;
  onSignedOut: () => void;
}

/**
 * When to sync, outside React: when signed in and history has loaded, when
 * asked (after each saved session), when the browser comes back online, and
 * when the drummer returns to the tab. One sync at a time; a request during
 * one runs it once more. Failures retry a minute later.
 */
export class SyncLoop {
  private userId: string | null = null;
  private ready = false;
  private running = false;
  private again = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private handlers: Handlers = { onPulled: () => {}, onSignedOut: () => {} };

  constructor(
    private readonly store: SyncStore,
    private readonly ledger: Ledger,
    private readonly onStatus: (status: SyncStatus) => void,
  ) {}

  /** What to do with pulled records and a lost session (the latest callbacks). */
  setHandlers(handlers: Handlers): void {
    this.handlers = handlers;
  }

  private readonly onOnline = () => this.request();
  private readonly onVisible = () => {
    if (document.visibilityState === "visible") this.request();
  };

  start(): void {
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  stop(): void {
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.clearRetry();
  }

  /** Who is signed in (null when no one) and whether local history has loaded. */
  configure(userId: string | null, ready: boolean): void {
    const changed = userId !== this.userId || ready !== this.ready;
    this.userId = userId;
    this.ready = ready;
    if (!userId) {
      this.clearRetry();
      this.onStatus({ state: "off" });
    } else if (changed) this.request();
  }

  request(): void {
    void this.run();
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private async run(): Promise<void> {
    const userId = this.userId;
    if (!userId || !this.ready) return;
    if (this.running) {
      this.again = true; // something new arrived mid-sync: go round once more
      return;
    }
    this.running = true;
    this.clearRetry();
    this.onStatus({ state: "syncing" });
    try {
      do {
        this.again = false;
        // oxlint-disable-next-line no-await-in-loop -- one sync at a time, repeated if asked meanwhile
        const { pulled } = await syncOnce(userId, this.store, this.ledger);
        if (pulled.length > 0) this.handlers.onPulled(pulled);
      } while (this.again && this.userId === userId);
      this.onStatus({ state: "synced", at: new Date() });
    } catch (error) {
      if (error instanceof SignedOutError) {
        this.onStatus({ state: "off" });
        this.handlers.onSignedOut();
      } else {
        console.warn("Sync failed, will retry:", error);
        this.onStatus({ state: navigator.onLine ? "error" : "offline" });
        this.retryTimer = setTimeout(() => this.request(), RETRY_MS);
      }
    } finally {
      this.running = false;
    }
  }
}

const OFF: SyncStatus = { state: "off" };

/** Syncs practice history while signed in; practice never waits on it. */
export function useSync(
  userId: string | null,
  store: SyncStore,
  ready: boolean,
  onPulled: (records: HistoryRecord[]) => void,
  onSignedOut: () => void,
) {
  const [status, setStatus] = useState<SyncStatus>(OFF);
  // The loop outlives renders; it's handed the current callbacks after each one.
  const [loop] = useState(() => new SyncLoop(store, localLedger(), setStatus));
  useEffect(() => loop.setHandlers({ onPulled, onSignedOut }));

  useEffect(() => {
    loop.start();
    return () => loop.stop();
  }, [loop]);
  useEffect(() => loop.configure(userId, ready), [loop, userId, ready]);

  const syncNow = useCallback(() => loop.request(), [loop]);
  return { status: userId ? status : OFF, syncNow };
}
