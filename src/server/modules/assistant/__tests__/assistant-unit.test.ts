/**
 * Assistant unit tests (no database, no AI calls): language detection, prohibited-request guardrails,
 * output filter, knowledge search relevance, scripted fallback, link extraction, model redaction.
 */
import { describe, expect, it, vi } from "vitest";

// The Prisma client is constructed on import but never used by these pure tests
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://unit:unit@127.0.0.1:1/unit";
});
import { extractLinks, chunkForStream } from "../chat";
import { detectLanguage, detectProhibited, sanitizeReply, violatesOutputRules } from "../guardrails";
import { knowledgeChunks, searchKnowledge } from "../knowledge";
import { redactForModel } from "../leads";
import { ASSISTANT_RULES, systemPrompt } from "../prompt";
import { scriptedReply } from "../scripted";
import { toWizardDraft } from "../tools";

describe("language detection", () => {
  it("detects Spanish", () => {
    expect(detectLanguage("¿Llevan maletas al aeropuerto?")).toBe("es");
    expect(detectLanguage("Hola, necesito traslado de equipaje al puerto de cruceros")).toBe("es");
    expect(detectLanguage("cuánto cuesta llevar 3 maletas")).toBe("es");
  });
  it("detects English and keeps the previous language for ambiguous input", () => {
    expect(detectLanguage("Do you deliver luggage to MIA?")).toBe("en");
    expect(detectLanguage("EB-261015-7K3P", "es")).toBe("es");
    expect(detectLanguage("ok", "en")).toBe("en");
  });
});

describe("prohibited requests (form B13/Q14)", () => {
  it("declines household moving, food and hazardous items", () => {
    expect(detectProhibited("Can you help me move my apartment furniture to Orlando?")).toBe("moving");
    expect(detectProhibited("Necesito una mudanza de mi casa")).toBe("moving");
    expect(detectProhibited("Can you deliver catering for our event?")).toBe("food");
    expect(detectProhibited("I need to ship fireworks")).toBe("hazardous");
  });
  it("does not flag normal luggage requests", () => {
    expect(detectProhibited("Move 4 suitcases from my hotel to PortMiami")).toBeNull();
    expect(detectProhibited("Group luggage for a corporate event at a hotel")).toBeNull();
  });
});

describe("output filter", () => {
  it("removes any price and adds the quote-based line", () => {
    const r = sanitizeReply("A hotel to PortMiami transfer is about $85 per bag. We can pick up at 10 AM.", "en");
    expect(r.text).not.toMatch(/\$|85/);
    expect(r.text).toMatch(/quote-based/i);
    expect(r.text).toMatch(/10 AM/);
    expect(sanitizeReply("Cuesta 40 dólares por maleta.", "es").text).toMatch(/cotizan/);
  });
  it("softens banned claims and strips non-public contact details", () => {
    expect(violatesOutputRules("We are available 24/7 and delivery is guaranteed.")).toBe(true);
    const r = sanitizeReply("Call Carlos at (305) 874-0832 or cjdelgado@express-bags.com.", "en");
    expect(r.text).not.toMatch(/874|cjdelgado/);
    expect(r.text).toMatch(/\(305\) 783-2860/);
    expect(sanitizeReply("Our office line is (305) 783-2860.", "en").changed).toBe(false);
  });
});

describe("knowledge base", () => {
  it("is built only from public content", () => {
    const all = JSON.stringify(knowledgeChunks());
    expect(all).not.toMatch(/7500\s*NW|874-0832|cjdelgado|Carlos|Delgado|U2|Madonna|76ers/);
    expect(knowledgeChunks().length).toBeGreaterThan(40);
  });
  it("ranks relevant passages first (EN + ES)", () => {
    expect(searchKnowledge("Key West luggage")[0].id).toMatch(/florida-keys|EYW|port-of-key-west/);
    expect(searchKnowledge("Port Everglades cruise")[0].id).toMatch(/port-everglades|fort-lauderdale/);
    expect(searchKnowledge("do you store bags")[0].id).toMatch(/storage|faq/);
    expect(searchKnowledge("maletas crucero").length).toBeGreaterThan(0);
    expect(searchKnowledge("xyzzy")).toEqual([]);
  });
  it("system prompt carries the Q39 guardrails and stays static", () => {
    expect(ASSISTANT_RULES).toMatch(/Never state or estimate a price/);
    expect(ASSISTANT_RULES).toMatch(/moving/);
    expect(ASSISTANT_RULES).toMatch(/English and Spanish/);
    expect(systemPrompt()).toBe(systemPrompt()); // cacheable: byte-identical across calls
    expect(systemPrompt()).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no timestamps
  });
});

describe("scripted fallback", () => {
  it("routes common intents in both languages and never prices", () => {
    expect(scriptedReply("how much does it cost?", "en").intent).toBe("price");
    expect(scriptedReply("how much does it cost?", "en").text).not.toMatch(/\$/);
    expect(scriptedReply("Track my delivery", "en").intent).toBe("track");
    expect(scriptedReply("I want to talk to a person", "en").intent).toBe("handoff");
    const es = scriptedReply("¿Llevan maletas al aeropuerto?", "es");
    expect(es.text).toMatch(/[áéíóú]|cotizaci|despacho/i);
  });
});

describe("helpers", () => {
  it("extracts internal links only", () => {
    expect(extractLinks("Start at /request-a-quote?draft=AbC123xyz or see /service-areas/miami and /track.")).toEqual(["/request-a-quote?draft=AbC123xyz", "/service-areas/miami", "/track"]);
    expect(extractLinks("24/7 and/or https://evil.example/track")).toEqual([]);
  });
  it("chunks text for streaming without losing characters", () => {
    expect(chunkForStream("Hello there, friend.").join("")).toBe("Hello there, friend.");
  });
  it("redacts contact details before sending a quote to the model", () => {
    const r = redactForModel({ contact: { name: "A", email: "a@b.c", phone: "1", company: "Hotel X" }, onsiteContact: "Bob 555", items: [] });
    expect(JSON.stringify(r)).not.toMatch(/a@b\.c|Bob/);
    expect((r.contact as { company: string }).company).toBe("Hotel X");
  });
  it("maps a chat quote to the wizard draft shape", () => {
    const d = toWizardDraft({ serviceType: "cruise", pickup: { type: "hotel", address: "Brickell hotel", market: "miami" }, delivery: { type: "cruise-port", facility: "portmiami", market: "miami" }, items: [{ category: "large", quantity: 3 }] });
    expect(d.delivery?.address).toBe("PortMiami");
    expect(d.items?.[0]).toEqual({ category: "large", quantity: "3", description: "" });
  });
});
