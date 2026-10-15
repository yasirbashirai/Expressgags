import { describe, expect, it } from "vitest";
import { quoteRequestSchema, SERVICE_TYPES, type ServiceType } from "@/lib/quote-schema";
import {
  applyServiceDefaults,
  buildPayload,
  emptyDraft,
  emptyItem,
  emptyLocation,
  getSteps,
  locationWithFacility,
  parseFinal,
  reviveDraft,
  validateStep,
  type QuoteDraft,
} from "../flow";

/** A fully completed, valid draft for any service. */
function validDraft(service: ServiceType): QuoteDraft {
  let d = applyServiceDefaults(emptyDraft(), service);
  d = {
    ...d,
    pickup: { ...emptyLocation("hotel", "miami"), address: "Hotel on Brickell Ave, Miami" },
    delivery: { ...emptyLocation("business", "miami"), address: "Warehouse in Doral" },
    serviceDate: "2026-11-20",
    timeWindow: "morning",
    contact: { name: "Test Traveler", email: "test@example.com", phone: "3055550100", company: "", preferredContact: "email" },
    leadSource: "google-search",
    acceptsProhibitedItemsPolicy: true,
    consentToContact: true,
  };
  if (service === "airport") {
    d.pickup = locationWithFacility({ ...emptyLocation("airport", ""), address: "" }, "MIA");
  }
  if (service === "cruise") {
    d.delivery = locationWithFacility({ ...emptyLocation("cruise-port", ""), address: "" }, "portmiami");
  }
  if (service === "storage") {
    d.storageStart = "2026-11-20T10:00";
    d.storageEnd = "2026-11-21T15:00";
    d.storageMarket = "miami";
  }
  if (service === "group-event") d.groupName = "Corporate incentive group";
  if (service === "nationwide-shipping") {
    d.delivery = { ...emptyLocation("residence", "outside-florida"), address: "Chicago, IL 60601" };
    d.items = [{ ...emptyItem("large", "2"), weightLbs: "48", lengthIn: "30", widthIn: "20", heightIn: "12" }];
  }
  return d;
}

describe("getSteps", () => {
  it("only knows the service step until a service is chosen", () => {
    expect(getSteps("").map((s) => s.id)).toEqual(["service"]);
  });
  it("starts with service and ends with contact + review for every service", () => {
    for (const s of SERVICE_TYPES) {
      const ids = getSteps(s).map((x) => x.id);
      expect(ids[0]).toBe("service");
      expect(ids.slice(-2)).toEqual(["contact", "review"]);
    }
  });
  it("uses a dedicated storage step and a dedicated group step", () => {
    expect(getSteps("storage").map((s) => s.id)).toContain("storage");
    expect(getSteps("storage").map((s) => s.id)).not.toContain("route");
    expect(getSteps("group-event").map((s) => s.id)).toContain("group");
    expect(getSteps("luggage-local").map((s) => s.id)).toEqual(["service", "route", "timing", "items", "contact", "review"]);
  });
});

describe("valid example per service passes the shared schema", () => {
  for (const s of SERVICE_TYPES) {
    it(s, () => {
      const d = validDraft(s);
      const res = parseFinal(d);
      if (!res.ok) throw new Error(`${s}: ${JSON.stringify(res.errors)}`);
      expect(quoteRequestSchema.safeParse(buildPayload(d)).success).toBe(true);
    });
  }
});

describe("defaults keep traveler and freight flows apart", () => {
  it("courier and truck start with cargo items", () => {
    expect(applyServiceDefaults(emptyDraft(), "truck").items[0].category).toBe("cargo");
    expect(applyServiceDefaults(emptyDraft(), "courier").items[0].category).toBe("cargo");
  });
  it("luggage flows start with suitcase items", () => {
    expect(applyServiceDefaults(emptyDraft(), "airport").items[0].category).toBe("standard-checked");
  });
  it("switching from truck back to luggage resets cargo lines", () => {
    const d = applyServiceDefaults(applyServiceDefaults(emptyDraft(), "truck"), "luggage-local");
    expect(d.items[0].category).toBe("standard-checked");
  });
  it("nationwide shipping defaults to a shipping speed and an out-of-state destination", () => {
    const d = applyServiceDefaults(emptyDraft(), "nationwide-shipping");
    expect(d.speed).toBe("standard");
    expect(d.delivery.market).toBe("outside-florida");
  });
});

describe("step validation", () => {
  it("route step reports missing addresses only", () => {
    const d = applyServiceDefaults(emptyDraft(), "luggage-local");
    const steps = getSteps("luggage-local");
    const errors = validateStep(d, steps.find((s) => s.id === "route")!);
    expect(Object.keys(errors).some((k) => k.startsWith("pickup"))).toBe(true);
    expect(Object.keys(errors).every((k) => ["pickup", "delivery", "extraStops"].some((p) => k.startsWith(p)))).toBe(true);
  });
  it("airport route requires choosing the airport", () => {
    const d = applyServiceDefaults(emptyDraft(), "airport");
    d.pickup.address = "somewhere";
    d.pickup.market = "miami";
    const errors = validateStep(d, getSteps("airport")[1]);
    expect(errors["pickup.facility"]).toBeTruthy();
  });
  it("cruise requires a cruise port at one end", () => {
    const d = validDraft("cruise");
    d.delivery = { ...emptyLocation("hotel", "miami"), address: "Hotel" };
    expect(parseFinal(d).ok).toBe(false);
  });
  it("nationwide shipping requires weight and all dimensions", () => {
    const d = validDraft("nationwide-shipping");
    d.items[0].heightIn = "";
    const errors = validateStep(d, getSteps("nationwide-shipping").find((s) => s.id === "items")!);
    expect(errors["items.0.heightIn"]).toBeTruthy();
  });
  it("storage needs retrieval after drop-off", () => {
    const d = validDraft("storage");
    d.storageEnd = "2026-11-19T10:00";
    const errors = validateStep(d, getSteps("storage").find((s) => s.id === "storage")!);
    expect(errors.storageEnd).toMatch(/after/);
  });
  it("storage-only does not ask for pickup/delivery addresses", () => {
    const d = validDraft("storage");
    d.pickup = emptyLocation();
    d.delivery = emptyLocation();
    expect(parseFinal(d).ok).toBe(true);
  });
  it("storage with pickup requires the pickup address", () => {
    const d = validDraft("storage");
    d.storageWithPickup = true;
    d.pickup = emptyLocation("hotel", "miami");
    const errors = validateStep(d, getSteps("storage").find((s) => s.id === "storage")!);
    expect(errors["pickup.address"]).toBeTruthy();
  });
  it("group request needs a group or event name", () => {
    const d = validDraft("group-event");
    d.groupName = "";
    expect(parseFinal(d).ok).toBe(false);
  });
  it("review step requires both confirmations", () => {
    const d = validDraft("courier");
    d.acceptsProhibitedItemsPolicy = false;
    const errors = validateStep(d, getSteps("courier").at(-1)!);
    expect(errors.acceptsProhibitedItemsPolicy).toBeTruthy();
  });
  it("contact step rejects a bad email", () => {
    const d = validDraft("courier");
    d.contact.email = "not-an-email";
    const errors = validateStep(d, getSteps("courier").find((s) => s.id === "contact")!);
    expect(errors["contact.email"]).toBeTruthy();
  });
  it("honeypot must stay empty", () => {
    const d = validDraft("truck");
    d.website = "http://spam.example";
    expect(parseFinal(d).ok).toBe(false);
  });
});

describe("payload details", () => {
  it("airport choice pre-fills the address and market", () => {
    const l = locationWithFacility(emptyLocation("airport"), "FLL");
    expect(l.address).toMatch(/Fort Lauderdale/);
    expect(l.market).toBe("fort-lauderdale-broward");
  });
  it("group flags and recurring routes are written into notes", () => {
    const g = { ...validDraft("group-event"), groupInvolvesCruise: true };
    expect(buildPayload(g).notes).toMatch(/cruise/);
    const c = { ...validDraft("courier"), recurringRoute: true };
    expect(buildPayload(c).notes).toMatch(/Recurring route/);
  });
  it("storage uses the drop-off date as the service date", () => {
    expect(buildPayload(validDraft("storage")).serviceDate).toBe("2026-11-20");
  });
  it("never restores legal confirmations from a saved draft", () => {
    const r = reviveDraft({ ...validDraft("airport") });
    expect(r?.acceptsProhibitedItemsPolicy).toBe(false);
    expect(r?.consentToContact).toBe(false);
    expect(reviveDraft("garbage")).toBeNull();
  });
});
