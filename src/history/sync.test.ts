import { describe, expect, it } from "vitest";
import { parseRecord, type HistoryRecord } from "./record";
import { PUSH_BATCH, SignedOutError, StorageFullError, syncOnce, type Ledger, type SyncStore } from "./sync";

/** A server whose only record is from a future version of the app. */
const futureServer = () => Promise.resolve(Response.json({ records: [{ v: 99, id: "future" }], next: 1, more: false }));

/** A complete session record, valid for parseRecord. */
function rec(id: string, day = 11): HistoryRecord {
  const r = parseRecord({
    v: 1,
    id,
    kind: "session",
    start: `2026-11-${day}T18:00:00Z`,
    duration: "PT1M",
    timeZone: "Europe/Lisbon",
    exerciseId: "x",
    exerciseName: "X",
    bpm: 80,
    loops: 1,
    toleranceMs: 35,
    latencyOffsetMs: 0,
    accuracy: { partial: 0.9, strict: 0.8 },
    counts: { notes: 1, onTime: 1, early: 0, late: 0, missed: 0, extra: 0 },
    meanDeltaMs: 2,
    spreadMs: null,
    voices: [{ pad: "snare", dynamic: "normal", hand: null }],
    notes: [[0, 0, 2, 90]],
    extras: [],
    trainerRunId: null,
  });
  if (!r) throw new Error("fixture isn't a valid record");
  return r;
}

/** One browser's IndexedDB. */
function memoryStore(initial: HistoryRecord[] = []): SyncStore & { ids(): string[] } {
  const map = new Map(initial.map((r) => [r.id, r]));
  return {
    all: () => Promise.resolve([...map.values()]),
    putMany: (records) => {
      for (const r of records) map.set(r.id, r);
      return Promise.resolve();
    },
    ids: () => [...map.keys()].toSorted(),
  };
}

function memoryLedger(): Ledger {
  const cursors = new Map<string, number>();
  const owners = new Map<string, string>();
  return {
    cursor: (u) => cursors.get(u) ?? 0,
    setCursor: (u, n) => cursors.set(u, n),
    owner: (id) => owners.get(id),
    claim: (ids, u) => {
      for (const id of ids) if (!owners.has(id)) owners.set(id, u);
    },
    ownedBy: (u) => [...owners].filter(([, o]) => o === u).map(([id]) => id),
    forget: (u) => {
      cursors.delete(u);
      for (const [id, o] of owners) if (o === u) owners.delete(id);
    },
  };
}

/** The Worker's records API, in memory, for any number of accounts. */
function fakeServer({ pageSize = 200, failPushAfter = Infinity } = {}) {
  const rows: { seq: number; user: string; id: string; body: string }[] = [];
  let pushes = 0;
  const as = (user: string) => (input: string, init?: RequestInit) => {
    if (user === "") return Promise.resolve(new Response(null, { status: 401 }));
    const url = new URL(input, "https://app.example");
    if (init?.method === "POST") {
      if (++pushes > failPushAfter) return Promise.reject(new TypeError("Failed to fetch"));
      const parsed: { records: HistoryRecord[] } = JSON.parse(typeof init.body === "string" ? init.body : "{}");
      const { records } = parsed;
      for (const r of records) {
        if (!rows.some((x) => x.user === user && x.id === r.id)) rows.push({ seq: rows.length + 1, user, id: r.id, body: JSON.stringify(r) });
      }
      return Promise.resolve(Response.json({ stored: records.length, known: 0, rejected: [] }));
    }
    const after = Number(url.searchParams.get("after"));
    const mine = rows.filter((x) => x.user === user && x.seq > after);
    const page = mine.slice(0, pageSize);
    return Promise.resolve(
      Response.json({ records: page.map((x) => JSON.parse(x.body) as unknown), next: page.at(-1)?.seq ?? after, more: mine.length > pageSize }),
    );
  };
  return { as, rows };
}

describe("syncOnce", () => {
  it("uploads this browser's history, then brings it to another device", async () => {
    const server = fakeServer();
    const laptop = memoryStore([rec("a"), rec("b")]);
    const phone = memoryStore([rec("c")]);
    const [laptopLedger, phoneLedger] = [memoryLedger(), memoryLedger()];

    expect(await syncOnce("ana", laptop, laptopLedger, server.as("ana"))).toMatchObject({ pulled: [], pushed: 2 });
    const onPhone = await syncOnce("ana", phone, phoneLedger, server.as("ana"));
    expect(onPhone.pulled.map((r) => r.id)).toEqual(["a", "b"]);
    expect(onPhone.pushed).toBe(1);
    expect(phone.ids()).toEqual(["a", "b", "c"]);

    // Back on the laptop, the phone's record arrives; nothing is uploaded twice.
    const again = await syncOnce("ana", laptop, laptopLedger, server.as("ana"));
    expect(again.pulled.map((r) => r.id)).toEqual(["c"]);
    expect(again.pushed).toBe(0);
    expect(server.rows).toHaveLength(3);
  });

  it("repeats safely: a second sync with nothing new does nothing", async () => {
    const server = fakeServer();
    const store = memoryStore([rec("a")]);
    const ledger = memoryLedger();
    await syncOnce("ana", store, ledger, server.as("ana"));
    expect(await syncOnce("ana", store, ledger, server.as("ana"))).toEqual({ pulled: [], pushed: 0 });
  });

  it("never uploads one account's records to another account on the same browser", async () => {
    const server = fakeServer();
    const store = memoryStore([rec("ana-1")]);
    const ledger = memoryLedger();
    await syncOnce("ana", store, ledger, server.as("ana"));
    await store.putMany([rec("new-while-signed-out")]);
    await syncOnce("bea", store, ledger, server.as("bea"));
    expect(server.rows.filter((r) => r.user === "bea").map((r) => r.id)).toEqual(["new-while-signed-out"]);
  });

  it("pulls in pages", async () => {
    const server = fakeServer({ pageSize: 2 });
    await syncOnce("ana", memoryStore([rec("a"), rec("b"), rec("c"), rec("d"), rec("e")]), memoryLedger(), server.as("ana"));
    const other = memoryStore();
    const { pulled } = await syncOnce("ana", other, memoryLedger(), server.as("ana"));
    expect(pulled).toHaveLength(5);
  });

  it("leaves unsent records for the next try when the network drops mid-upload", async () => {
    const server = fakeServer({ failPushAfter: 1 });
    const local = Array.from({ length: PUSH_BATCH + 3 }, (_, i) => rec(`r${i}`));
    const ledger = memoryLedger();
    await expect(syncOnce("ana", memoryStore(local), ledger, server.as("ana"))).rejects.toThrow("Failed to fetch");
    expect(server.rows).toHaveLength(PUSH_BATCH);
    expect(local.filter((r) => ledger.owner(r.id) === undefined)).toHaveLength(3);
  });

  it("reports a lost session so the app can show signed out", async () => {
    const server = fakeServer();
    await expect(syncOnce("ana", memoryStore([rec("a")]), memoryLedger(), server.as(""))).rejects.toBeInstanceOf(SignedOutError);
  });

  it("skips records this build can't read", async () => {
    const store = memoryStore();
    const { pulled } = await syncOnce("ana", store, memoryLedger(), futureServer);
    expect(pulled).toEqual([]);
    expect(store.ids()).toEqual([]);
  });
});

const full = () => Promise.resolve(Response.json({ error: "storage-full", message: "full" }, { status: 413 }));

/** A server that has no new records but refuses uploads as full. */
const fullServer = (_input: string, init?: RequestInit) =>
  init?.method === "POST" ? full() : Promise.resolve(Response.json({ records: [], next: 0, more: false }));

describe("storage limit", () => {
  it("reports a full account so the app can say so", async () => {
    await expect(syncOnce("ana", memoryStore([rec("a")]), memoryLedger(), fullServer)).rejects.toBeInstanceOf(StorageFullError);
  });
});
