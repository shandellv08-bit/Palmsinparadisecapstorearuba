import "server-only";
import { env } from "./env";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends one email through Resend. Never throws: an email problem must never
 * fail an order. Returns whether it was sent so callers can log it.
 */
export async function sendEmail(mail: Email, timeoutMs = 5000): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.ORDER_EMAIL_FROM) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.ORDER_EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) console.error("email: provider returned", res.status);
    return res.ok;
  } catch (e) {
    console.error("email: failed", (e as Error).name);
    return false;
  }
}
