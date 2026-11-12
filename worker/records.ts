/**
 * Practice history sync. Records are immutable, so the server only ever
 * adds: POST /api/records stores the ones it doesn't have yet (by record ID,
 * per user), and GET /api/records?after=<seq> returns what arrived since a
 * device last asked. The server checks a record's outline and size and
 * stores its JSON as sent; the app validates fully when reading it back.
 */
import { json, problem, rawJson } from "./http";

/** At most this many records per upload, and this many bytes in all. */
export const PUSH_MAX_RECORDS = 100;
export const PUSH_MAX_BYTES = 1_000_000;
/** A 16-loop session is a few KB; anything far bigger isn't a real record. */
export const RECORD_MAX_BYTES = 64_000;
/** Records per download page. */
export const PULL_LIMIT = 200;
/**
 * Synced history per drummer: about 5,000 sessions, years of daily practice.
 * It keeps one account from filling the shared free database.
 */
export const USER_MAX_BYTES = 25_000_000;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The outline every history record has (see src/history/record.ts). */
function looksLikeRecord(x: unknown): x is Record<string, unknown> & { id: string } {
  return (
    isObject(x) &&
    typeof x.id === "string" &&
    ID_PATTERN.test(x.id) &&
    typeof x.v === "number" &&
    (x.kind === "session" || x.kind === "trainer") &&
    typeof x.start === "string"
  );
}

export interface PushResult {
  /** Newly stored. */
  stored: number;
  /** Already on the server (sent before, perhaps from another device). */
  known: number;
  /** IDs of records the server won't keep (malformed or too big), so the app stops resending them. */
  rejected: string[];
}

export async function pushRecords(request: Request, env: Env, userId: string, now = new Date()): Promise<Response> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > PUSH_MAX_BYTES) return problem(413, "too-large", `Send at most ${PUSH_MAX_BYTES} bytes at a time.`);
  const text = await request.text();
  if (text.length > PUSH_MAX_BYTES) return problem(413, "too-large", `Send at most ${PUSH_MAX_BYTES} bytes at a time.`);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return problem(400, "bad-json", "The body isn't JSON.");
  }
  if (!isObject(body) || !Array.isArray(body.records)) return problem(400, "bad-request", "Expected { records: [...] }.");
  if (body.records.length > PUSH_MAX_RECORDS) {
    return problem(413, "too-many", `Send at most ${PUSH_MAX_RECORDS} records at a time.`);
  }

  const rejected: string[] = [];
  const rows: { id: string; body: string }[] = [];
  for (const record of body.records as unknown[]) {
    if (looksLikeRecord(record)) {
      const serialized = JSON.stringify(record);
      if (serialized.length <= RECORD_MAX_BYTES) {
        rows.push({ id: record.id, body: serialized });
        continue;
      }
    }
    if (isObject(record) && typeof record.id === "string") rejected.push(record.id.slice(0, 100));
  }

  let stored = 0;
  if (rows.length > 0) {
    // The running total (kept on the user) is checked first; records already
    // on the server count against it once more here, so the check is cautious.
    const used = (await env.DB.prepare("SELECT record_bytes FROM users WHERE id = ?").bind(userId).first<number>("record_bytes")) ?? 0;
    const incoming = rows.reduce((n, r) => n + r.body.length, 0);
    if (used + incoming > USER_MAX_BYTES) {
      return problem(413, "storage-full", "Your synced history has reached its size limit.");
    }

    const at = now.toISOString();
    const insert = env.DB.prepare(
      "INSERT INTO records (user_id, id, body, received_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, id) DO NOTHING",
    );
    const results = await env.DB.batch(rows.map((r) => insert.bind(userId, r.id, r.body, at)));
    let bytes = 0;
    results.forEach((r, i) => {
      if ((r.meta.changes ?? 0) > 0) {
        stored++;
        bytes += rows[i]?.body.length ?? 0;
      }
    });
    if (stored > 0) {
      await env.DB.prepare("UPDATE users SET record_count = record_count + ?, record_bytes = record_bytes + ? WHERE id = ?")
        .bind(stored, bytes, userId)
        .run();
    }
  }
  const result: PushResult = { stored, known: rows.length - stored, rejected };
  return json(result);
}

export async function pullRecords(request: Request, env: Env, userId: string): Promise<Response> {
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return problem(400, "bad-request", "`after` must be a whole number.");
  const { results } = await env.DB.prepare("SELECT seq, body FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?")
    .bind(userId, after, PULL_LIMIT + 1)
    .all<{ seq: number; body: string }>();
  const page = results.slice(0, PULL_LIMIT);
  const next = page.at(-1)?.seq ?? after;
  // The bodies are stored as JSON already, so they're joined rather than parsed and re-serialized.
  return rawJson(`{"records":[${page.map((r) => r.body).join(",")}],"next":${next},"more":${results.length > PULL_LIMIT}}`);
}

/** Deletes every synced record of this user (the clear-history option "also from my account"). */
export async function deleteRecords(_request: Request, env: Env, userId: string): Promise<Response> {
  const [deleted] = await env.DB.batch([
    env.DB.prepare("DELETE FROM records WHERE user_id = ?").bind(userId),
    env.DB.prepare("UPDATE users SET record_count = 0, record_bytes = 0 WHERE id = ?").bind(userId),
  ]);
  return json({ deleted: deleted?.meta.changes ?? 0 });
}
