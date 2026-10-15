/**
 * Deterministic guardrails that run around the model (and the scripted fallback):
 * language detection, prohibited-request detection, and an output filter that removes anything
 * the assistant must never say (prices, banned claims, private contact details).
 */
import { contact } from "@/content/site";

export type Lang = "en" | "es";

const ES_WORDS = /\b(hola|gracias|equipaje|maletas?|aeropuerto|crucero|puerto|cu[aá]nto|cuesta|necesito|quiero|puedo|pueden|llevan?|entrega|traslado|hotel(es)? en|ma[nñ]ana|hoy|d[oó]nde|por favor|buenos|buenas|usted|ustedes|mi reserva|rastrear|cotizaci[oó]n|precio|tienen|ayuda|español)\b/i;

/** Detect Spanish vs English from one message (falls back to the previous language). */
export function detectLanguage(text: string, previous: Lang = "en"): Lang {
  const t = text.trim();
  if (!t) return previous;
  if (/[¿¡ñ]|[áéíóú]/i.test(t) && ES_WORDS.test(t)) return "es";
  const es = (t.match(new RegExp(ES_WORDS.source, "gi")) ?? []).length;
  if (es >= 1 && /[¿¡]|\b(de|la|el|los|las|para|con|que)\b/i.test(t)) return "es";
  if (es >= 2) return "es";
  if (/\b(the|please|my|need|want|how|what|can you|luggage|hotel|airport|price)\b/i.test(t)) return "en";
  return previous;
}

export type ProhibitedKind = "moving" | "food" | "hazardous";

/** Requests Express Bags never accepts (form B13/Q14). */
export function detectProhibited(text: string): ProhibitedKind | null {
  const t = text.toLowerCase();
  if (/\b(move|moving|movers?|relocat\w*|mudanza|mudarme|mudar)\b/.test(t) && /\b(house|home|apartment|apt|furniture|household|condo|piano|bedroom|casa|apartamento|muebles)\b/.test(t)) return "moving";
  if (/\b(household move|local move|moving company|mudanza)\b/.test(t)) return "moving";
  if (/\b(food|catering|meals?|groceries|restaurant order|pizza|comida|cater)\b/.test(t) && /\b(deliver\w*|bring|send|entrega\w*|llevar|enviar)\b/.test(t)) return "food";
  if (/\b(explosive|firearm|gun|ammunition|ammo|fireworks|propane|gasoline|hazmat|hazardous|drugs|cannabis|marijuana|weapon|armas?|explosivos?)\b/.test(t)) return "hazardous";
  return null;
}

export const PROHIBITED_REPLY: Record<Lang, Record<ProhibitedKind, string>> = {
  en: {
    moving: "Thanks for asking. Express Bags does not offer household or local moving. We handle luggage logistics, hospitality transfers, courier and last-mile delivery, short-term luggage storage, and cargo-van or box-truck commercial logistics. If any of those fit, I can start a quote for you.",
    food: "Thanks for asking. Express Bags does not deliver food or catering. We handle luggage, hospitality transfers, business courier and last-mile items, storage, and commercial box-truck work. I am happy to help with any of those.",
    hazardous: "I'm sorry, we can't transport hazardous, illegal or restricted items, or anything barred by airline, TSA, port or venue rules. For other items, I can start a quote and our dispatch team will review it.",
  },
  es: {
    moving: "Gracias por preguntar. Express Bags no ofrece mudanzas residenciales ni locales. Ofrecemos logística de equipaje, traslados hoteleros, mensajería y entrega de última milla, almacenamiento de equipaje por corto plazo y logística comercial con furgonetas y camiones de caja. Si alguno le sirve, puedo iniciar su cotización.",
    food: "Gracias por preguntar. Express Bags no entrega comida ni catering. Ofrecemos traslado de equipaje, logística hotelera, mensajería empresarial, almacenamiento y transporte comercial en camión de caja. Con gusto le ayudo con cualquiera de ellos.",
    hazardous: "Lo siento, no transportamos artículos peligrosos, ilegales o restringidos, ni nada prohibido por aerolíneas, TSA, puertos o recintos. Para otros artículos, puedo iniciar una cotización y despacho la revisará.",
  },
};

const PRICE_LINE: Record<Lang, string> = {
  en: "Pricing is quote-based, so I can't give a number here, but I can start your quote and our dispatch team will send a written quotation.",
  es: "Los precios se cotizan por servicio, así que no puedo dar una cifra aquí, pero puedo iniciar su cotización y despacho le enviará una cotización por escrito.",
};

// Dollar amounts, "50 dollars", "$1,200", "US$ 80", "80 USD", "precio de 40"
const MONEY = /(?:US)?\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|dollars?|d[oó]lares)\b/i;
const BANNED = [/\b24\s*\/\s*7\b/gi, /\bguarantee(d|s)?\b/gi, /\balways on[\s-]time\b/gi, /\bzero[\s-]damage\b/gi, /\blicensed\s*(?:and|&)\s*insured\b/gi, /\bgarantizad[oa]s?\b/gi];

/**
 * Final output filter. Drops any sentence that states a price, softens banned absolute claims,
 * and removes contact details that are not the approved public office line.
 */
export function sanitizeReply(text: string, lang: Lang): { text: string; changed: boolean } {
  let changed = false;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const kept: string[] = [];
  let droppedPrice = false;
  for (const s of sentences) {
    if (MONEY.test(s)) {
      droppedPrice = true;
      changed = true;
      continue;
    }
    kept.push(s);
  }
  let out = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  if (droppedPrice && !out.includes(PRICE_LINE[lang])) out = `${out} ${PRICE_LINE[lang]}`.trim();
  for (const re of BANNED) {
    if (re.test(out)) {
      changed = true;
      out = out.replace(re, lang === "es" ? "sujeto a confirmación de despacho" : "subject to dispatch confirmation");
    }
  }
  // Phone numbers other than the public office line, and any personal-looking email, never appear in replies
  const officeDigits = contact.phoneDisplay.replace(/\D/g, "");
  out = out.replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, (m) => {
    if (m.replace(/\D/g, "") === officeDigits) return m;
    changed = true;
    return contact.phoneDisplay;
  });
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => {
    if (contact.emailLive && m.toLowerCase() === contact.email) return m;
    changed = true;
    return lang === "es" ? "nuestra oficina" : "our office";
  });
  return { text: out || PRICE_LINE[lang], changed };
}

/** True when the text contains anything sanitizeReply would remove (used by tests and logging). */
export function violatesOutputRules(text: string): boolean {
  return sanitizeReply(text, "en").changed;
}
