import { afterEach, describe, expect, it, vi } from "vitest";
import { ALERT_THRESHOLDS_MICROS, checkSpendAlerts, type Email, type SendEmail } from "./alerts";
import { findOrCreateUser } from "./auth/oauth";
import type { TestD1 } from "./testing/d1";
import { testEnv } from "./testing/env";

let db: TestD1 | null = null;
afterEach(() => {
  db?.close();
  db = null;
  vi.restoreAllMocks();
});

async function setup(secrets: Partial<Env> = { RESEND_API_KEY: "re_test", ALERT_EMAIL: "owner@example.com" }) {
  const t = testEnv(secrets);
  db = t.db;
  const userId = await findOrCreateUser(t.env.DB, "github", { subject: "1", name: null, avatarUrl: null });
  const spend = (micros: number, at: string) =>
    db?.query("INSERT INTO insights (user_id, created_at, day, summary_hash, body, cost_micros) VALUES (?, ?, ?, 'h', 'null', ?)", userId, at, at.slice(0, 10), micros);
  return { env: t.env, spend };
}

function fakeSender() {
  const sent: Email[] = [];
  const send: SendEmail = (_env, email) => {
    sent.push(email);
    return Promise.resolve();
  };
  return { send, sent };
}

/** A sender that fails once, then works. */
function flakySender() {
  const sent: Email[] = [];
  let failed = false;
  const send: SendEmail = (_env, email) => {
    if (!failed) {
      failed = true;
      return Promise.reject(new Error("Resend down"));
    }
    sent.push(email);
    return Promise.resolve();
  };
  return { send, sent };
}

const at = (iso: string) => new Date(iso);

describe("spend alerts", () => {
  it("emails once when the month's spend passes $1, and once more at $4", async () => {
    const { env, spend } = await setup();
    const { send, sent } = fakeSender();
    spend(400_000, "2026-11-13T10:00:00Z");
    await checkSpendAlerts(env, at("2026-11-13T10:00:00Z"), send);
    expect(sent).toEqual([]);

    spend(700_000, "2026-11-13T11:00:00Z"); // $1.10
    await checkSpendAlerts(env, at("2026-11-13T11:00:00Z"), send);
    await checkSpendAlerts(env, at("2026-11-13T11:05:00Z"), send); // no repeat
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "owner@example.com", subject: expect.stringContaining("$1.00") });
    expect(sent[0]?.text).toContain("$1.10");

    spend(3_000_000, "2026-11-14T09:00:00Z"); // $4.10
    await checkSpendAlerts(env, at("2026-11-14T09:00:00Z"), send);
    expect(sent.map((e) => e.subject)).toEqual([expect.stringContaining("$1.00"), expect.stringContaining("$4.00")]);
    expect(db?.query("SELECT month, threshold_micros FROM spend_alerts ORDER BY threshold_micros")).toEqual(
      ALERT_THRESHOLDS_MICROS.map((t) => ({ month: "2026-11", threshold_micros: t })),
    );
  });

  it("sends both at once if a single call jumps past both thresholds", async () => {
    const { env, spend } = await setup();
    const { send, sent } = fakeSender();
    spend(4_500_000, "2026-11-13T10:00:00Z");
    await checkSpendAlerts(env, at("2026-11-13T10:00:00Z"), send);
    expect(sent).toHaveLength(2);
  });

  it("starts over each month", async () => {
    const { env, spend } = await setup();
    const { send, sent } = fakeSender();
    spend(1_500_000, "2026-11-20T10:00:00Z");
    await checkSpendAlerts(env, at("2026-11-20T10:00:00Z"), send);
    await checkSpendAlerts(env, at("2026-12-01T10:00:00Z"), send); // December: nothing spent yet
    spend(1_200_000, "2026-12-02T10:00:00Z");
    await checkSpendAlerts(env, at("2026-12-02T10:00:00Z"), send);
    expect(sent.map((e) => e.text.includes("2026-12"))).toEqual([false, true]);
  });

  it("retries an alert whose email failed", async () => {
    const { env, spend } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { send, sent } = flakySender();
    spend(1_200_000, "2026-11-13T10:00:00Z");
    await checkSpendAlerts(env, at("2026-11-13T10:00:00Z"), send);
    expect(sent).toEqual([]);
    await checkSpendAlerts(env, at("2026-11-13T10:10:00Z"), send);
    expect(sent).toHaveLength(1);
  });

  it("is off without the Resend key or the address", async () => {
    const { send, sent } = fakeSender();
    for (const secrets of [{ ALERT_EMAIL: "owner@example.com" }, { RESEND_API_KEY: "re_test" }]) {
      // oxlint-disable-next-line no-await-in-loop -- one database at a time
      const { env, spend } = await setup(secrets);
      spend(5_000_000, "2026-11-13T10:00:00Z");
      // oxlint-disable-next-line no-await-in-loop
      await checkSpendAlerts(env, at("2026-11-13T10:00:00Z"), send);
      db?.close();
      db = null;
    }
    expect(sent).toEqual([]);
  });

  it("puts no practice data or account details in the email", async () => {
    const { env, spend } = await setup();
    const { send, sent } = fakeSender();
    spend(1_000_000, "2026-11-13T10:00:00Z");
    await checkSpendAlerts(env, at("2026-11-13T10:00:00Z"), send);
    const text = JSON.stringify(sent);
    expect(text).not.toMatch(/github|user|session|accuracy|bpm/i);
  });
});
