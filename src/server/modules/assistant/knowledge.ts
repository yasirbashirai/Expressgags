/**
 * Assistant knowledge base: built ONLY from approved public website content (src/content/site.ts and
 * src/content/seo-copy.ts), chunked into short passages and searched with BM25. No vector DB needed.
 * Nothing private (pricing rules, customers, staff, costs) ever enters the knowledge base.
 */
import {
  airports,
  careStandard,
  company,
  contact,
  exclusions,
  faqs,
  fleet,
  howItWorks,
  industries,
  markets,
  otherFloridaRoute,
  ports,
  services,
} from "@/content/site";
import { airportCopy, marketCopy, portCopy, serviceCopy } from "@/content/seo-copy";

export type KnowledgeChunk = { id: string; title: string; text: string; url: string; kind: string };

const SITE = "";

function buildChunks(): KnowledgeChunk[] {
  const out: KnowledgeChunk[] = [];
  out.push({
    id: "company",
    kind: "company",
    title: `About ${company.name}`,
    url: `${SITE}/about`,
    text: `${company.description} ${company.strength} Tagline: ${company.tagline} Founded ${company.founded}, headquartered in Miami.`,
  });
  out.push({
    id: "contact",
    kind: "contact",
    title: "Contact, hours and visits",
    url: `${SITE}/contact`,
    text: `Office phone ${contact.phoneDisplay}. Mailing address ${contact.addressLine}. ${contact.visits}. Hours: ${contact.hours.map((h) => `${h.days} ${h.time}`).join("; ")}.`,
  });
  for (const s of services) {
    const c = serviceCopy[s.slug];
    out.push({
      id: `service:${s.slug}`,
      kind: "service",
      title: s.name,
      url: `${SITE}/services/${s.slug}`,
      text: [s.intro, ...s.bullets, `Best for: ${s.audiences.join(", ")}.`, ...(s.notes ?? []), c ? `What to have ready: ${c.prepare.join(", ")}.` : ""].join(" "),
    });
    if (c) {
      out.push({ id: `service-steps:${s.slug}`, kind: "service", title: `${s.name}: how it works`, url: `${SITE}/services/${s.slug}`, text: c.steps.map((x) => `${x.title}: ${x.text}`).join(" ") });
    }
  }
  for (const m of markets) {
    const c = marketCopy[m.slug];
    const marketAirports = airports.filter((a) => m.airports.includes(a.code)).map((a) => `${a.name} (${a.code})`);
    const marketPorts = ports.filter((p) => m.ports.includes(p.slug)).map((p) => p.name);
    out.push({
      id: `market:${m.slug}`,
      kind: "market",
      title: `${m.name}${m.hq ? " (headquarters market)" : ""}`,
      url: `${SITE}/service-areas/${m.slug}`,
      text: [m.summary, `Areas: ${m.areas.join(", ")}.`, marketAirports.length ? `Airports: ${marketAirports.join(", ")}.` : "", marketPorts.length ? `Cruise ports: ${marketPorts.join(", ")}.` : "", c?.intro ?? "", c ? `Common routes: ${c.routes.join("; ")}.` : "", c?.spanishLine ?? ""].join(" "),
    });
    if (c) out.push({ id: `market-tips:${m.slug}`, kind: "market", title: `${m.name}: local planning`, url: `${SITE}/service-areas/${m.slug}`, text: [...c.local.map((x) => `${x.title}: ${x.text}`), `Tips: ${c.tips.join("; ")}.`].join(" ") });
  }
  out.push({ id: "other-route", kind: "market", title: "Routes outside the eight priority markets", url: `${SITE}/service-areas`, text: otherFloridaRoute.note });
  for (const a of airports) {
    const c = airportCopy[a.code];
    out.push({ id: `airport:${a.code}`, kind: "airport", title: `${a.name} (${a.code})${a.officialName ? `, officially ${a.officialName}` : ""}`, url: `${SITE}/airports/${a.slug}`, text: c ? [c.intro, `Routes: ${c.routes.join("; ")}.`, ...c.notes, "Service is subject to terminal rules and confirmed access."].join(" ") : `${a.name}. Service is subject to terminal rules and confirmed access.` });
  }
  for (const p of ports) {
    const c = portCopy[p.slug];
    out.push({ id: `port:${p.slug}`, kind: "port", title: p.name, url: `${SITE}/ports/${p.slug}`, text: c ? [c.intro, `Routes: ${c.routes.join("; ")}.`, ...c.notes, "Service is subject to terminal rules, ship schedules and confirmed access."].join(" ") : `${p.name}. Subject to terminal rules and ship schedules.` });
  }
  faqs.forEach((f, i) => out.push({ id: `faq:${i}`, kind: "faq", title: f.q, url: `${SITE}/faq`, text: f.a }));
  out.push({ id: "care-standard", kind: "policy", title: careStandard.title, url: `${SITE}/about`, text: `${careStandard.lead} ${careStandard.points.join(". ")}. ${careStandard.closing}` });
  out.push({ id: "how-it-works", kind: "policy", title: "How a job runs", url: `${SITE}/request-a-quote`, text: howItWorks.map((h) => `${h.step}: ${h.text}`).join(" ") });
  out.push({ id: "exclusions", kind: "policy", title: "What we do not do / prohibited items", url: `${SITE}/terms#prohibited-items`, text: `Express Bags does not offer: ${exclusions.join("; ")}. Restricted, fragile, high-value, oversized, perishable or unusual items require advance review and written acceptance.` });
  out.push({ id: "fleet", kind: "fleet", title: "Fleet and capacity", url: `${SITE}/fleet`, text: fleet.map((f) => `${f.name}: ${f.use}`).join(". ") + ". Vehicles are matched to the job by dispatch." });
  out.push({ id: "industries", kind: "industries", title: "Industries we serve", url: `${SITE}/industries`, text: industries.map((x) => `${x.name}: ${x.text}`).join(" ") });
  out.push({ id: "pricing", kind: "policy", title: "Pricing and quotes", url: `${SITE}/request-a-quote`, text: "Pricing is custom and quote-based because route, time, volume, labor, vehicle, access, urgency and storage needs vary. A complete request produces the fastest accurate written quotation. There is no public rate card." });
  out.push({ id: "tracking", kind: "policy", title: "Tracking a delivery", url: `${SITE}/track`, text: "Track a delivery on the Track Your Delivery page with your Express Bags reference (EB-…) plus the booking email, the last 4 digits of the booking phone, or the delivery ZIP code. Carrier tracking numbers are shown separately from Express Bags references." });
  out.push({ id: "accounts", kind: "policy", title: "Business accounts and the client portal", url: `${SITE}/business-accounts`, text: "Hotels, DMCs, corporate and commercial clients can apply for a business account: centralized invoicing, PO and cost-center support, recurring routes, proof of delivery and a dedicated dispatch contact. Customers can sign in to the client portal to see quotes, orders, invoices and documents." });
  out.push({ id: "spanish", kind: "language", title: "Atención en español", url: `${SITE}/request-a-quote`, text: "Ofrecemos entrega y traslado de equipaje, mensajería, entrega de última milla y logística con furgonetas y camiones de caja en Miami, Broward, los Cayos de Florida, West Palm Beach, Orlando, Tampa, Fort Myers y Cabo Cañaveral. Solicite su cotización; el equipo de despacho confirma ruta, vehículo, horario y acceso. Teléfono de oficina " + contact.phoneDisplay + "." });
  return out.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() }));
}

// ---------------------------------------------------------------- BM25

const STOP = new Set("a an and are as at be by can do does for from has have how i if in is it me my of on or our the their to us we what when where which who will with you your el la los las de del y en un una que por para con es se su sus lo al".split(" "));

/** Light normalisation + very small EN/ES synonym folding so "maletas" finds luggage, "crucero" finds cruise, etc. */
const SYNONYMS: Record<string, string> = {
  maleta: "luggage", maletas: "luggage", equipaje: "luggage", bags: "luggage", bag: "luggage", suitcase: "luggage", suitcases: "luggage",
  crucero: "cruise", cruceros: "cruise", puerto: "port", aeropuerto: "airport", airports: "airport", hotel: "hotel", hoteles: "hotel", hotels: "hotel",
  almacenamiento: "storage", guardar: "storage", store: "storage", rastrear: "track", rastreo: "track", tracking: "track", seguimiento: "track",
  precio: "price", cuesta: "price", costo: "price", cost: "price", pricing: "price", prices: "price", rates: "price", quote: "price",
  cotizacion: "price", cotización: "price", camion: "truck", camión: "truck", trucks: "truck", furgoneta: "van", vans: "van",
  mensajeria: "courier", mensajería: "courier", cayos: "keys", ships: "ship", sailing: "ship", flights: "flight", vuelo: "flight",
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => SYNONYMS[t] ?? (t.endsWith("s") && t.length > 4 ? t.slice(0, -1) : t));
}

type Index = { chunks: KnowledgeChunk[]; docs: string[][]; df: Map<string, number>; avgLen: number };
let index: Index | null = null;

function getIndex(): Index {
  if (index) return index;
  const chunks = buildChunks();
  const docs = chunks.map((c) => tokenize(`${c.title} ${c.title} ${c.text}`)); // title weighted ×2
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  index = { chunks, docs, df, avgLen: docs.reduce((s, d) => s + d.length, 0) / docs.length };
  return index;
}

export function knowledgeChunks() {
  return getIndex().chunks;
}

/** BM25 search over the public knowledge base. */
export function searchKnowledge(query: string, limit = 5): (KnowledgeChunk & { score: number })[] {
  const { chunks, docs, df, avgLen } = getIndex();
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const N = docs.length, k1 = 1.4, b = 0.75;
  const scored = docs.map((d, i) => {
    let score = 0;
    for (const t of q) {
      const f = d.filter((x) => x === t).length;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen)));
    }
    return { ...chunks[i], score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b2) => b2.score - a.score).slice(0, limit);
}

/** Compact, stable rendering of the whole knowledge base for the cached system prompt. */
export function knowledgeDigest(): string {
  return getIndex()
    .chunks.map((c) => `## ${c.title} (${c.url})\n${c.text}`)
    .join("\n\n");
}
