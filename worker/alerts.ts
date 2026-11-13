/**
 * Emails the owner when this month's AI spend passes $1 and again at $4
 * (owner decision, 2026-11-13): an early warning ahead of the app's $5 cap
 * and the $5 limits set at Anthropic and OpenAI. Each alert goes once a
 * month; a failed send is retried after the next charged call. The email
 * has amounts only, no practice data or account details.
 *
 * Sent through Resend's HTTP API with the RESEND_API_KEY secret, to the
 * ALERT_EMAIL secret. Without both, alerts are off.
 */
import { MONTHLY_BUDGET_MICROS } from "./insights";

export const ALERT_THRESHOLDS_MICROS = [1_000_000, 4_000_000] as const;

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export type SendEmail = (env: Env, email: Email) => Promise<void>;

export const sendWithResend: SendEmail = async (env, email) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`, "Content-Type": "application/json" },
    // Resend's shared sender works without a domain of our own, for mail to the account's own address.
    body: JSON.stringify({ from: "E-drum Practice Coach <onboarding@resend.dev>", to: [email.to], subject: email.subject, text: email.text }),
  });
  if (!res.ok) throw new Error(`Resend refused the email: ${res.status} ${await res.text()}`);
};

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/** Checks this month's AI spend and sends any alert not yet sent. Never throws. */
export async function checkSpendAlerts(env: Env, now = new Date(), send: SendEmail = sendWithResend): Promise<void> {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL) return;
  try {
    const spent =
      (await env.DB.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS c FROM insights WHERE created_at >= ?").bind(monthStart(now)).first<number>("c")) ?? 0;
    const month = now.toISOString().slice(0, 7);
    for (const threshold of ALERT_THRESHOLDS_MICROS) {
      if (spent < threshold) continue;
      // Claim the alert first, so two calls at once can't both send it.
      // oxlint-disable-next-line no-await-in-loop -- at most two thresholds, in order
      const claim = await env.DB.prepare("INSERT INTO spend_alerts (month, threshold_micros, sent_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
        .bind(month, threshold, now.toISOString())
        .run();
      if ((claim.meta.changes ?? 0) === 0) continue; // already sent this month
      try {
        // oxlint-disable-next-line no-await-in-loop
        await send(env, {
          to: env.ALERT_EMAIL,
          subject: `E-drum Practice Coach: AI spend passed ${dollars(threshold)} this month`,
          text: [
            `The coaching tips have cost about ${dollars(spent)} so far this month (${month}).`,
            `The app pauses tips at ${dollars(MONTHLY_BUDGET_MICROS)}, and your limits at Anthropic and OpenAI cap the bill there too.`,
            "",
            "If you didn't expect this, check the Anthropic and OpenAI usage pages and revoke the keys if anything looks wrong.",
          ].join("\n"),
        });
      } catch (error) {
        console.error("spend alert failed, will retry", error);
        // oxlint-disable-next-line no-await-in-loop
        await env.DB.prepare("DELETE FROM spend_alerts WHERE month = ? AND threshold_micros = ?").bind(month, threshold).run();
      }
    }
  } catch (error) {
    console.error("spend alert check failed", error);
  }
}
