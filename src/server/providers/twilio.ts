/**
 * Twilio SMS + WhatsApp adapter (REST via fetch, no SDK). Active only when Express Bags' own
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are set; otherwise the log provider is used.
 * Also exports the X-Twilio-Signature verifier used by the inbound (STOP) webhook.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SmsProvider } from "./index";
import { registerProvider } from "./registry";

const cfg = () => ({
  sid: process.env.TWILIO_ACCOUNT_SID || "",
  token: process.env.TWILIO_AUTH_TOKEN || "",
  from: process.env.TWILIO_FROM || "",
  whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "",
  statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL || "",
});

export const twilioSms: SmsProvider = {
  name: "twilio",
  async send(to, body, channel = "sms") {
    const c = cfg();
    const from = channel === "whatsapp" ? c.whatsappFrom : c.from;
    if (!c.sid || !c.token || !from) return { status: "FAILED", error: `Twilio ${channel} sender not configured` };
    const params = new URLSearchParams({
      To: channel === "whatsapp" ? `whatsapp:${to}` : to,
      From: channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from,
      Body: body,
    });
    if (c.statusCallback) params.set("StatusCallback", c.statusCallback);
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.sid)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
      if (!res.ok) return { status: "FAILED", error: `Twilio ${res.status}: ${json.message ?? "error"}` };
      return { status: "SENT", ref: json.sid };
    } catch (e) {
      return { status: "FAILED", error: (e as Error).message };
    }
  },
};

/**
 * Twilio request validation: base64(HMAC-SHA1(authToken, url + concatenated sorted POST params)).
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | undefined, authToken = cfg().token) {
  if (!signature || !authToken) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

if (cfg().sid && cfg().token) registerProvider("sms", () => twilioSms);
