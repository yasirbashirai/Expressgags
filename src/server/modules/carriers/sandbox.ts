/**
 * "Test pricing" sandbox (Master Requirements §16 + §18.1): before public automatic pricing goes live,
 * staff run 20–30 representative real-world scenarios through the SAME engines the website would use
 * (decision engine → local / storage / carrier engines) and review every price and fulfillment decision.
 * Runs are saved as evidence (PricingTestRun). Only the OWNER can then approve switching public instant
 * pricing on (PricingApproval records who, when, which flags, and which test run it was based on).
 */
import type { QuoteRequest } from "@/lib/quote-schema";
import { prisma } from "../../db";
import { decideRoute } from "../../engines/decision-engine";
import { priceLocal } from "../../engines/pricing/local";
import { priceStorage } from "../../engines/pricing/storage";
import { HttpError } from "../../lib/errors";
import { maps } from "../../providers/registry";
import { getActiveRules, getSetting, updateSetting } from "../../settings";
import { inputFromRequest } from "./instant";
import { quoteNationwide } from "./quote";

type Item = QuoteRequest["items"][number];
type Loc = QuoteRequest["pickup"];

export type Scenario = { id: string; label: string; group: "local" | "storage" | "nationwide" | "custom"; request: QuoteRequest };

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const loc = (type: Loc["type"], address: string, market: Loc["market"], facility = ""): Loc => ({ type, address, market, facility, notes: "" });
const bags = (category: Item["category"], quantity: number, extra: Partial<Item> = {}): Item => ({ category, quantity, description: "", ...extra });

function req(serviceType: QuoteRequest["serviceType"], pickup: Loc, delivery: Loc, items: Item[], extra: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    serviceType,
    pickup,
    delivery,
    extraStops: [],
    serviceDate: day(7),
    timeWindow: "morning",
    speed: "scheduled",
    items,
    storageWithPickup: false,
    storageWithDelivery: false,
    onsiteCoordination: false,
    contact: { name: "Pricing test", email: "pricing-test@example.com", phone: "3055550100", preferredContact: "email" },
    billingType: "individual",
    leadSource: "other",
    attachmentIds: [],
    acceptsProhibitedItemsPolicy: true,
    consentToContact: true,
    ...extra,
  } as QuoteRequest;
}

/** 25 representative scenarios across every pricing path (Carlos asked for 20–30). */
export function scenarios(): Scenario[] {
  const s: Scenario[] = [];
  const add = (id: string, label: string, group: Scenario["group"], request: QuoteRequest) => s.push({ id, label, group, request });
  // Local pickup & drop-off
  add("l1", "MIA → Brickell hotel, 2 checked bags", "local", req("airport", loc("airport", "Miami International Airport", "miami", "MIA"), loc("hotel", "Hotel on Brickell Ave, Miami", "miami"), [bags("standard-checked", 2)]));
  add("l2", "Miami Beach hotel → PortMiami, 4 bags", "local", req("cruise", loc("hotel", "Hotel on Collins Ave, Miami Beach", "miami"), loc("cruise-port", "PortMiami", "miami", "portmiami"), [bags("standard-checked", 3), bags("carry-on", 1)]));
  add("l3", "Fort Lauderdale hotel → Port Everglades, 6 bags", "local", req("cruise", loc("hotel", "Hotel on Fort Lauderdale Beach", "fort-lauderdale-broward"), loc("cruise-port", "Port Everglades", "fort-lauderdale-broward", "port-everglades"), [bags("standard-checked", 4), bags("large", 2)]));
  add("l4", "MIA → Key West resort (long distance)", "local", req("luggage-local", loc("airport", "Miami International Airport", "miami", "MIA"), loc("hotel", "Resort in Key West", "florida-keys-key-west"), [bags("standard-checked", 2)]));
  add("l5", "Doral office → Miami Beach hotel, same day courier", "local", req("courier", loc("business", "Office in Doral", "miami"), loc("hotel", "Hotel in Miami Beach", "miami"), [bags("cargo", 1, { description: "Document box", weightLbs: 8 })], { speed: "same-day" }));
  add("l6", "FLL → West Palm Beach hotel, 3 bags", "local", req("airport", loc("airport", "Fort Lauderdale-Hollywood International Airport", "fort-lauderdale-broward", "FLL"), loc("hotel", "Hotel in West Palm Beach", "west-palm-beach"), [bags("standard-checked", 3)]));
  add("l7", "Orlando resort → Port Canaveral, 5 bags", "local", req("cruise", loc("hotel", "Resort on International Drive, Orlando", "orlando"), loc("cruise-port", "Port Canaveral", "cape-canaveral-port-canaveral", "port-canaveral"), [bags("standard-checked", 4), bags("carry-on", 1)]));
  add("l8", "Tampa hotel → TPA, after hours", "local", req("airport", loc("hotel", "Hotel in downtown Tampa", "tampa"), loc("airport", "Tampa International Airport", "tampa", "TPA"), [bags("standard-checked", 2)], { timeWindow: "after-hours" }));
  add("l9", "Golf clubs + 2 bags, Naples → RSW", "local", req("airport", loc("hotel", "Resort in Naples", "fort-myers"), loc("airport", "Southwest Florida International Airport", "fort-myers", "RSW"), [bags("standard-checked", 2), bags("special", 1, { description: "Golf clubs" })]));
  add("l10", "Box-truck pallets, Medley → Hialeah", "local", req("truck", loc("business", "Warehouse in Medley", "miami"), loc("business", "Warehouse in Hialeah", "miami"), [bags("cargo", 4, { description: "Pallets", weightLbs: 400 })]));
  add("l11", "Urgent: Brickell → MIA, 1 bag", "local", req("airport", loc("hotel", "Hotel on Brickell Ave, Miami", "miami"), loc("airport", "Miami International Airport", "miami", "MIA"), [bags("carry-on", 1)], { speed: "urgent" }));
  // Storage
  add("s1", "Storage 6 hours, 3 bags (Miami)", "storage", req("storage", loc("storage", "Customer drop-off at Express Bags storage", "miami"), loc("storage", "Customer retrieval from Express Bags storage", "miami"), [bags("standard-checked", 3)], { storageStart: `${day(7)}T09:00`, storageEnd: `${day(7)}T15:00` }));
  add("s2", "Storage 3 days, 2 bags + pickup & delivery", "storage", req("storage", loc("hotel", "Hotel in Miami Beach", "miami"), loc("cruise-port", "PortMiami", "miami", "portmiami"), [bags("standard-checked", 2)], { storageStart: `${day(7)}T10:00`, storageEnd: `${day(10)}T10:00`, storageWithPickup: true, storageWithDelivery: true }));
  add("s3", "Storage overnight, oversized item", "storage", req("storage", loc("storage", "Customer drop-off at Express Bags storage", "fort-lauderdale-broward"), loc("storage", "Customer retrieval from Express Bags storage", "fort-lauderdale-broward"), [bags("oversized", 1)], { storageStart: `${day(7)}T18:00`, storageEnd: `${day(8)}T09:00` }));
  // Nationwide shipping
  add("n1", "Miami → New York, 2 checked bags", "nationwide", req("nationwide-shipping", loc("hotel", "Hotel in Miami Beach", "miami"), loc("residence", "350 5th Ave, New York, NY 10118", "outside-florida"), [bags("standard-checked", 2)], { speed: "standard" }));
  add("n2", "Miami → Chicago, 1 large bag", "nationwide", req("nationwide-shipping", loc("hotel", "Hotel in Brickell", "miami"), loc("residence", "233 S Wacker Dr, Chicago, IL 60606", "outside-florida"), [bags("large", 1)], { speed: "economy" }));
  add("n3", "Fort Lauderdale → Los Angeles, 3 bags", "nationwide", req("nationwide-shipping", loc("hotel", "Hotel on Fort Lauderdale Beach", "fort-lauderdale-broward"), loc("residence", "200 N Spring St, Los Angeles, CA 90012", "outside-florida"), [bags("standard-checked", 3)], { speed: "priority" }));
  add("n4", "Miami → London (international, DHL eligible)", "nationwide", req("nationwide-shipping", loc("hotel", "Hotel in Miami Beach", "miami"), loc("residence", "10 Downing St, London, United Kingdom", "outside-florida"), [bags("standard-checked", 1, { weightLbs: 45, lengthIn: 27, widthIn: 19, heightIn: 11 })], { speed: "express" }));
  add("n5", "Measured light-but-bulky bag (dimensional weight)", "nationwide", req("nationwide-shipping", loc("hotel", "Hotel in Miami", "miami"), loc("residence", "1 Main St, Boston, MA 02108", "outside-florida"), [bags("oversized", 1, { weightLbs: 20, lengthIn: 34, widthIn: 24, heightIn: 16 })], { speed: "standard" }));
  add("n6", "Next-day golf clubs to Atlanta", "nationwide", req("nationwide-shipping", loc("hotel", "Resort in Miami", "miami"), loc("residence", "55 Trinity Ave SW, Atlanta, GA 30303", "outside-florida"), [bags("special", 1, { weightLbs: 35, lengthIn: 48, widthIn: 14, heightIn: 14 })], { speed: "next-day" }));
  add("n7", "Overweight piece 160 lb (above carrier limits)", "nationwide", req("nationwide-shipping", loc("business", "Office in Miami", "miami"), loc("business", "100 Congress Ave, Austin, TX 78701", "outside-florida"), [bags("special", 1, { weightLbs: 160, lengthIn: 40, widthIn: 30, heightIn: 20 })]));
  // Custom-quote triggers
  add("c1", "Group of 180 bags (custom quote)", "custom", req("group-event", loc("hotel", "Hotel in Miami Beach", "miami"), loc("cruise-port", "PortMiami", "miami", "portmiami"), [bags("standard-checked", 180)], { groupName: "Incentive group" }));
  add("c2", "Other Florida route: Jacksonville (special route)", "custom", req("luggage-local", loc("hotel", "Hotel in Jacksonville", "other-florida"), loc("airport", "Jacksonville airport", "other-florida"), [bags("standard-checked", 2)]));
  add("c3", "Multiple trucks for an event", "custom", req("truck", loc("venue", "Convention center, Miami Beach", "miami"), loc("venue", "Arena, Miami", "miami"), [bags("cargo", 20, { description: "Event equipment" })], { vehiclesNeeded: "3 box trucks" }));
  add("c4", "Many extra stops", "custom", req("luggage-local", loc("hotel", "Hotel A, Miami", "miami"), loc("airport", "Miami International Airport", "miami", "MIA"), [bags("standard-checked", 6)], { extraStops: Array.from({ length: 6 }, (_, i) => loc("hotel", `Hotel ${i + 2}, Miami`, "miami")) }));
  return s;
}

export type ScenarioResult = {
  id: string;
  label: string;
  group: Scenario["group"];
  decision: string;
  reasons: string[];
  engine: string | null;
  retailCents: number | null;
  costCents: number | null;
  profitCents: number | null;
  marginPercent: number | null;
  manualReview: boolean;
  notes: string[];
  offers?: { level: string; carrier: string; service: string; transitDays: number; retailCents: number; costCents: number; marginPercent: number; manualReview: boolean }[];
};

/** Evaluate one scenario exactly as the public instant flow would (internal view). */
export async function evaluate(sc: Scenario): Promise<ScenarioResult> {
  const r = sc.request;
  const decision = decideRoute(r, await getSetting("thresholds"));
  const base = { id: sc.id, label: sc.label, group: sc.group, decision: decision.route, reasons: decision.reasons, engine: decision.engine };
  const empty = { retailCents: null, costCents: null, profitCents: null, marginPercent: null };
  if (decision.route !== "standard-quote") return { ...base, ...empty, manualReview: false, notes: ["Routed to a written quotation (no instant price)"] };
  if (decision.engine === "storage") {
    const p = priceStorage({ start: new Date(r.storageStart!), end: new Date(r.storageEnd!), pieces: decision.totalPieces, withPickup: r.storageWithPickup, withDelivery: r.storageWithDelivery }, await getActiveRules("storage"));
    return { ...base, retailCents: p.retailCents, costCents: p.costCents, profitCents: p.profitCents, marginPercent: p.marginPercent, manualReview: p.manualReview, notes: p.notes };
  }
  if (decision.engine === "carrier") {
    const q = await quoteNationwide(inputFromRequest(r));
    if (q.status !== "priced") return { ...base, ...empty, manualReview: false, notes: [q.reason, ...(q.carriersFailed.length ? [`Carriers failed: ${q.carriersFailed.join(", ")}`] : [])] };
    const wanted = q.offers.find((o) => o.level === r.speed) ?? q.offers[0];
    return {
      ...base,
      retailCents: wanted.retailCents,
      costCents: wanted.costCents,
      profitCents: wanted.profitCents,
      marginPercent: wanted.marginPercent,
      manualReview: wanted.manualReview,
      notes: [`${q.parcels.length} parcel(s), billable ${q.parcels.reduce((s, p) => s + p.billableWeightLbs, 0)} lb`, ...wanted.notes],
      offers: q.offers.map((o) => ({ level: o.level, carrier: o.carrier, service: o.carrierService, transitDays: o.transitDays, retailCents: o.retailCents, costCents: o.costCents, marginPercent: o.marginPercent, manualReview: o.manualReview })),
    };
  }
  const dist = await maps().distance(r.pickup.address, r.delivery.address);
  const p = priceLocal(
    {
      pickupZone: r.pickup.market,
      deliveryZone: r.delivery.market,
      miles: dist.miles,
      pieces: r.items.map((i) => ({ category: i.category, quantity: i.quantity })),
      pickupLocationType: r.pickup.type,
      deliveryLocationType: r.delivery.type,
      sameDay: r.speed === "same-day",
      urgent: r.speed === "urgent",
      afterHours: r.timeWindow === "after-hours",
    },
    await getActiveRules("local"),
  );
  return { ...base, retailCents: p.retailCents, costCents: p.costCents, profitCents: p.profitCents, marginPercent: p.marginPercent, manualReview: p.manualReview, notes: [`${dist.miles} mi (${dist.source})`, ...p.notes] };
}

export async function runSandbox(user: { id: string; email: string }, opts: { ids?: string[]; notes?: string } = {}) {
  const list = scenarios().filter((s) => !opts.ids?.length || opts.ids.includes(s.id));
  const results: ScenarioResult[] = [];
  for (const sc of list) {
    try {
      results.push(await evaluate(sc));
    } catch (e) {
      results.push({ id: sc.id, label: sc.label, group: sc.group, decision: "error", reasons: [], engine: null, retailCents: null, costCents: null, profitCents: null, marginPercent: null, manualReview: true, notes: [(e as Error).message] });
    }
  }
  const run = await prisma.pricingTestRun.create({ data: { runById: user.id, runByEmail: user.email, scenarioCount: results.length, results: results as object[], notes: opts.notes } });
  return { run, results };
}

export const MIN_SCENARIOS_FOR_APPROVAL = 20;
const APPROVAL_WINDOW_DAYS = 30;

/** Owner approval to switch public instant pricing on (or off). Enabling needs a recent full test run. */
export async function setInstantPricing(
  user: { id: string; email: string; role: string },
  body: { enable: boolean; carrierShipping: boolean; testRunId?: string; statement?: string },
) {
  if (user.role !== "OWNER") throw new HttpError(403, "Only the owner can approve public pricing.");
  let testRunId: string | null = null;
  if (body.enable) {
    if (!body.testRunId) throw new HttpError(400, "Choose the test run you reviewed.");
    const run = await prisma.pricingTestRun.findUnique({ where: { id: body.testRunId } });
    if (!run) throw new HttpError(404, "Test run not found.");
    if (run.scenarioCount < MIN_SCENARIOS_FOR_APPROVAL) throw new HttpError(409, `Run at least ${MIN_SCENARIOS_FOR_APPROVAL} scenarios before approving.`);
    if (Date.now() - run.createdAt.getTime() > APPROVAL_WINDOW_DAYS * 86_400_000) throw new HttpError(409, "That test run is older than 30 days. Run the scenarios again.");
    if (!body.statement || body.statement.trim().length < 10) throw new HttpError(400, "Add a short approval statement (what you reviewed).");
    testRunId = run.id;
  }
  const flags = body.enable
    ? { pricingEnabled: true, instantBookingEnabled: true, carrierShippingEnabled: body.carrierShipping }
    : { pricingEnabled: false, instantBookingEnabled: false, carrierShippingEnabled: false };
  await updateSetting("features", flags, user.email);
  const approval = await prisma.pricingApproval.create({
    data: { action: body.enable ? "ENABLE" : "DISABLE", flags, testRunId, approvedById: user.id, approvedByEmail: user.email, statement: body.statement?.trim() },
  });
  return { approval, flags };
}
