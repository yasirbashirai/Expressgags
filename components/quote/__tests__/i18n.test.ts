/**
 * Quote wizard i18n: dictionary completeness (en ↔ es), validation-message localization,
 * protection/availability helpers, and the language field in the payload.
 */
import { describe, expect, it } from "vitest";
import { KNOWN_VALIDATION_MESSAGES, QUOTE_STRINGS, localizeErrors, localizeMessage } from "@/content/i18n/quote";
import { SERVICE_TYPES } from "@/lib/quote-schema";
import { applyServiceDefaults, buildPayload, emptyDraft, emptyItem, reviveDraft, validateDraft, type QuoteDraft } from "../flow";
import { VEHICLE_CHOICES } from "../options";
import { availabilityQuery, availabilityState, parseProtectionPlans } from "../wizard-extras";

/** Every key path in `a` (functions/strings/arrays are leaves). */
function keyPaths(a: unknown, prefix = ""): string[] {
  if (a === null || typeof a !== "object" || Array.isArray(a)) return [prefix];
  return Object.entries(a as Record<string, unknown>).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}
const at = (o: unknown, path: string) => path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k], o);

describe("quote dictionary", () => {
  const en = QUOTE_STRINGS.en;
  const es = QUOTE_STRINGS.es;

  it("has the same keys in English and Spanish", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });

  it("has a non-empty Spanish value of the same type for every key, and translates every string", () => {
    for (const p of keyPaths(en)) {
      const e = at(en, p);
      const s = at(es, p);
      expect(typeof s, p).toBe(typeof e);
      if (typeof e === "string") {
        expect((s as string).trim().length, p).toBeGreaterThan(0);
      }
      if (typeof e === "function") expect((s as (...a: unknown[]) => unknown).length, p).toBe((e as (...a: unknown[]) => unknown).length);
      if (Array.isArray(e)) expect((s as unknown[]).length, p).toBe(e.length);
    }
  });

  it("covers every service and every vehicle choice", () => {
    for (const t of SERVICE_TYPES) {
      expect(es.services[t].title).toBeTruthy();
      expect(es.services[t].title).not.toBe(en.services[t].title);
    }
    for (const v of VEHICLE_CHOICES) expect(es.vehicles[v], v).toBeTruthy();
  });

  it("never uses banned claims or the word insurance in either language", () => {
    const all = JSON.stringify(QUOTE_STRINGS, (_k, v) => (typeof v === "function" ? v(1, 2) : v));
    expect(all).not.toMatch(/\b24\s*\/\s*7\b|guarantee(d)?\b|licensed\s*(and|&)\s*insured|insurance|seguro de|garantizad/i);
    expect(all).not.toMatch(/ — /); // house style: commas, not em dashes
  });
});

describe("validation messages", () => {
  it("translates every known English message", () => {
    for (const m of KNOWN_VALIDATION_MESSAGES) {
      const es = localizeMessage(m, "x", "es");
      expect(es, m).not.toBe(m);
      expect(es, m).not.toBe("Revise este dato");
    }
  });

  it("leaves English untouched", () => {
    expect(localizeMessage("Choose a date", "serviceDate", "en")).toBe("Choose a date");
  });

  it("localizes every message the wizard can produce for an empty draft of each service", () => {
    for (const s of SERVICE_TYPES) {
      const errors = validateDraft(applyServiceDefaults(emptyDraft(), s));
      const es = localizeErrors(errors, "es");
      for (const [path, msg] of Object.entries(es)) {
        expect(msg, `${s} ${path}: ${errors[path]}`).not.toBe(errors[path]);
      }
    }
  });

  it("falls back by path for zod's generic messages", () => {
    expect(localizeMessage("Invalid input: expected number, received NaN", "items.0.quantity", "es")).toBe("Indique una cantidad válida");
    expect(localizeMessage("Something unexpected", "notes", "es")).toBe("Revise este dato");
  });
});

describe("language in the payload", () => {
  it("defaults to English and sends Spanish when chosen", () => {
    const d = emptyDraft();
    expect(d.language).toBe("en");
    expect(buildPayload(d).language).toBe("en");
    expect(buildPayload({ ...d, language: "es" }).language).toBe("es");
  });

  it("restores the language and a valid protection tier from a saved draft, and drops junk", () => {
    expect(reviveDraft({ language: "es", protectionTier: "vip" })?.language).toBe("es");
    expect(reviveDraft({ language: "es", protectionTier: "vip" })?.protectionTier).toBe("vip");
    expect(reviveDraft({ language: "fr", protectionTier: "gold" })).toMatchObject({ language: "en", protectionTier: "" });
  });

  it("only sends protectionTier when one is chosen", () => {
    expect("protectionTier" in buildPayload(emptyDraft())).toBe(false);
    expect(buildPayload({ ...emptyDraft(), protectionTier: "plus" }).protectionTier).toBe("plus");
  });
});

describe("protection plans parsing", () => {
  const body = { ok: true, displayName: "Express Bags Protection", termsUrl: "https://www.express-bags.com/protection-terms", tiers: [{ code: "basic", name: "Basic", priceCents: 1000, maxBenefitCents: 25000, benefits: [] }] };
  it("hides the picker when the module is not live (404) or the body is malformed", () => {
    expect(parseProtectionPlans(404, { ok: false })).toBeNull();
    expect(parseProtectionPlans(200, null)).toBeNull();
    expect(parseProtectionPlans(200, { ok: true, tiers: [] })).toBeNull();
    expect(parseProtectionPlans(200, { ok: true, tiers: [{ code: "gold" }] })).toBeNull();
  });
  it("parses live plans and never shows an 'insurance' display name", () => {
    expect(parseProtectionPlans(200, body)?.tiers[0]).toMatchObject({ code: "basic", priceCents: 1000 });
    expect(parseProtectionPlans(200, { ...body, displayName: "Luggage Insurance" })?.displayName).toBe("Express Bags Protection");
    expect(parseProtectionPlans(200, { ...body, termsUrl: "javascript:alert(1)" })?.termsUrl).toBeNull();
  });
});

describe("storage availability", () => {
  const base = (over: Partial<QuoteDraft> = {}): QuoteDraft => ({ ...applyServiceDefaults(emptyDraft(), "storage"), storageMarket: "miami", storageStart: "2026-11-20T10:00", storageEnd: "2026-11-21T15:00", items: [emptyItem("large", "3")], ...over });
  it("asks only for complete storage requests in a priority market", () => {
    const q = availabilityQuery(base());
    expect(q).toContain("market=miami");
    expect(q).toContain("pieces=3");
    expect(availabilityQuery(base({ storageMarket: "other-florida" }))).toBeNull();
    expect(availabilityQuery(base({ storageEnd: "2026-11-19T10:00" }))).toBeNull();
    expect(availabilityQuery({ ...base(), serviceType: "airport" })).toBeNull();
  });
  it("maps yes/no to an informational state and stays silent on errors", () => {
    expect(availabilityState({ ok: true, available: true }, true)).toBe("ok");
    expect(availabilityState({ ok: true, available: false }, true)).toBe("limited");
    expect(availabilityState({ ok: false }, false)).toBe("idle");
    expect(availabilityState(null, true)).toBe("idle");
  });
});
