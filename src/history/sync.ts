/**
 * Keeps this browser's practice history and the account's copy on the
 * server in step. Records never change once saved, so syncing is two
 * one-way steps, each safe to repeat:
 *
 * 1. Pull: ask the server for records that arrived since the last pull (by
 *    its sequence number) and store any this browser doesn't have.
 * 2. Push: upload the records this browser has never synced. The server
 *    ignores ones it already has.
 *
 * A small ledger in localStorage remembers, per account, how far the pull
 * has got, and for every record which account it was synced with. A record
 * already synced with one account is never uploaded to another one that
 * signs in later on the same browser.
 */
import { parseRecord, type HistoryRecord } from "./record";

/** Records per upload: well under the server's 100 and 1 MB limits. */
export const PUSH_BATCH = 50;
/** A runaway guard: at 200 records a page, this is 10,000 records per sync. */
const MAX_PULL_PAGES = 50;

export interface SyncStore {
  all(): Promise<HistoryRecord[]>;
  putMany(records: readonly HistoryRecord[]): Promise<void>;
}

export interface Ledger {
  /** The server sequence number this account has pulled up to. */
  cursor(userId: string): number;
  setCursor(userId: string, seq: number): void;
  /** The account a record was synced with, if any. */
  owner(recordId: string): string | undefined;
  claim(recordIds: readonly string[], userId: string): void;
}

/** The server said the session is gone: the drummer needs to sign in again. */
export class SignedOutError extends Error {}

export interface SyncResult {
  /** Records from other devices, now stored here. */
  pulled: HistoryRecord[];
  /** Records uploaded from this browser. */
  pushed: number;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function call(fetcher: Fetch, input: string, init?: RequestInit): Promise<Response> {
  const res = await fetcher(input, { credentials: "same-origin", ...init });
  if (res.status === 401) throw new SignedOutError("Signed out");
  if (!res.ok) throw new Error(`Sync request failed: ${res.status}`);
  return res;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/** One full sync for the signed-in account. Throws on network or server errors; safe to retry. */
export async function syncOnce(userId: string, store: SyncStore, ledger: Ledger, fetcher: Fetch = fetch): Promise<SyncResult> {
  // 1. Pull what arrived since last time. Records this browser already has
  // (its own uploads come back once, since the cursor trails them) are skipped.
  const local = new Set((await store.all()).map((r) => r.id));
  const pulled: HistoryRecord[] = [];
  let cursor = ledger.cursor(userId);
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    // oxlint-disable-next-line no-await-in-loop -- each page starts where the last one ended
    const res = await call(fetcher, `/api/records?after=${cursor}`);
    // oxlint-disable-next-line no-await-in-loop
    const body: unknown = await res.json();
    if (!isObject(body) || !Array.isArray(body.records) || typeof body.next !== "number") throw new Error("Unexpected sync reply");
    const records = body.records.map(parseRecord).filter((r): r is HistoryRecord => r !== null && !local.has(r.id));
    // oxlint-disable-next-line no-await-in-loop
    await store.putMany(records);
    ledger.claim(
      records.map((r) => r.id),
      userId,
    );
    pulled.push(...records);
    cursor = body.next;
    ledger.setCursor(userId, cursor);
    if (body.more !== true) break;
  }

  // 2. Push what this browser has never synced.
  const pending = (await store.all()).filter((r) => ledger.owner(r.id) === undefined);
  for (let i = 0; i < pending.length; i += PUSH_BATCH) {
    const batch = pending.slice(i, i + PUSH_BATCH);
    // oxlint-disable-next-line no-await-in-loop -- in order, so a failure leaves the rest for the next try
    await call(fetcher, "/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch }),
    });
    // Stored, already known, or refused as malformed: either way, don't send again.
    ledger.claim(
      batch.map((r) => r.id),
      userId,
    );
  }
  return { pulled, pushed: pending.length };
}

/** The ledger, kept in localStorage. If storage is blocked it lasts until the page closes. */
export function localLedger(key = "edrum-coach:sync:v1"): Ledger {
  let state: { cursors: Record<string, number>; owners: Record<string, string> } = { cursors: {}, owners: {} };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (isObject(raw) && isObject(raw.cursors) && isObject(raw.owners)) {
      const cursors: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw.cursors)) if (typeof v === "number") cursors[k] = v;
      const owners: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw.owners)) if (typeof v === "string") owners[k] = v;
      state = { cursors, owners };
    }
  } catch {
    // Unreadable or blocked: start fresh. The server ignores records it already has.
  }
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage blocked or full: the next sync just repeats some work.
    }
  };
  return {
    cursor: (userId) => state.cursors[userId] ?? 0,
    setCursor: (userId, seq) => {
      state.cursors[userId] = seq;
      save();
    },
    owner: (recordId) => state.owners[recordId],
    claim: (recordIds, userId) => {
      if (recordIds.length === 0) return;
      for (const id of recordIds) state.owners[id] ??= userId;
      save();
    },
  };
}
