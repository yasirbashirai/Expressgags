/**
 * Scripted assistant used when no AI provider is configured (dev, tests, or before Express Bags connects
 * its own Anthropic account). Keyword routing over the same public knowledge base, in English or Spanish,
 * always ending with a useful next step (quote link, tracking page or office phone). Never states prices.
 */
import { contact, faqs } from "@/content/site";
import type { Lang } from "./guardrails";
import { searchKnowledge } from "./knowledge";

type Reply = { text: string; intent: string };

const T = {
  en: {
    greet: "Hi, I'm the Express Bags assistant. I can explain our services and Florida service areas, start a quote, or help you track a delivery. What do you need moved, and where?",
    quote: "Happy to help you get a quote. Tell me the service (for example hotel to cruise port), the pickup and delivery locations, the date, and how many bags or items. Or start right away at /request-a-quote. Pricing, timing and access are confirmed by our dispatch team in a written quotation.",
    track: "To check a delivery I need your Express Bags reference (it starts with EB-) and one verifier: the booking email, the last 4 digits of the booking phone, or the delivery ZIP code. You can also use /track.",
    price: "Pricing is quote-based because route, timing, volume, vehicle and access vary, so I can't give a number here. Share your route, date and item count, or start at /request-a-quote, and dispatch will send a written quotation.",
    human: `You can reach our office at ${contact.phoneDisplay} (${contact.hours[0].days} ${contact.hours[0].time}). If you'd like a coordinator to call you, share your name and a phone number or email and a short note about what you need.`,
    fallback: `I'm not completely sure about that one. The quickest way is to start a quote at /request-a-quote or call our office at ${contact.phoneDisplay}.`,
    more: "Read more:",
  },
  es: {
    greet: "Hola, soy el asistente de Express Bags. Puedo explicarle nuestros servicios y zonas de Florida, iniciar una cotización o ayudarle a rastrear una entrega. ¿Qué necesita trasladar y a dónde?",
    quote: "Con gusto le ayudo con una cotización. Indíqueme el servicio (por ejemplo, del hotel al puerto de cruceros), los lugares de recogida y entrega, la fecha y cuántas maletas o artículos. También puede empezar en /request-a-quote. El precio, el horario y el acceso los confirma nuestro equipo de despacho en una cotización por escrito.",
    track: "Para revisar una entrega necesito su referencia de Express Bags (empieza con EB-) y un dato de verificación: el correo de la reserva, los últimos 4 dígitos del teléfono o el código postal de entrega. También puede usar /track.",
    price: "Los precios se cotizan según la ruta, el horario, el volumen, el vehículo y el acceso, así que no puedo dar una cifra aquí. Compártame su ruta, fecha y cantidad de artículos, o empiece en /request-a-quote, y despacho le enviará una cotización por escrito.",
    human: `Puede comunicarse con nuestra oficina al ${contact.phoneDisplay}. Si prefiere que un coordinador le llame, compártame su nombre, un teléfono o correo y una breve nota de lo que necesita.`,
    fallback: `No estoy seguro de eso. Lo más rápido es iniciar una cotización en /request-a-quote o llamar a nuestra oficina al ${contact.phoneDisplay}.`,
    more: "Más información:",
  },
};

export function scriptedReply(message: string, lang: Lang): Reply {
  const m = message.toLowerCase();
  const t = T[lang];
  if (/^(hi|hello|hey|hola|buenas|buenos d[ií]as)\b[!. ]*$/i.test(m.trim())) return { text: t.greet, intent: "greet" };
  if (/\b(track|tracking|where is my|status|rastre|seguimiento|d[oó]nde est[aá])/.test(m) || /\beb-\d{6}/i.test(m)) return { text: t.track, intent: "track" };
  if (/\b(price|cost|how much|rate|fee|cu[aá]nto|precio|costo|tarifa)\b/.test(m)) return { text: t.price, intent: "price" };
  if (/\b(person|human|agent|someone|call me|representative|persona|humano|ll[aá]m(en|ame)|hablar con)\b/.test(m)) return { text: t.human, intent: "handoff" };
  if (/\b(quote|book|reserve|need .* (moved|delivered|picked up)|cotiz|reservar|necesito)\b/.test(m)) return { text: t.quote, intent: "quote" };

  const hits = searchKnowledge(message, 2);
  if (hits.length && hits[0].score > 2) {
    const top = hits[0];
    // Knowledge content is English; in Spanish give a Spanish pointer to the right page instead of mixed-language text
    if (lang === "es" && top.kind !== "language") {
      return { text: `Tengo información sobre eso en nuestra página ${top.url}. En resumen, el equipo de despacho confirma ruta, horario y acceso para cada trabajo. Si desea, puedo iniciar su cotización.`, intent: "knowledge" };
    }
    const faq = faqs.find((f) => f.q === top.title);
    const body = (faq?.a ?? top.text).split(/(?<=\.)\s+/).slice(0, 3).join(" ");
    const tail = lang === "es" ? " Si desea, puedo iniciar su cotización." : " If you'd like, I can start a quote for you.";
    return { text: `${body}${tail} ${t.more} ${top.url}`, intent: "knowledge" };
  }
  return { text: t.fallback, intent: "fallback" };
}
