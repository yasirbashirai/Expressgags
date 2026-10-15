/**
 * Pure tests: templates (EN/ES, privacy, contact details, SMS length), Miami quiet hours incl. DST,
 * phone normalization, Twilio signatures, Meta CAPI hashing.
 */
import "../../../lib/env";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderTemplate, sampleData, STAFF_TEMPLATES, TEMPLATE_KEYS } from "../../../lib/templates";
import { verifyTwilioSignature } from "../../../providers/twilio";
import { hashEmail, hashPhone, metaLeadPayload, sha256 } from "../marketing";
import { inQuietHours, miamiMinutes, nextAllowedTime, toE164 } from "../time";
import { unsubscribeToken, verifyUnsubscribe } from "../unsubscribe";

const QH = { enabled: true, start: "21:00", end: "07:00" };

describe("templates", () => {
  it("renders every template in English and Spanish with brand-safe contact details", () => {
    for (const key of TEMPLATE_KEYS) {
      for (const lang of ["en", "es"] as const) {
        const r = renderTemplate(key, lang, sampleData(key));
        expect(r.subject.length, key).toBeGreaterThan(5);
        expect(r.html).toContain("P.O. Box 667538");
        expect(r.html).toContain("(305) 783-2860");
        for (const out of [r.html, r.text, r.sms]) {
          expect(out).not.toMatch(/874[\s.-]?0832|cjdelgado|7500\s*N\.?W|Carlos|Delgado/i);
          expect(out).not.toMatch(/24\s*\/\s*7|guarantee|licensed (and|&) insured/i);
        }
        expect(r.subject + r.sms).not.toContain(" — ");
      }
    }
  });

  it("uses Spanish copy for customers who chose Spanish, English for staff alerts", () => {
    expect(renderTemplate("order.delivered", "es", sampleData("order.delivered")).subject).toMatch(/^Entregado/);
    expect(renderTemplate("order.delivered", "en", sampleData("order.delivered")).subject).toMatch(/^Delivered/);
    for (const key of STAFF_TEMPLATES) expect(renderTemplate(key, "es", sampleData(key)).html).toContain('lang="en"');
  });

  it("shows only the assigned driver's first name", () => {
    const r = renderTemplate("order.driver_assigned", "en", { ...sampleData("order.driver_assigned"), driverFirstName: "Marco" });
    expect(r.subject).toContain("assigned");
    expect(r.html).toContain("Marco");
    const none = renderTemplate("order.driver_assigned", "en", { ...sampleData("order.driver_assigned"), driverFirstName: undefined });
    expect(none.html).toContain("trained Express Bags driver");
  });

  it("labels carrier tracking separately from the Express Bags reference", () => {
    const r = renderTemplate("order.transferred_to_carrier", "en", sampleData("order.transferred_to_carrier"));
    expect(r.html).toContain("Carrier tracking (UPS)");
    expect(r.html).toContain("different from your Express Bags reference");
  });

  it("keeps day-of SMS under two segments", () => {
    for (const key of ["order.driver_assigned", "order.en_route", "order.out_for_delivery", "order.delivered", "order.picked_up"] as const) {
      expect(renderTemplate(key, "en", sampleData(key)).sms.length, key).toBeLessThanOrEqual(160);
    }
  });
});

describe("Miami quiet hours", () => {
  it("detects quiet hours across midnight", () => {
    expect(inQuietHours(new Date("2026-07-15T02:30:00Z"), QH)).toBe(true); // 22:30 EDT
    expect(inQuietHours(new Date("2026-07-15T15:00:00Z"), QH)).toBe(false); // 11:00 EDT
    expect(inQuietHours(new Date("2026-07-15T10:59:00Z"), QH)).toBe(true); // 06:59 EDT
    expect(inQuietHours(new Date("2026-07-15T11:00:00Z"), QH)).toBe(false); // 07:00 EDT
    expect(inQuietHours(new Date("2026-07-15T02:30:00Z"), { ...QH, enabled: false })).toBe(false);
  });

  it("schedules to 7:00 AM Miami, correct across DST changes", () => {
    // DST starts Sun 2026-03-08 (EST→EDT): 22:00 EST on Mar 7 → 07:00 EDT on Mar 8 = 11:00Z
    expect(nextAllowedTime(new Date("2026-03-08T03:00:00Z"), QH).toISOString()).toBe("2026-03-08T11:00:00.000Z");
    // DST ends Sun 2026-11-01 (EDT→EST): 22:00 EDT Oct 31 → 07:00 EST Nov 1 = 12:00Z
    expect(nextAllowedTime(new Date("2026-11-01T02:00:00Z"), QH).toISOString()).toBe("2026-11-01T12:00:00.000Z");
    expect(miamiMinutes(new Date("2026-01-10T17:30:00Z"))).toBe(12 * 60 + 30);
    const midday = new Date("2026-07-15T16:00:00Z");
    expect(nextAllowedTime(midday, QH)).toBe(midday);
  });

  it("normalizes phone numbers to E.164", () => {
    expect(toE164("(305) 555-0100")).toBe("+13055550100");
    expect(toE164("1 305 555 0100")).toBe("+13055550100");
    expect(toE164("whatsapp:+447700900123")).toBe("+447700900123");
    expect(toE164("555")).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

describe("signatures and hashing", () => {
  it("verifies Twilio request signatures", () => {
    const url = "https://api.example.com/v1/webhooks/twilio";
    const params = { From: "+13055550100", Body: "STOP", To: "+13055559999" };
    const data = url + "BodySTOP" + "From+13055550100" + "To+13055559999";
    const sig = createHmac("sha1", "secret-token").update(data).digest("base64");
    expect(verifyTwilioSignature(url, params, sig, "secret-token")).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, Body: "START" }, sig, "secret-token")).toBe(false);
    expect(verifyTwilioSignature(url, params, undefined, "secret-token")).toBe(false);
  });

  it("hashes Meta user data per spec and de-duplicates with the browser event id", () => {
    expect(hashEmail("  Alex@Example.COM ")).toBe(sha256("alex@example.com"));
    expect(hashPhone("(305) 555-0100")).toBe(sha256("13055550100"));
    const p = metaLeadPayload({ reference: "EB-Q-261015-ABCD", email: "a@b.co", phone: "3055550100", serviceType: "airport" }, new Date("2026-10-15T12:00:00Z"));
    expect(p.data[0].event_id).toBe("EB-Q-261015-ABCD");
    expect(p.data[0].event_time).toBe(Date.UTC(2026, 9, 15, 12) / 1000);
    expect(JSON.stringify(p)).not.toContain("a@b.co");
  });

  it("signs unsubscribe links per address", () => {
    const t = unsubscribeToken("alex@example.com");
    expect(verifyUnsubscribe("ALEX@example.com", t)).toBe(true);
    expect(verifyUnsubscribe("other@example.com", t)).toBe(false);
  });
});
