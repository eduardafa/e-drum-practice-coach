/**
 * Practice history in IndexedDB, on this device only.
 *
 * IndexedDB rather than localStorage: history grows without a fixed bound
 * (localStorage is a few MB of strings, read and written whole), and
 * IndexedDB stores structured records and writes them one at a time without
 * blocking the page. Every operation may fail (private windows, storage
 * blocked or full): callers treat failure as "history is off", never as a
 * reason to interrupt practice.
 */
import { parseRecord, type HistoryRecord } from "./record";

const DB_NAME = "edrum-coach";
const DB_VERSION = 1;
const STORE = "records";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => reject(req.error ?? new Error("IndexedDB request failed")));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", () => resolve());
    tx.addEventListener("error", () => reject(tx.error ?? new Error("IndexedDB transaction failed")));
    tx.addEventListener("abort", () => reject(tx.error ?? new Error("IndexedDB transaction aborted")));
  });
}

export class HistoryStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.addEventListener("upgradeneeded", () => {
        const store = req.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("start", "start");
      });
      req.addEventListener("success", () => resolve(req.result));
      req.addEventListener("error", () => reject(req.error ?? new Error("IndexedDB open failed")));
      req.addEventListener("blocked", () => reject(new Error("IndexedDB open blocked")));
    }).catch((error: unknown) => {
      // Let a later call try again (the drummer may unblock storage).
      this.db = null;
      throw error;
    });
    return this.db;
  }

  /** Every readable record, newest first. Records this build can't read are skipped. */
  async all(): Promise<HistoryRecord[]> {
    const db = await this.open();
    const raw = await request(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    return raw
      .map(parseRecord)
      .filter((r): r is HistoryRecord => r !== null)
      .toSorted((a, b) => Temporal.Instant.compare(Temporal.Instant.from(b.start), Temporal.Instant.from(a.start)));
  }

  async add(record: HistoryRecord): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    await done(tx);
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await done(tx);
  }
}
