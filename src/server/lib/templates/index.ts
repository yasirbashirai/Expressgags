/**
 * All customer + staff message templates (email + SMS), English and Spanish.
 * Templates receive a plain data snapshot and never query the database, so previews,
 * retries and tests render exactly what the customer receives.
 *
 * Privacy rules baked in: only the assigned driver's FIRST name may appear, and only in
 * customer messages about that booking. Staff alerts never include customer payment data.
 * House style: commas instead of em dashes; no absolute promises.
 */
import { contact } from "@/content/site";
import { renderEmailHtml, renderEmailText, siteUrl, type EmailBlock, type Lang } from "./layout";

export type { Lang } from "./layout";

export type TemplateData = {
  customerName?: string;
  reference?: string;
  trackUrl?: string;
  serviceDate?: string;
  window?: string;
  pickup?: string;
  delivery?: string;
  pieces?: number;
  driverFirstName?: string;
  carrierTracking?: { carrier: string; number: string }[];
  podTime?: string;
  podRecipient?: string;
  podPieces?: number;
  amount?: string;
  quotationRef?: string;
  quotationUrl?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  dueDate?: string;
  surveyUrl?: string;
  accountUrl?: string;
  exceptionLabel?: string;
  exceptionDetail?: string;
  severity?: string;
  rating?: number;
  comment?: string;
  claimRef?: string;
  adminUrl?: string;
  storageMessage?: string;
  unsubscribeUrl?: string;
};

export const TEMPLATE_KEYS = [
  "order.confirmed",
  "order.driver_assigned",
  "order.en_route",
  "order.picked_up",
  "order.at_facility",
  "order.transferred_to_carrier",
  "order.in_transit",
  "order.out_for_delivery",
  "order.delivered",
  "order.cancelled",
  "order.update",
  "quotation.sent",
  "quotation.accepted",
  "invoice.issued",
  "payment.receipt",
  "customer.welcome",
  "survey.request",
  "storage.reminder",
  "staff.exception_alert",
  "staff.low_rating",
  "staff.claim_submitted",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Templates sent to staff (always English, email only). */
export const STAFF_TEMPLATES: TemplateKey[] = ["staff.exception_alert", "staff.low_rating", "staff.claim_submitted"];

export type Rendered = { subject: string; html: string; text: string; sms: string };

type Def = (d: TemplateData) => { email: EmailBlock & { subject: string }; sms: string };

const hi = (lang: Lang, name?: string) => (lang === "es" ? (name ? `Hola ${name},` : "Hola,") : name ? `Hi ${name},` : "Hello,");
const ref = (d: TemplateData) => d.reference ?? "";
const phone = contact.phoneDisplay;

function routeDetails(lang: Lang, d: TemplateData): [string, string][] {
  const L = lang === "es" ? { r: "Referencia", date: "Fecha", win: "Ventana", from: "Recogida", to: "Entrega", p: "Piezas" } : { r: "Reference", date: "Date", win: "Window", from: "Pickup", to: "Delivery", p: "Pieces" };
  const rows: [string, string][] = [];
  if (d.reference) rows.push([L.r, d.reference]);
  if (d.serviceDate) rows.push([L.date, d.serviceDate]);
  if (d.window) rows.push([L.win, d.window]);
  if (d.pickup) rows.push([L.from, d.pickup]);
  if (d.delivery) rows.push([L.to, d.delivery]);
  if (typeof d.pieces === "number") rows.push([L.p, String(d.pieces)]);
  return rows;
}

const trackCta = (lang: Lang, d: TemplateData) => (d.trackUrl ? { label: lang === "es" ? "Seguir mi entrega" : "Track your delivery", url: d.trackUrl } : undefined);

/** Generic status update builder (order lifecycle). */
function statusTemplate(lang: Lang, d: TemplateData, en: { subj: string; title: string; body: string; sms: string }, es: { subj: string; title: string; body: string; sms: string }) {
  const t = lang === "es" ? es : en;
  const email: EmailBlock & { subject: string } = { subject: t.subj, preheader: t.body, title: t.title, paragraphs: [hi(lang, d.customerName), t.body], details: routeDetails(lang, d), cta: trackCta(lang, d) };
  return {
    email,
    sms: t.sms,
  };
}

const DEFS: Record<TemplateKey, Record<Lang, Def>> = {
  "order.confirmed": {
    en: (d) => statusTemplate("en", d,
      { subj: `Booking confirmed, ${ref(d)}`, title: "Your booking is confirmed", body: "Thank you for choosing Express Bags. Your order is confirmed and our dispatch team is planning the route, vehicle and timing. We will update you as each step happens.", sms: `Express Bags: booking ${ref(d)} confirmed. We will text updates as your job moves. Track: ${d.trackUrl ?? ""}` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `Reserva confirmada, ${ref(d)}`, title: "Su reserva está confirmada", body: "Gracias por elegir Express Bags. Su orden está confirmada y nuestro equipo de despacho está planificando la ruta, el vehículo y el horario. Le avisaremos en cada paso.", sms: `Express Bags: reserva ${ref(d)} confirmada. Le enviaremos actualizaciones. Seguimiento: ${d.trackUrl ?? ""}` }),
  },
  "order.driver_assigned": {
    en: (d) => statusTemplate("en", d,
      { subj: `Your driver is assigned, ${ref(d)}`, title: d.driverFirstName ? `${d.driverFirstName} is your Express Bags driver` : "Your driver is assigned",
        body: `${d.driverFirstName ? `${d.driverFirstName} will handle your job.` : "A trained Express Bags driver will handle your job."} For any change, call our dispatch line at ${phone} and mention your reference.`,
        sms: `Express Bags: ${d.driverFirstName ?? "your driver"} is assigned to ${ref(d)}. Dispatch: ${phone}` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `Conductor asignado, ${ref(d)}`, title: d.driverFirstName ? `${d.driverFirstName} es su conductor de Express Bags` : "Su conductor está asignado",
        body: `${d.driverFirstName ? `${d.driverFirstName} se encargará de su servicio.` : "Un conductor capacitado de Express Bags se encargará de su servicio."} Para cualquier cambio, llame a despacho al ${phone} e indique su referencia.`,
        sms: `Express Bags: ${d.driverFirstName ?? "su conductor"} está asignado a ${ref(d)}. Despacho: ${phone}` }),
  },
  "order.en_route": {
    en: (d) => statusTemplate("en", d,
      { subj: `Driver on the way, ${ref(d)}`, title: "Your driver is on the way", body: `${d.driverFirstName ? `${d.driverFirstName} is` : "Your driver is"} heading to the pickup location. Please have your items and the authorized contact ready.`, sms: `Express Bags: ${d.driverFirstName ?? "your driver"} is on the way for ${ref(d)}. Please have items ready.` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `Conductor en camino, ${ref(d)}`, title: "Su conductor va en camino", body: `${d.driverFirstName ? `${d.driverFirstName} va` : "Su conductor va"} hacia el lugar de recogida. Tenga listos sus artículos y al contacto autorizado.`, sms: `Express Bags: ${d.driverFirstName ?? "su conductor"} va en camino para ${ref(d)}. Tenga todo listo.` }),
  },
  "order.picked_up": {
    en: (d) => statusTemplate("en", d,
      { subj: `Picked up, ${ref(d)}`, title: "Your items are picked up", body: "Every piece was counted, checked and loaded. The chain of custody is recorded from here to the handoff.", sms: `Express Bags: ${ref(d)} picked up, ${d.pieces ?? ""} pieces counted and secured.` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `Recogido, ${ref(d)}`, title: "Sus artículos fueron recogidos", body: "Cada pieza fue contada, revisada y cargada. La cadena de custodia queda registrada hasta la entrega.", sms: `Express Bags: ${ref(d)} recogido, ${d.pieces ?? ""} piezas contadas y aseguradas.` }),
  },
  "order.at_facility": {
    en: (d) => statusTemplate("en", d,
      { subj: `At our facility, ${ref(d)}`, title: "Your items are at our facility", body: "Your items are checked in at our processing or storage area and remain in our custody until the next step.", sms: `Express Bags: ${ref(d)} is checked in at our facility.` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `En nuestras instalaciones, ${ref(d)}`, title: "Sus artículos están en nuestras instalaciones", body: "Sus artículos están registrados en nuestra área de procesamiento o almacenamiento y permanecen bajo nuestra custodia hasta el siguiente paso.", sms: `Express Bags: ${ref(d)} registrado en nuestras instalaciones.` }),
  },
  "order.transferred_to_carrier": {
    en: (d) => {
      const t = statusTemplate("en", d,
        { subj: `Handed to carrier, ${ref(d)}`, title: "Your shipment is with the carrier", body: "We handed your items to the carrier for the long-distance leg. Your Express Bags reference stays your main reference.", sms: `Express Bags: ${ref(d)} handed to carrier.${d.carrierTracking?.[0] ? ` Carrier tracking (${d.carrierTracking[0].carrier}): ${d.carrierTracking[0].number}` : ""}` },
        { subj: "", title: "", body: "", sms: "" });
      t.email.details = [...(t.email.details ?? []), ...(d.carrierTracking ?? []).map((c) => [`Carrier tracking (${c.carrier})`, c.number] as [string, string])];
      t.email.footnote = "Carrier tracking numbers belong to the carrier. They are different from your Express Bags reference.";
      return t;
    },
    es: (d) => {
      const t = statusTemplate("es", d,
        { subj: "", title: "", body: "", sms: "" },
        { subj: `Entregado al transportista, ${ref(d)}`, title: "Su envío está con el transportista", body: "Entregamos sus artículos al transportista para el tramo de larga distancia. Su referencia de Express Bags sigue siendo la principal.", sms: `Express Bags: ${ref(d)} entregado al transportista.${d.carrierTracking?.[0] ? ` Rastreo del transportista (${d.carrierTracking[0].carrier}): ${d.carrierTracking[0].number}` : ""}` });
      t.email.details = [...(t.email.details ?? []), ...(d.carrierTracking ?? []).map((c) => [`Rastreo del transportista (${c.carrier})`, c.number] as [string, string])];
      t.email.footnote = "Los números de rastreo del transportista son distintos de su referencia de Express Bags.";
      return t;
    },
  },
  "order.in_transit": {
    en: (d) => statusTemplate("en", d,
      { subj: `In transit, ${ref(d)}`, title: "Your items are in transit", body: "Your items are moving toward the destination. We will let you know when they are out for delivery.", sms: `Express Bags: ${ref(d)} is in transit.` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `En tránsito, ${ref(d)}`, title: "Sus artículos están en tránsito", body: "Sus artículos van hacia el destino. Le avisaremos cuando salgan para la entrega.", sms: `Express Bags: ${ref(d)} está en tránsito.` }),
  },
  "order.out_for_delivery": {
    en: (d) => statusTemplate("en", d,
      { subj: `Out for delivery, ${ref(d)}`, title: "Out for delivery", body: "Your items are on the final leg. Please make sure the authorized recipient is available at the delivery point.", sms: `Express Bags: ${ref(d)} is out for delivery. Please have the recipient available.` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `En reparto, ${ref(d)}`, title: "En camino a la entrega", body: "Sus artículos están en el último tramo. Asegúrese de que el destinatario autorizado esté disponible.", sms: `Express Bags: ${ref(d)} va en camino a la entrega. Tenga disponible al destinatario.` }),
  },
  "order.delivered": {
    en: (d) => {
      const t = statusTemplate("en", d,
        { subj: `Delivered, ${ref(d)}`, title: "Delivered and documented", body: "Your items were re-counted and released to the authorized recipient. The proof of delivery is saved with your order.", sms: `Express Bags: ${ref(d)} delivered${d.podRecipient ? ` to ${d.podRecipient}` : ""}${d.podTime ? ` at ${d.podTime}` : ""}. Thank you!` },
        { subj: "", title: "", body: "", sms: "" });
      t.email.details = [...(t.email.details ?? []), ...(d.podTime ? [["Delivered at", d.podTime] as [string, string]] : []), ...(d.podRecipient ? [["Received by", d.podRecipient] as [string, string]] : []), ...(typeof d.podPieces === "number" ? [["Pieces delivered", String(d.podPieces)] as [string, string]] : [])];
      return t;
    },
    es: (d) => {
      const t = statusTemplate("es", d,
        { subj: "", title: "", body: "", sms: "" },
        { subj: `Entregado, ${ref(d)}`, title: "Entregado y documentado", body: "Sus artículos fueron contados de nuevo y entregados al destinatario autorizado. El comprobante de entrega queda guardado con su orden.", sms: `Express Bags: ${ref(d)} entregado${d.podRecipient ? ` a ${d.podRecipient}` : ""}${d.podTime ? ` a las ${d.podTime}` : ""}. ¡Gracias!` });
      t.email.details = [...(t.email.details ?? []), ...(d.podTime ? [["Hora de entrega", d.podTime] as [string, string]] : []), ...(d.podRecipient ? [["Recibido por", d.podRecipient] as [string, string]] : []), ...(typeof d.podPieces === "number" ? [["Piezas entregadas", String(d.podPieces)] as [string, string]] : [])];
      return t;
    },
  },
  "order.cancelled": {
    en: (d) => statusTemplate("en", d,
      { subj: `Order cancelled, ${ref(d)}`, title: "Your order was cancelled", body: `Your order ${ref(d)} is cancelled. If this is unexpected, or you would like to rebook, please call our office at ${phone}.`, sms: `Express Bags: ${ref(d)} was cancelled. Questions? Call ${phone}.` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `Orden cancelada, ${ref(d)}`, title: "Su orden fue cancelada", body: `Su orden ${ref(d)} está cancelada. Si no lo esperaba o desea reservar de nuevo, llame a nuestra oficina al ${phone}.`, sms: `Express Bags: ${ref(d)} fue cancelada. ¿Preguntas? Llame al ${phone}.` }),
  },
  "order.update": {
    en: (d) => statusTemplate("en", d,
      { subj: `Update on your order, ${ref(d)}`, title: "An update on your order", body: `${d.exceptionLabel ? `${d.exceptionLabel}. ` : ""}Our dispatch team is working on it and will confirm the next step with you. For anything urgent, call ${phone}.`, sms: `Express Bags: update on ${ref(d)}${d.exceptionLabel ? `, ${d.exceptionLabel.toLowerCase()}` : ""}. Dispatch will confirm next steps. ${phone}` },
      { subj: "", title: "", body: "", sms: "" }),
    es: (d) => statusTemplate("es", d,
      { subj: "", title: "", body: "", sms: "" },
      { subj: `Actualización de su orden, ${ref(d)}`, title: "Una actualización sobre su orden", body: `${d.exceptionLabel ? `${d.exceptionLabel}. ` : ""}Nuestro equipo de despacho está trabajando en ello y le confirmará el siguiente paso. Para algo urgente, llame al ${phone}.`, sms: `Express Bags: actualización de ${ref(d)}. Despacho confirmará los siguientes pasos. ${phone}` }),
  },
  "quotation.sent": {
    en: (d) => ({
      email: { subject: `Your Express Bags quotation ${d.quotationRef ?? ""}`, preheader: "Review and approve your quotation online.", title: "Your quotation is ready", paragraphs: [hi("en", d.customerName), "Your written quotation is ready to review. You can approve it online in a minute."], details: d.quotationRef ? [["Quotation", d.quotationRef]] : [], cta: d.quotationUrl ? { label: "Review quotation", url: d.quotationUrl } : undefined },
      sms: `Express Bags: your quotation ${d.quotationRef ?? ""} is ready. Review: ${d.quotationUrl ?? ""}`,
    }),
    es: (d) => ({
      email: { subject: `Su cotización de Express Bags ${d.quotationRef ?? ""}`, preheader: "Revise y apruebe su cotización en línea.", title: "Su cotización está lista", paragraphs: [hi("es", d.customerName), "Su cotización escrita está lista. Puede aprobarla en línea en un minuto."], details: d.quotationRef ? [["Cotización", d.quotationRef]] : [], cta: d.quotationUrl ? { label: "Ver cotización", url: d.quotationUrl } : undefined },
      sms: `Express Bags: su cotización ${d.quotationRef ?? ""} está lista. Ver: ${d.quotationUrl ?? ""}`,
    }),
  },
  "quotation.accepted": {
    en: (d) => ({
      email: { subject: `Quotation approved, ${d.quotationRef ?? ""}`, preheader: "Thank you, your quotation is approved.", title: "Thank you, your quotation is approved", paragraphs: [hi("en", d.customerName), "We received your approval. Our dispatch team will confirm the operating plan, and any deposit due is shown on your quotation page."], details: [...(d.quotationRef ? [["Quotation", d.quotationRef] as [string, string]] : []), ...(d.reference ? [["Order", d.reference] as [string, string]] : [])], cta: d.trackUrl ? { label: "Track your order", url: d.trackUrl } : d.quotationUrl ? { label: "View quotation", url: d.quotationUrl } : undefined },
      sms: `Express Bags: quotation ${d.quotationRef ?? ""} approved. Order ${d.reference ?? ""} created. Thank you!`,
    }),
    es: (d) => ({
      email: { subject: `Cotización aprobada, ${d.quotationRef ?? ""}`, preheader: "Gracias, su cotización está aprobada.", title: "Gracias, su cotización está aprobada", paragraphs: [hi("es", d.customerName), "Recibimos su aprobación. Nuestro equipo de despacho confirmará el plan operativo, y cualquier depósito pendiente aparece en la página de su cotización."], details: [...(d.quotationRef ? [["Cotización", d.quotationRef] as [string, string]] : []), ...(d.reference ? [["Orden", d.reference] as [string, string]] : [])], cta: d.trackUrl ? { label: "Seguir mi orden", url: d.trackUrl } : d.quotationUrl ? { label: "Ver cotización", url: d.quotationUrl } : undefined },
      sms: `Express Bags: cotización ${d.quotationRef ?? ""} aprobada. Orden ${d.reference ?? ""} creada. ¡Gracias!`,
    }),
  },
  "invoice.issued": {
    en: (d) => ({
      email: { subject: `Invoice ${d.invoiceNumber ?? ""} from Express Bags`, preheader: "Your invoice is ready.", title: "Your invoice is ready", paragraphs: [hi("en", d.customerName), "Your invoice is ready. You can view, download and pay it online."], details: [...(d.invoiceNumber ? [["Invoice", d.invoiceNumber] as [string, string]] : []), ...(d.amount ? [["Amount", d.amount] as [string, string]] : []), ...(d.dueDate ? [["Due", d.dueDate] as [string, string]] : [])], cta: d.invoiceUrl ? { label: "View invoice", url: d.invoiceUrl } : undefined },
      sms: `Express Bags: invoice ${d.invoiceNumber ?? ""}${d.amount ? ` for ${d.amount}` : ""} is ready. View: ${d.invoiceUrl ?? ""}`,
    }),
    es: (d) => ({
      email: { subject: `Factura ${d.invoiceNumber ?? ""} de Express Bags`, preheader: "Su factura está lista.", title: "Su factura está lista", paragraphs: [hi("es", d.customerName), "Su factura está lista. Puede verla, descargarla y pagarla en línea."], details: [...(d.invoiceNumber ? [["Factura", d.invoiceNumber] as [string, string]] : []), ...(d.amount ? [["Importe", d.amount] as [string, string]] : []), ...(d.dueDate ? [["Vence", d.dueDate] as [string, string]] : [])], cta: d.invoiceUrl ? { label: "Ver factura", url: d.invoiceUrl } : undefined },
      sms: `Express Bags: factura ${d.invoiceNumber ?? ""}${d.amount ? ` por ${d.amount}` : ""} lista. Ver: ${d.invoiceUrl ?? ""}`,
    }),
  },
  "payment.receipt": {
    en: (d) => ({
      email: { subject: `Payment received${d.amount ? `, ${d.amount}` : ""}`, preheader: "Thank you, we received your payment.", title: "Thank you, payment received", paragraphs: [hi("en", d.customerName), "We received your payment. Keep this email as your receipt."], details: [...(d.amount ? [["Amount", d.amount] as [string, string]] : []), ...(d.reference ? [["Order", d.reference] as [string, string]] : []), ...(d.invoiceNumber ? [["Invoice", d.invoiceNumber] as [string, string]] : []), ...(d.quotationRef ? [["Quotation", d.quotationRef] as [string, string]] : [])], cta: d.accountUrl ? { label: "View in your account", url: d.accountUrl } : undefined },
      sms: `Express Bags: payment of ${d.amount ?? ""} received. Thank you!`,
    }),
    es: (d) => ({
      email: { subject: `Pago recibido${d.amount ? `, ${d.amount}` : ""}`, preheader: "Gracias, recibimos su pago.", title: "Gracias, pago recibido", paragraphs: [hi("es", d.customerName), "Recibimos su pago. Conserve este correo como comprobante."], details: [...(d.amount ? [["Importe", d.amount] as [string, string]] : []), ...(d.reference ? [["Orden", d.reference] as [string, string]] : []), ...(d.invoiceNumber ? [["Factura", d.invoiceNumber] as [string, string]] : []), ...(d.quotationRef ? [["Cotización", d.quotationRef] as [string, string]] : [])], cta: d.accountUrl ? { label: "Ver en su cuenta", url: d.accountUrl } : undefined },
      sms: `Express Bags: pago de ${d.amount ?? ""} recibido. ¡Gracias!`,
    }),
  },
  "customer.welcome": {
    en: (d) => ({
      email: { subject: "Welcome to your Express Bags account", preheader: "Your account is ready.", title: "Welcome to Express Bags", paragraphs: [hi("en", d.customerName), "Your account is ready. You can request quotes, approve quotations, follow your orders and download documents and invoices in one place."], cta: d.accountUrl ? { label: "Open my account", url: d.accountUrl } : undefined },
      sms: "Express Bags: your account is ready. Thank you for joining!",
    }),
    es: (d) => ({
      email: { subject: "Bienvenido a su cuenta de Express Bags", preheader: "Su cuenta está lista.", title: "Bienvenido a Express Bags", paragraphs: [hi("es", d.customerName), "Su cuenta está lista. Puede solicitar cotizaciones, aprobarlas, seguir sus órdenes y descargar documentos y facturas en un solo lugar."], cta: d.accountUrl ? { label: "Abrir mi cuenta", url: d.accountUrl } : undefined },
      sms: "Express Bags: su cuenta está lista. ¡Gracias por registrarse!",
    }),
  },
  "survey.request": {
    en: (d) => ({
      email: { subject: `How did we do? ${d.reference ?? ""}`, preheader: "One quick question about your delivery.", title: "How did we do?", paragraphs: [hi("en", d.customerName), "Thank you for trusting Express Bags. Could you rate your experience? It takes less than a minute and helps our team keep its standard."], details: d.reference ? [["Order", d.reference]] : [], cta: d.surveyUrl ? { label: "Rate your experience", url: d.surveyUrl } : undefined },
      sms: `Express Bags: how did we do on ${d.reference ?? "your order"}? 1-minute rating: ${d.surveyUrl ?? ""}`,
    }),
    es: (d) => ({
      email: { subject: `¿Cómo lo hicimos? ${d.reference ?? ""}`, preheader: "Una pregunta rápida sobre su entrega.", title: "¿Cómo lo hicimos?", paragraphs: [hi("es", d.customerName), "Gracias por confiar en Express Bags. ¿Podría calificar su experiencia? Toma menos de un minuto y ayuda a nuestro equipo a mantener su estándar."], details: d.reference ? [["Orden", d.reference]] : [], cta: d.surveyUrl ? { label: "Calificar mi experiencia", url: d.surveyUrl } : undefined },
      sms: `Express Bags: ¿cómo lo hicimos con ${d.reference ?? "su orden"}? Califique en 1 minuto: ${d.surveyUrl ?? ""}`,
    }),
  },
  "storage.reminder": {
    en: (d) => ({
      email: { subject: `Storage reminder, ${d.reference ?? ""}`, preheader: "A reminder about your stored items.", title: "A reminder about your stored items", paragraphs: [hi("en", d.customerName), d.storageMessage ?? "This is a reminder about your luggage storage booking. Please contact us if your plans change."], details: d.reference ? [["Reference", d.reference]] : [], cta: trackCta("en", d) },
      sms: `Express Bags: storage reminder for ${d.reference ?? ""}. ${d.storageMessage ?? `Questions? ${phone}`}`.slice(0, 300),
    }),
    es: (d) => ({
      email: { subject: `Recordatorio de almacenamiento, ${d.reference ?? ""}`, preheader: "Un recordatorio sobre sus artículos almacenados.", title: "Recordatorio sobre sus artículos almacenados", paragraphs: [hi("es", d.customerName), d.storageMessage ?? "Le recordamos su reserva de almacenamiento de equipaje. Contáctenos si sus planes cambian."], details: d.reference ? [["Referencia", d.reference]] : [], cta: trackCta("es", d) },
      sms: `Express Bags: recordatorio de almacenamiento ${d.reference ?? ""}. ${d.storageMessage ?? `¿Preguntas? ${phone}`}`.slice(0, 300),
    }),
  },
  "staff.exception_alert": {
    en: (d) => ({
      email: { subject: `[${d.severity ?? "ALERT"}] Exception on ${d.reference ?? "an order"}: ${d.exceptionLabel ?? ""}`, preheader: d.exceptionDetail ?? "", title: `${d.severity ?? "High"} exception: ${d.exceptionLabel ?? ""}`, paragraphs: ["An order exception needs attention in the admin exceptions inbox.", d.exceptionDetail ?? ""].filter(Boolean), details: d.reference ? [["Order", d.reference]] : [], cta: d.adminUrl ? { label: "Open exceptions inbox", url: d.adminUrl } : undefined },
      sms: `EB alert: ${d.severity} exception on ${d.reference}: ${d.exceptionLabel}`,
    }),
    es: (d) => DEFS["staff.exception_alert"].en(d),
  },
  "staff.low_rating": {
    en: (d) => ({
      email: { subject: `Low rating (${d.rating ?? "?"}/5) on ${d.reference ?? "an order"}`, preheader: d.comment ?? "", title: `A customer rated ${d.reference ?? "an order"} ${d.rating ?? "?"} of 5`, paragraphs: ["Please follow up with the customer. No review request was shown to them.", d.comment ? `Comment: "${d.comment}"` : "No comment was left."], details: d.reference ? [["Order", d.reference]] : [], cta: d.adminUrl ? { label: "Open order", url: d.adminUrl } : undefined },
      sms: `EB: ${d.rating}/5 rating on ${d.reference}. Please follow up.`,
    }),
    es: (d) => DEFS["staff.low_rating"].en(d),
  },
  "staff.claim_submitted": {
    en: (d) => ({
      email: { subject: `Protection claim submitted ${d.claimRef ?? ""}`, preheader: "A protection claim needs review.", title: "A protection claim needs review", paragraphs: ["A customer submitted a protection claim with evidence. Review it in the claims queue."], details: [...(d.claimRef ? [["Claim", d.claimRef] as [string, string]] : []), ...(d.reference ? [["Order", d.reference] as [string, string]] : [])], cta: d.adminUrl ? { label: "Open claims", url: d.adminUrl } : undefined },
      sms: `EB: claim ${d.claimRef} submitted on ${d.reference}.`,
    }),
    es: (d) => DEFS["staff.claim_submitted"].en(d),
  },
};

/** Render a template into email (subject/html/text) and SMS text. */
export function renderTemplate(key: TemplateKey, lang: Lang, data: TemplateData): Rendered {
  const useLang: Lang = STAFF_TEMPLATES.includes(key) ? "en" : lang === "es" ? "es" : "en";
  const def = DEFS[key][useLang](data);
  const block = { ...def.email, unsubscribeUrl: data.unsubscribeUrl };
  return {
    subject: def.email.subject.replace(/,\s*$/, "").trim(),
    html: renderEmailHtml(block, useLang),
    text: renderEmailText(block, useLang),
    sms: def.sms.replace(/\s+/g, " ").trim(),
  };
}

/** Realistic sample data for admin previews (fictional, no real customer or staff names). */
export function sampleData(key: TemplateKey): TemplateData {
  const web = siteUrl();
  return {
    customerName: "Alex",
    reference: "EB-261020-7K3P",
    trackUrl: `${web}/track?ref=EB-261020-7K3P`,
    serviceDate: "Tue, Oct 20",
    window: "Morning (8 AM – 12 PM)",
    pickup: "Hotel, Miami Beach",
    delivery: "PortMiami cruise terminal",
    pieces: 6,
    driverFirstName: "Sam",
    carrierTracking: key === "order.transferred_to_carrier" ? [{ carrier: "UPS", number: "1Z999AA10123456784" }] : undefined,
    podTime: "11:42 AM",
    podRecipient: "Front desk",
    podPieces: 6,
    amount: "$480.00",
    quotationRef: "EB-QT-261018-9XQ2",
    quotationUrl: `${web}/q/sample`,
    invoiceNumber: "EB-INV-000123",
    invoiceUrl: `${web}/invoice/sample`,
    dueDate: "Nov 19, 2026",
    surveyUrl: `${web}/survey/sample`,
    accountUrl: `${web}/account`,
    exceptionLabel: "Carrier delay",
    exceptionDetail: "Inbound flight delayed 90 minutes, pickup window moved.",
    severity: "HIGH",
    rating: 2,
    comment: "Pickup was later than expected.",
    claimRef: "EB-CL-261021-4M8T",
    adminUrl: `${web}/admin`,
    storageMessage: "Your storage booking ends tomorrow at 10:00 AM.",
  };
}
