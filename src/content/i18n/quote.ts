/**
 * Quote wizard copy in English and Spanish (es-US, written for Florida customers, not a literal translation).
 *
 * `QuoteStrings` is the single shape both languages must satisfy, so TypeScript (plus a unit test)
 * guarantees every English string has a Spanish counterpart. Option VALUES never change with the
 * language (they are the API contract in src/lib/quote-schema.ts); only their labels do.
 *
 * House rules apply in both languages: no prices, no guarantees, same-day always subject to
 * capacity and dispatch confirmation, "protection" never "insurance".
 */
import type { ServiceType } from "@/lib/quote-schema";

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];
export const isLang = (v: unknown): v is Lang => v === "en" || v === "es";

type StepKey = "service" | "route" | "storage" | "group" | "timing" | "timingStorage" | "items" | "contact" | "review";

export type QuoteStrings = {
  langLabel: string;
  switchLabel: string;
  stepOf: (n: number, total: number) => string;
  progressLabel: string;
  stepsLabel: string;
  steps: Record<StepKey, { title: string; short: string; intro: string }>;
  attention: (n: number) => string;
  loading: string;
  back: string;
  continue: string;
  send: string;
  sending: string;
  tryAgain: string;
  noPayment: string;
  sendError: string;
  sendErrorHelp: string;
  optional: string;
  select: string;
  // Service step
  chooseService: string;
  services: Record<ServiceType, { title: string; text: string; note?: string }>;
  // Locations
  locationType: string;
  airport: string;
  cruisePort: string;
  area: string;
  areaFromFacility: string;
  addressLabel: { airport: string; port: string; other: string };
  addressPlaceholder: { hotel: string; airport: string; other: string };
  locationNotes: string;
  locationNotesPlaceholder: string;
  removeStop: string;
  pickup: string;
  delivery: string;
  origin: string;
  destination: string;
  stop: (n: number) => string;
  addStop: string;
  nationwideNote: string;
  locationTypes: Record<"hotel" | "airport" | "cruise-port" | "residence" | "business" | "venue" | "private-aviation" | "storage" | "other", string>;
  otherFlorida: string;
  otherFloridaNote: string;
  outsideFlorida: string;
  // Storage
  storageWindow: string;
  storageWindowText: string;
  storageArea: string;
  storageStart: string;
  storageEnd: string;
  addPickup: string;
  addPickupText: string;
  addDelivery: string;
  addDeliveryText: string;
  pickupBeforeStorage: string;
  deliveryAfterStorage: string;
  availabilityChecking: string;
  availabilityOk: string;
  availabilityLimited: string;
  // Group
  customQuote: string;
  customQuoteText: string;
  program: string;
  groupName: string;
  groupNamePlaceholder: string;
  eventName: string;
  eventNamePlaceholder: string;
  firstDate: string;
  lastDate: string;
  passengers: string;
  hotelsOrVenues: string;
  involvesAirport: string;
  involvesCruise: string;
  onsiteCoordination: string;
  vehicleNeeds: string;
  vehicleNeedsPlaceholder: string;
  mainPickup: string;
  mainDelivery: string;
  additionalLocation: (n: number) => string;
  addLocation: string;
  // Timing
  pickupDate: string;
  serviceDate: string;
  neededBy: string;
  completedBy: string;
  deadlinePlaceholder: string;
  windowStorage: string;
  windowGroup: string;
  windowPickup: string;
  speedShipping: string;
  speedLocal: string;
  speedShippingHint: string;
  speedLocalHint: string;
  sailingDate: string;
  groupTimingNote: string;
  timeWindows: Record<"early-morning" | "morning" | "midday" | "afternoon" | "evening" | "after-hours" | "flexible", string>;
  speeds: Record<"scheduled" | "same-day" | "urgent" | "economy" | "standard" | "priority" | "express" | "next-day", { label: string; hint: string }>;
  // Items
  itemN: (n: number) => string;
  bagTypeN: (n: number) => string;
  remove: string;
  removeItem: (n: number) => string;
  whatIsIt: string;
  whatIsItPlaceholder: string;
  bagType: string;
  describeItem: string;
  describeItemPlaceholder: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  dimsNote: string;
  quantity: string;
  decrease: string;
  increase: string;
  addItem: string;
  addBagType: string;
  totalPieces: string;
  travelers: string;
  flightDetails: string;
  flightPlaceholder: string;
  cruiseLine: string;
  ship: string;
  vehicleAndLabor: string;
  vehiclePreference: string;
  loadingHelp: string;
  loadingHelpPlaceholder: string;
  recurring: string;
  recurringText: string;
  staging: string;
  stagingPlaceholder: string;
  accessDetails: string;
  accessCargo: string;
  accessLuggage: string;
  specialHandling: string;
  specialHandlingPlaceholder: string;
  itemCategories: Record<"carry-on" | "standard-checked" | "large" | "oversized" | "special" | "cargo", string>;
  vehicles: Record<string, string>;
  // Contact
  fullName: string;
  company: string;
  email: string;
  phone: string;
  bestWay: string;
  onsiteContact: string;
  onsitePlaceholder: string;
  whoFor: string;
  howHeard: string;
  anythingElse: string;
  attachments: string;
  attachmentsHelp: (max: number) => string;
  attaching: string;
  chooseFiles: string;
  filesSkipped: (n: number) => string;
  removeFile: (name: string) => string;
  preferredContact: Record<"email" | "phone" | "whatsapp" | "text", string>;
  billing: Record<"individual" | "company-account" | "hotel-or-dmc" | "event-organizer" | "other", string>;
  leadSources: Record<"referral" | "repeat-client" | "hotel-concierge" | "partner" | "google-search" | "google-business-profile" | "paid-ad" | "social-media" | "event" | "other", string>;
  // Protection (only when the module is live)
  protectionTitle: string;
  protectionText: string;
  protectionNone: string;
  protectionUpTo: (amount: string) => string;
  protectionPerOrder: string;
  protectionTerms: string;
  // Review
  review: {
    service: string;
    origin: string;
    storage: string;
    program: string;
    from: (d: string) => string;
    to: (d: string) => string;
    by: (d: string) => string;
    timing: string;
    items: string;
    item: string;
    contact: string;
    attachments: string;
    files: (n: number) => string;
    protection: string;
    notSet: string;
    notProvided: string;
    edit: string;
    editLabel: (label: string) => string;
    storageRange: (start: string, end: string) => string;
  };
  prohibitedConfirm: [string, string, string];
  contactConfirm: [string, string, string];
  // Success
  success: {
    title: string;
    defaultMessage: string;
    reference: string;
    next: string;
    step1: { t: string; d: string };
    step2Custom: { t: string; d: string };
    step2: { t: string; d: (email: string) => string };
    step3: { t: string; d: string };
    another: string;
  };
  // Instant price
  instant: {
    title: string;
    textShipping: string;
    textLocal: string;
    complete: string;
    tickFirst: string;
    see: string;
    checking: string;
    unavailable404: string;
    sendBelow: string;
    loadError: string;
    refresh: string;
    totalNote: (minutes: number) => string;
    level: string;
    about: (days: number) => string;
    includes: string;
    estimated: string;
    book: (amount: string) => string;
    secure: string;
    pricesUpdated: string;
    bookError: string;
  };
};

const en: QuoteStrings = {
  langLabel: "English",
  switchLabel: "Language",
  stepOf: (n, total) => `Step ${n} of ${total}`,
  progressLabel: "Quote progress",
  stepsLabel: "Steps",
  steps: {
    service: { title: "What do you need?", short: "Service", intro: "Choose the option that fits best. You can change it at any time." },
    route: { title: "Pickup and delivery", short: "Route", intro: "Where should we collect, and where should everything go?" },
    storage: { title: "Storage details", short: "Storage", intro: "Tell us when the bags arrive and when they need to leave storage." },
    group: { title: "Group or event details", short: "Program", intro: "A few details about the program so we can plan vehicles, labor and timing." },
    timing: { title: "Date and timing", short: "Timing", intro: "When do you need us?" },
    timingStorage: { title: "Drop-off timing", short: "Timing", intro: "When do you need us?" },
    items: { title: "What are we moving?", short: "Items", intro: "Count and size help us assign the right vehicle and team." },
    contact: { title: "Your contact details", short: "Contact", intro: "Where should we send your written quotation?" },
    review: { title: "Review and send", short: "Review", intro: "Check the details, confirm, and send. No payment is taken." },
  },
  attention: (n) => (n === 1 ? "One field needs your attention." : `${n} fields need your attention.`),
  loading: "Loading",
  back: "Back",
  continue: "Continue",
  send: "Send quote request",
  sending: "Sending…",
  tryAgain: "Try again",
  noPayment: "No payment needed to request a quote",
  sendError: "We couldn't send your request just now. Your details are saved on this device.",
  sendErrorHelp: "Please try again, or call our office at",
  optional: "Optional",
  select: "Select…",
  chooseService: "Choose a service",
  services: {
    "luggage-local": { title: "Local luggage pickup & delivery", text: "Hotel, home, airport, port or venue, anywhere in our Florida markets." },
    airport: { title: "Airport luggage", text: "Arrivals and departures at MIA, FLL, EYW, PBI, MCO, TPA and RSW." },
    cruise: { title: "Cruise-port luggage", text: "Hotel-to-ship, ship-to-airport and other port transfers." },
    storage: { title: "Luggage storage", text: "Short-term holding between itineraries, with optional pickup or delivery." },
    "group-event": { title: "Group, VIP or event logistics", text: "Tours, teams, artists, conventions and multi-vehicle programs.", note: "Custom quotation" },
    courier: { title: "Courier & last-mile delivery", text: "Scheduled and time-sensitive business deliveries with proof of delivery." },
    truck: { title: "Cargo van or box truck", text: "Pallets, equipment and commercial routes, up to 26-foot trucks." },
    "nationwide-shipping": { title: "Ship luggage across the U.S.", text: "Door-to-door shipping beyond Florida, with Express Bags pickup.", note: "Pricing confirmed by quotation" },
  },
  locationType: "Location type",
  airport: "Airport",
  cruisePort: "Cruise port",
  area: "Area",
  areaFromFacility: "Filled in for you from the airport or port",
  addressLabel: { airport: "Terminal, airline or meeting point", port: "Terminal or meeting point", other: "Address, ZIP code or place name" },
  addressPlaceholder: { hotel: "Hotel name and city", airport: "e.g. Terminal D baggage claim, flight arrival", other: "Street address or ZIP code" },
  locationNotes: "Notes for this location",
  locationNotesPlaceholder: "Gate code, loading dock, contact on site…",
  removeStop: "Remove stop",
  pickup: "Pickup",
  delivery: "Delivery",
  origin: "Origin (Express Bags pickup)",
  destination: "Destination",
  stop: (n) => `Stop ${n}`,
  addStop: "Add a stop between pickup and delivery",
  nationwideNote:
    "Express Bags picks up your luggage first, then hands it to a trusted national carrier for delivery. We confirm the best option and the price in your written quotation.",
  locationTypes: {
    hotel: "Hotel or resort",
    airport: "Airport",
    "cruise-port": "Cruise port",
    residence: "Home or vacation rental",
    business: "Business",
    venue: "Venue, arena or convention center",
    "private-aviation": "Private aviation terminal",
    storage: "Express Bags storage",
    other: "Other location",
  },
  otherFlorida: "Other Florida route (special quote)",
  otherFloridaNote: "Other Florida routes may be considered by special quotation when route, capacity, timing, access and pricing are confirmed.",
  outsideFlorida: "Outside Florida",
  storageWindow: "Storage window",
  storageWindowText: "Short-term holding when check-in, flight or cruise times don't line up. Availability, duration and item restrictions are confirmed in your quote.",
  storageArea: "Storage area",
  storageStart: "Drop-off (or pickup) date and time",
  storageEnd: "Retrieval (or delivery) date and time",
  addPickup: "Add pickup",
  addPickupText: "We collect the bags and bring them to storage.",
  addDelivery: "Add delivery",
  addDeliveryText: "We deliver the bags from storage later.",
  pickupBeforeStorage: "Pickup before storage",
  deliveryAfterStorage: "Delivery after storage",
  availabilityChecking: "Checking storage space for these dates…",
  availabilityOk: "Space available for these dates. We confirm it in your quote.",
  availabilityLimited: "Limited space for these dates. We will confirm availability with you.",
  customQuote: "Custom quotation.",
  customQuoteText: "Group, VIP and event programs are planned and priced individually by our team, based on vehicles, labor, timing, staging and coordination.",
  program: "The program",
  groupName: "Group or organization name",
  groupNamePlaceholder: "e.g. Corporate incentive group",
  eventName: "Event, tour or program",
  eventNamePlaceholder: "e.g. Convention, team trip, cruise program",
  firstDate: "First service date",
  lastDate: "Last service date",
  passengers: "Estimated passengers",
  hotelsOrVenues: "Number of hotels or venues",
  involvesAirport: "Involves an airport",
  involvesCruise: "Involves a cruise",
  onsiteCoordination: "On-site coordination needed",
  vehicleNeeds: "Vehicle needs, if known",
  vehicleNeedsPlaceholder: "e.g. two 26-foot trucks, not sure",
  mainPickup: "Main pickup location",
  mainDelivery: "Main delivery location",
  additionalLocation: (n) => `Additional location ${n}`,
  addLocation: "Add another pickup or delivery location",
  pickupDate: "Pickup date",
  serviceDate: "Service date",
  neededBy: "Needed at destination by",
  completedBy: "Must be completed by",
  deadlinePlaceholder: "e.g. before 3 PM, check-in time, sailing time",
  windowStorage: "Preferred drop-off window",
  windowGroup: "Typical service window",
  windowPickup: "Preferred pickup window",
  speedShipping: "Delivery speed",
  speedLocal: "How soon?",
  speedShippingHint: "Transit times are approximate and confirmed in your quote.",
  speedLocalHint: "Same-day and urgent service may be available, subject to capacity and dispatch confirmation.",
  sailingDate: "Sailing date",
  groupTimingNote: "Exact timings for each movement are planned with you in the quotation.",
  timeWindows: {
    "early-morning": "Early morning (before 8 AM)",
    morning: "Morning (8 AM – 12 PM)",
    midday: "Midday (11 AM – 2 PM)",
    afternoon: "Afternoon (12 PM – 5 PM)",
    evening: "Evening (5 PM – 9 PM)",
    "after-hours": "After hours",
    flexible: "Flexible",
  },
  speeds: {
    scheduled: { label: "Scheduled", hint: "Planned for your date and window" },
    "same-day": { label: "Same day", hint: "Subject to capacity and dispatch confirmation" },
    urgent: { label: "Urgent", hint: "As soon as dispatch can confirm" },
    economy: { label: "Economy", hint: "About 5 to 7 business days" },
    standard: { label: "Standard", hint: "About 4 business days" },
    priority: { label: "Priority", hint: "About 3 business days" },
    express: { label: "Express", hint: "About 2 business days" },
    "next-day": { label: "Next day", hint: "When available" },
  },
  itemN: (n) => `Item ${n}`,
  bagTypeN: (n) => `Bag type ${n}`,
  remove: "Remove",
  removeItem: (n) => `Remove item ${n}`,
  whatIsIt: "What is it?",
  whatIsItPlaceholder: "e.g. 4 pallets of event materials, documents, equipment cases",
  bagType: "Bag type",
  describeItem: "Describe the item",
  describeItemPlaceholder: "e.g. golf bag, guitar case, stroller",
  weight: "Weight (lbs)",
  length: "Length (in)",
  width: "Width (in)",
  height: "Height (in)",
  dimsNote: "Carriers can charge by size as well as weight, so accurate dimensions keep your quote accurate.",
  quantity: "Quantity",
  decrease: "Decrease quantity",
  increase: "Increase quantity",
  addItem: "Add another item",
  addBagType: "Add another bag type",
  totalPieces: "Total pieces:",
  travelers: "Number of travelers",
  flightDetails: "Flight details",
  flightPlaceholder: "Airline, flight number and arrival or departure time",
  cruiseLine: "Cruise line",
  ship: "Ship",
  vehicleAndLabor: "Vehicle and labor",
  vehiclePreference: "Vehicle size preference",
  loadingHelp: "Loading help needed",
  loadingHelpPlaceholder: "e.g. driver plus one helper",
  recurring: "This is a recurring route",
  recurringText: "Daily, weekly or scheduled deliveries we should plan as an account.",
  staging: "Staging, loading or helper requirements",
  stagingPlaceholder: "e.g. bag tagging by room, staging in the lobby, load-in at the venue",
  accessDetails: "Access details",
  accessCargo: "Loading dock, stairs, elevator, parking, delivery hours",
  accessLuggage: "Stairs, parking, bell desk, terminal or gate instructions",
  specialHandling: "Special handling",
  specialHandlingPlaceholder: "Fragile, high-value, oversized or temperature-sensitive items",
  itemCategories: {
    "carry-on": "Carry-on",
    "standard-checked": "Standard checked bag",
    large: "Large bag",
    oversized: "Oversized bag",
    special: "Special item (golf clubs, instruments, equipment)",
    cargo: "Cargo / business item",
  },
  vehicles: {
    "Cargo van": "Cargo van",
    "15-foot box truck": "15-foot box truck",
    "20-foot box truck": "20-foot box truck",
    "26-foot box truck": "26-foot box truck",
    "Not sure, please recommend": "Not sure, please recommend",
  },
  fullName: "Full name",
  company: "Company or hotel",
  email: "Email",
  phone: "Phone",
  bestWay: "Best way to reach you",
  onsiteContact: "On-site contact, if different",
  onsitePlaceholder: "Name and phone of the person handing over or receiving",
  whoFor: "Who is this for?",
  howHeard: "How did you hear about us?",
  anythingElse: "Anything else we should know?",
  attachments: "Attachments",
  attachmentsHelp: (max) => `Manifests, rooming lists, itineraries or photos. Up to ${max} files, 10 MB each.`,
  attaching: "Attaching…",
  chooseFiles: "Choose files",
  filesSkipped: (n) => `${n} file${n > 1 ? "s" : ""} could not be attached. You can still send your request and share files with our team afterwards.`,
  removeFile: (name) => `Remove ${name}`,
  preferredContact: { email: "Email", phone: "Phone call", whatsapp: "WhatsApp", text: "Text message" },
  billing: {
    individual: "Individual / personal",
    "company-account": "Company account",
    "hotel-or-dmc": "Hotel, resort or DMC",
    "event-organizer": "Event organizer",
    other: "Other",
  },
  leadSources: {
    referral: "Referral",
    "repeat-client": "I'm a returning client",
    "hotel-concierge": "Hotel or concierge",
    partner: "Travel or business partner",
    "google-search": "Google search",
    "google-business-profile": "Google Maps / Business Profile",
    "paid-ad": "Online ad",
    "social-media": "Social media",
    event: "Event or trade show",
    other: "Other",
  },
  protectionTitle: "Optional luggage protection",
  protectionText: "Add an Express Bags protection plan to this request. The plan and its terms are confirmed in your written quotation.",
  protectionNone: "No protection plan",
  protectionUpTo: (amount) => `Up to ${amount}`,
  protectionPerOrder: "Maximum benefit applies to the whole order, not per bag.",
  protectionTerms: "Plan terms",
  review: {
    service: "Service",
    origin: "Origin",
    storage: "Storage",
    program: "Program",
    from: (d) => `from ${d}`,
    to: (d) => `to ${d}`,
    by: (d) => `by ${d}`,
    timing: "Timing",
    items: "Items",
    item: "item",
    contact: "Contact",
    attachments: "Attachments",
    files: (n) => `${n} file(s)`,
    protection: "Protection",
    notSet: "Not set",
    notProvided: "Not provided",
    edit: "Edit",
    editLabel: (label) => `Edit ${label}`,
    storageRange: (start, end) => `${start} to ${end}`,
  },
  prohibitedConfirm: ["I confirm my items do not include illegal, hazardous or prohibited goods, and I have read the ", "prohibited-items policy", "."],
  contactConfirm: ["I agree that Express Bags may contact me about this request. See our ", "privacy policy", "."],
  success: {
    title: "Request received",
    defaultMessage: "Thank you. Our dispatch team is reviewing your request.",
    reference: "Your reference",
    next: "What happens next",
    step1: { t: "Dispatch reviews your request", d: "We check the route, vehicle, labor, timing and any airport, port or venue access requirements." },
    step2Custom: { t: "We plan your program", d: "A coordinator may contact you to confirm manifests, locations and timings, then sends a written quotation." },
    step2: { t: "You receive a written quotation", d: (email) => `Your quote, with the included scope and assumptions, is sent${email ? ` to ${email}` : ""}.` },
    step3: { t: "Approve and book", d: "Once you approve, we confirm the booking and assign your team. Same-day service is subject to capacity and dispatch confirmation." },
    another: "Start another request",
  },
  instant: {
    title: "Book instantly",
    textShipping: "Choose an Express Bags shipping level, including our pickup and handling.",
    textLocal: "Get your Express Bags price now and book online, or send the request for a written quote.",
    complete: "Your details are complete.",
    tickFirst: "Tick both confirmations above to see your price.",
    see: "See my instant price",
    checking: "Checking routes, capacity rules and prices…",
    unavailable404: "Instant prices are not available right now. Send your request and we will reply with a written quote.",
    sendBelow: "Send your request below and our dispatch team will quote it.",
    loadError: "We couldn't load an instant price. You can still send your request below.",
    refresh: "Refresh price",
    totalNote: (m) => `Total for this booking. Price held for ${m} minutes.`,
    level: "Shipping level",
    about: (d) => `About ${d} business day${d === 1 ? "" : "s"} after handoff`,
    includes: "Includes Express Bags pickup, handling and one tracked carrier label per bag. Transit times are carrier estimates, not promises.",
    estimated: " Some sizes were estimated from your bag types; we confirm measurements at pickup.",
    book: (amount) => `Book & pay ${amount}`,
    secure: "Secure checkout. Prefer a written quote? Use “Send quote request” below.",
    pricesUpdated: "Prices were updated. Please refresh your price.",
    bookError: "We couldn't start your booking. Please try again or send your request below.",
  },
};

const es: QuoteStrings = {
  langLabel: "Español",
  switchLabel: "Idioma",
  stepOf: (n, total) => `Paso ${n} de ${total}`,
  progressLabel: "Progreso de la cotización",
  stepsLabel: "Pasos",
  steps: {
    service: { title: "¿Qué necesita?", short: "Servicio", intro: "Elija la opción que mejor se ajuste. Puede cambiarla en cualquier momento." },
    route: { title: "Recogida y entrega", short: "Ruta", intro: "¿Dónde recogemos y a dónde llevamos todo?" },
    storage: { title: "Detalles del almacenamiento", short: "Almacenaje", intro: "Indique cuándo llegan las maletas y cuándo deben salir del almacén." },
    group: { title: "Detalles del grupo o evento", short: "Programa", intro: "Algunos datos del programa para planificar vehículos, personal y horarios." },
    timing: { title: "Fecha y horario", short: "Horario", intro: "¿Cuándo nos necesita?" },
    timingStorage: { title: "Horario de entrega en almacén", short: "Horario", intro: "¿Cuándo nos necesita?" },
    items: { title: "¿Qué vamos a mover?", short: "Artículos", intro: "La cantidad y el tamaño nos ayudan a asignar el vehículo y el equipo adecuados." },
    contact: { title: "Sus datos de contacto", short: "Contacto", intro: "¿A dónde le enviamos su cotización por escrito?" },
    review: { title: "Revisar y enviar", short: "Revisión", intro: "Revise los datos, confirme y envíe. No se realiza ningún cobro." },
  },
  attention: (n) => (n === 1 ? "Un campo necesita su atención." : `${n} campos necesitan su atención.`),
  loading: "Cargando",
  back: "Atrás",
  continue: "Continuar",
  send: "Enviar solicitud de cotización",
  sending: "Enviando…",
  tryAgain: "Intentar de nuevo",
  noPayment: "Solicitar una cotización no requiere pago",
  sendError: "No pudimos enviar su solicitud en este momento. Sus datos quedaron guardados en este dispositivo.",
  sendErrorHelp: "Inténtelo de nuevo o llame a nuestra oficina al",
  optional: "Opcional",
  select: "Seleccione…",
  chooseService: "Elija un servicio",
  services: {
    "luggage-local": { title: "Recogida y entrega local de equipaje", text: "Hotel, residencia, aeropuerto, puerto o recinto, en cualquiera de nuestros mercados de Florida." },
    airport: { title: "Equipaje en aeropuertos", text: "Llegadas y salidas en MIA, FLL, EYW, PBI, MCO, TPA y RSW." },
    cruise: { title: "Equipaje de cruceros", text: "Del hotel al barco, del barco al aeropuerto y otros traslados al puerto." },
    storage: { title: "Almacenamiento de maletas", text: "Resguardo temporal entre itinerarios, con recogida o entrega opcional." },
    "group-event": { title: "Grupos, VIP o eventos", text: "Giras, equipos, artistas, convenciones y programas con varios vehículos.", note: "Cotización personalizada" },
    courier: { title: "Mensajería y última milla", text: "Entregas empresariales programadas y urgentes, con prueba de entrega." },
    truck: { title: "Furgoneta de carga o camión de caja", text: "Pallets, equipo y rutas comerciales, con camiones de hasta 26 pies." },
    "nationwide-shipping": { title: "Envío de maletas a todo EE. UU.", text: "Envío puerta a puerta fuera de Florida, con recogida de Express Bags.", note: "Precio confirmado en la cotización" },
  },
  locationType: "Tipo de lugar",
  airport: "Aeropuerto",
  cruisePort: "Puerto de cruceros",
  area: "Zona",
  areaFromFacility: "Se completa automáticamente según el aeropuerto o el puerto",
  addressLabel: { airport: "Terminal, aerolínea o punto de encuentro", port: "Terminal o punto de encuentro", other: "Dirección, código postal o nombre del lugar" },
  addressPlaceholder: { hotel: "Nombre del hotel y ciudad", airport: "p. ej. reclamo de equipaje de la terminal D, llegada del vuelo", other: "Dirección o código postal" },
  locationNotes: "Notas para este lugar",
  locationNotesPlaceholder: "Código de acceso, muelle de carga, contacto en el lugar…",
  removeStop: "Quitar parada",
  pickup: "Recogida",
  delivery: "Entrega",
  origin: "Origen (recogida de Express Bags)",
  destination: "Destino",
  stop: (n) => `Parada ${n}`,
  addStop: "Agregar una parada entre la recogida y la entrega",
  nationwideNote:
    "Express Bags recoge primero su equipaje y luego lo entrega a una transportadora nacional de confianza. Confirmamos la mejor opción y el precio en su cotización por escrito.",
  locationTypes: {
    hotel: "Hotel o resort",
    airport: "Aeropuerto",
    "cruise-port": "Puerto de cruceros",
    residence: "Residencia o alquiler vacacional",
    business: "Empresa",
    venue: "Recinto, estadio o centro de convenciones",
    "private-aviation": "Terminal de aviación privada",
    storage: "Almacén de Express Bags",
    other: "Otro lugar",
  },
  otherFlorida: "Otra ruta en Florida (cotización especial)",
  otherFloridaNote: "Otras rutas dentro de Florida pueden considerarse mediante cotización especial cuando se confirmen la ruta, la capacidad, el horario, el acceso y el precio.",
  outsideFlorida: "Fuera de Florida",
  storageWindow: "Periodo de almacenamiento",
  storageWindowText: "Resguardo temporal cuando el check-in, el vuelo o el crucero no coinciden. La disponibilidad, la duración y las restricciones se confirman en su cotización.",
  storageArea: "Zona de almacenamiento",
  storageStart: "Fecha y hora de entrega (o recogida)",
  storageEnd: "Fecha y hora de retiro (o entrega)",
  addPickup: "Agregar recogida",
  addPickupText: "Recogemos las maletas y las llevamos al almacén.",
  addDelivery: "Agregar entrega",
  addDeliveryText: "Entregamos las maletas desde el almacén más tarde.",
  pickupBeforeStorage: "Recogida antes del almacenamiento",
  deliveryAfterStorage: "Entrega después del almacenamiento",
  availabilityChecking: "Verificando espacio en el almacén para estas fechas…",
  availabilityOk: "Hay espacio para estas fechas. Lo confirmamos en su cotización.",
  availabilityLimited: "Espacio limitado para estas fechas. Le confirmaremos la disponibilidad.",
  customQuote: "Cotización personalizada.",
  customQuoteText: "Los programas de grupos, VIP y eventos los planifica y cotiza nuestro equipo de forma individual, según vehículos, personal, horarios, preparación y coordinación.",
  program: "El programa",
  groupName: "Nombre del grupo u organización",
  groupNamePlaceholder: "p. ej. grupo corporativo de incentivos",
  eventName: "Evento, gira o programa",
  eventNamePlaceholder: "p. ej. convención, viaje de equipo, programa de crucero",
  firstDate: "Primera fecha de servicio",
  lastDate: "Última fecha de servicio",
  passengers: "Pasajeros estimados",
  hotelsOrVenues: "Cantidad de hoteles o recintos",
  involvesAirport: "Incluye un aeropuerto",
  involvesCruise: "Incluye un crucero",
  onsiteCoordination: "Se necesita coordinación en el lugar",
  vehicleNeeds: "Vehículos necesarios, si los conoce",
  vehicleNeedsPlaceholder: "p. ej. dos camiones de 26 pies, no estoy seguro",
  mainPickup: "Lugar principal de recogida",
  mainDelivery: "Lugar principal de entrega",
  additionalLocation: (n) => `Lugar adicional ${n}`,
  addLocation: "Agregar otro lugar de recogida o entrega",
  pickupDate: "Fecha de recogida",
  serviceDate: "Fecha del servicio",
  neededBy: "Debe llegar al destino antes de",
  completedBy: "Debe completarse antes de",
  deadlinePlaceholder: "p. ej. antes de las 3 PM, hora de check-in, hora de zarpe",
  windowStorage: "Horario preferido para la entrega en almacén",
  windowGroup: "Horario habitual del servicio",
  windowPickup: "Horario preferido de recogida",
  speedShipping: "Velocidad de entrega",
  speedLocal: "¿Para cuándo?",
  speedShippingHint: "Los tiempos de tránsito son aproximados y se confirman en su cotización.",
  speedLocalHint: "El servicio el mismo día o urgente puede estar disponible, según capacidad y confirmación de despacho.",
  sailingDate: "Fecha de zarpe",
  groupTimingNote: "Los horarios exactos de cada traslado se planifican con usted en la cotización.",
  timeWindows: {
    "early-morning": "Temprano (antes de las 8 AM)",
    morning: "Mañana (8 AM – 12 PM)",
    midday: "Mediodía (11 AM – 2 PM)",
    afternoon: "Tarde (12 PM – 5 PM)",
    evening: "Noche (5 PM – 9 PM)",
    "after-hours": "Fuera de horario",
    flexible: "Flexible",
  },
  speeds: {
    scheduled: { label: "Programado", hint: "Planificado para su fecha y horario" },
    "same-day": { label: "Mismo día", hint: "Según capacidad y confirmación de despacho" },
    urgent: { label: "Urgente", hint: "Tan pronto como despacho pueda confirmar" },
    economy: { label: "Económico", hint: "Unos 5 a 7 días hábiles" },
    standard: { label: "Estándar", hint: "Unos 4 días hábiles" },
    priority: { label: "Prioritario", hint: "Unos 3 días hábiles" },
    express: { label: "Exprés", hint: "Unos 2 días hábiles" },
    "next-day": { label: "Día siguiente", hint: "Cuando esté disponible" },
  },
  itemN: (n) => `Artículo ${n}`,
  bagTypeN: (n) => `Tipo de maleta ${n}`,
  remove: "Quitar",
  removeItem: (n) => `Quitar artículo ${n}`,
  whatIsIt: "¿Qué es?",
  whatIsItPlaceholder: "p. ej. 4 pallets de materiales para eventos, documentos, estuches de equipo",
  bagType: "Tipo de maleta",
  describeItem: "Describa el artículo",
  describeItemPlaceholder: "p. ej. bolsa de golf, estuche de guitarra, coche de bebé",
  weight: "Peso (lb)",
  length: "Largo (pulg.)",
  width: "Ancho (pulg.)",
  height: "Alto (pulg.)",
  dimsNote: "Las transportadoras pueden cobrar por tamaño además de por peso, por eso las medidas exactas mantienen su cotización precisa.",
  quantity: "Cantidad",
  decrease: "Disminuir cantidad",
  increase: "Aumentar cantidad",
  addItem: "Agregar otro artículo",
  addBagType: "Agregar otro tipo de maleta",
  totalPieces: "Total de piezas:",
  travelers: "Cantidad de viajeros",
  flightDetails: "Datos del vuelo",
  flightPlaceholder: "Aerolínea, número de vuelo y hora de llegada o salida",
  cruiseLine: "Naviera",
  ship: "Barco",
  vehicleAndLabor: "Vehículo y personal",
  vehiclePreference: "Tamaño de vehículo preferido",
  loadingHelp: "Ayuda de carga necesaria",
  loadingHelpPlaceholder: "p. ej. conductor y un ayudante",
  recurring: "Es una ruta recurrente",
  recurringText: "Entregas diarias, semanales o programadas que debemos planificar como cuenta.",
  staging: "Requisitos de preparación, carga o ayudantes",
  stagingPlaceholder: "p. ej. etiquetado por habitación, preparación en el lobby, carga en el recinto",
  accessDetails: "Detalles de acceso",
  accessCargo: "Muelle de carga, escaleras, ascensor, estacionamiento, horario de entregas",
  accessLuggage: "Escaleras, estacionamiento, botones, instrucciones de terminal o puerta",
  specialHandling: "Manejo especial",
  specialHandlingPlaceholder: "Artículos frágiles, de alto valor, sobredimensionados o sensibles a la temperatura",
  itemCategories: {
    "carry-on": "Equipaje de mano",
    "standard-checked": "Maleta documentada estándar",
    large: "Maleta grande",
    oversized: "Maleta sobredimensionada",
    special: "Artículo especial (palos de golf, instrumentos, equipo)",
    cargo: "Carga / artículo empresarial",
  },
  vehicles: {
    "Cargo van": "Furgoneta de carga",
    "15-foot box truck": "Camión de caja de 15 pies",
    "20-foot box truck": "Camión de caja de 20 pies",
    "26-foot box truck": "Camión de caja de 26 pies",
    "Not sure, please recommend": "No estoy seguro, recomiéndenme",
  },
  fullName: "Nombre completo",
  company: "Empresa u hotel",
  email: "Correo electrónico",
  phone: "Teléfono",
  bestWay: "La mejor forma de contactarle",
  onsiteContact: "Contacto en el lugar, si es diferente",
  onsitePlaceholder: "Nombre y teléfono de quien entrega o recibe",
  whoFor: "¿Para quién es?",
  howHeard: "¿Cómo nos conoció?",
  anythingElse: "¿Algo más que debamos saber?",
  attachments: "Archivos adjuntos",
  attachmentsHelp: (max) => `Manifiestos, listas de habitaciones, itinerarios o fotos. Hasta ${max} archivos de 10 MB cada uno.`,
  attaching: "Adjuntando…",
  chooseFiles: "Elegir archivos",
  filesSkipped: (n) => (n > 1 ? `No pudimos adjuntar ${n} archivos.` : "No pudimos adjuntar 1 archivo.") + " Puede enviar su solicitud y compartir los archivos con nuestro equipo después.",
  removeFile: (name) => `Quitar ${name}`,
  preferredContact: { email: "Correo electrónico", phone: "Llamada", whatsapp: "WhatsApp", text: "Mensaje de texto" },
  billing: {
    individual: "Particular / personal",
    "company-account": "Cuenta de empresa",
    "hotel-or-dmc": "Hotel, resort o DMC",
    "event-organizer": "Organizador de eventos",
    other: "Otro",
  },
  leadSources: {
    referral: "Recomendación",
    "repeat-client": "Ya soy cliente",
    "hotel-concierge": "Hotel o conserjería",
    partner: "Socio de viajes o de negocios",
    "google-search": "Búsqueda en Google",
    "google-business-profile": "Google Maps / Perfil de empresa",
    "paid-ad": "Anuncio en línea",
    "social-media": "Redes sociales",
    event: "Evento o feria comercial",
    other: "Otro",
  },
  protectionTitle: "Protección opcional para su equipaje",
  protectionText: "Agregue un plan de protección de Express Bags a esta solicitud. El plan y sus condiciones se confirman en su cotización por escrito.",
  protectionNone: "Sin plan de protección",
  protectionUpTo: (amount) => `Hasta ${amount}`,
  protectionPerOrder: "El beneficio máximo aplica a toda la orden, no por maleta.",
  protectionTerms: "Condiciones del plan",
  review: {
    service: "Servicio",
    origin: "Origen",
    storage: "Almacenamiento",
    program: "Programa",
    from: (d) => `desde ${d}`,
    to: (d) => `hasta ${d}`,
    by: (d) => `antes de ${d}`,
    timing: "Horario",
    items: "Artículos",
    item: "artículo",
    contact: "Contacto",
    attachments: "Archivos adjuntos",
    files: (n) => `${n} archivo(s)`,
    protection: "Protección",
    notSet: "Sin definir",
    notProvided: "No indicado",
    edit: "Editar",
    editLabel: (label) => `Editar ${label}`,
    storageRange: (start, end) => `${start} a ${end}`,
  },
  prohibitedConfirm: ["Confirmo que mis artículos no incluyen bienes ilegales, peligrosos ni prohibidos, y que leí la ", "política de artículos prohibidos", "."],
  contactConfirm: ["Acepto que Express Bags me contacte sobre esta solicitud. Consulte nuestra ", "política de privacidad", "."],
  success: {
    title: "Solicitud recibida",
    defaultMessage: "Gracias. Nuestro equipo de despacho está revisando su solicitud.",
    reference: "Su número de referencia",
    next: "Próximos pasos",
    step1: { t: "Despacho revisa su solicitud", d: "Verificamos la ruta, el vehículo, el personal, el horario y los requisitos de acceso a aeropuertos, puertos o recintos." },
    step2Custom: { t: "Planificamos su programa", d: "Un coordinador puede contactarle para confirmar manifiestos, lugares y horarios, y luego le envía una cotización por escrito." },
    step2: { t: "Recibe una cotización por escrito", d: (email) => `Le enviamos su cotización, con el alcance y las condiciones incluidas${email ? `, a ${email}` : ""}.` },
    step3: { t: "Aprueba y reserva", d: "Cuando la apruebe, confirmamos la reserva y asignamos su equipo. El servicio el mismo día depende de la capacidad y de la confirmación de despacho." },
    another: "Iniciar otra solicitud",
  },
  instant: {
    title: "Reserve al instante",
    textShipping: "Elija un nivel de envío de Express Bags, con recogida y manejo incluidos.",
    textLocal: "Obtenga su precio de Express Bags ahora y reserve en línea, o envíe la solicitud para recibir una cotización por escrito.",
    complete: "Sus datos están completos.",
    tickFirst: "Marque ambas confirmaciones de arriba para ver su precio.",
    see: "Ver mi precio al instante",
    checking: "Verificando rutas, reglas de capacidad y precios…",
    unavailable404: "Los precios al instante no están disponibles en este momento. Envíe su solicitud y le responderemos con una cotización por escrito.",
    sendBelow: "Envíe su solicitud abajo y nuestro equipo de despacho la cotizará.",
    loadError: "No pudimos cargar un precio al instante. Aún puede enviar su solicitud abajo.",
    refresh: "Actualizar precio",
    totalNote: (m) => `Total de esta reserva. Precio reservado por ${m} minutos.`,
    level: "Nivel de envío",
    about: (d) => `Unos ${d} día${d === 1 ? "" : "s"} hábil${d === 1 ? "" : "es"} después de la entrega a la transportadora`,
    includes: "Incluye recogida, manejo y una etiqueta con seguimiento por maleta. Los tiempos de tránsito son estimaciones de la transportadora, no compromisos.",
    estimated: " Algunas medidas se estimaron según el tipo de maleta; las confirmamos en la recogida.",
    book: (amount) => `Reservar y pagar ${amount}`,
    secure: "Pago seguro. ¿Prefiere una cotización por escrito? Use “Enviar solicitud de cotización” abajo.",
    pricesUpdated: "Los precios se actualizaron. Por favor actualice su precio.",
    bookError: "No pudimos iniciar su reserva. Inténtelo de nuevo o envíe su solicitud abajo.",
  },
};

export const QUOTE_STRINGS: Record<Lang, QuoteStrings> = { en, es };

/* ------------------------------------------------------------------ */
/* Validation messages                                                  */
/* ------------------------------------------------------------------ */

/**
 * The wizard's validation (components/quote/flow.ts + the shared zod schema) produces English
 * messages. They are translated here by exact message first, then by field path, so the shared
 * schema never has to change for a new language.
 */
const ES_MESSAGES: Record<string, string> = {
  // flow.ts friendly messages
  "Choose a service to continue": "Elija un servicio para continuar",
  "Choose a time window": "Elija un horario",
  "Let us know how you heard about us": "Indíquenos cómo nos conoció",
  "Choose the area": "Elija la zona",
  "Choose a location type": "Elija el tipo de lugar",
  "Weight required": "Indique el peso",
  "Size required": "Indique la medida",
  "Choose the drop-off date and time": "Elija la fecha y hora de entrega",
  "Choose the retrieval or delivery date and time": "Elija la fecha y hora de retiro o entrega",
  "Retrieval must be after drop-off": "El retiro debe ser después de la entrega",
  "Choose the storage area": "Elija la zona de almacenamiento",
  "Enter the group or event name": "Indique el nombre del grupo o evento",
  "A cruise request needs a cruise port at pickup or delivery": "Un traslado de crucero necesita un puerto en la recogida o la entrega",
  "An airport request needs an airport at pickup or delivery": "Un traslado de aeropuerto necesita un aeropuerto en la recogida o la entrega",
  "Choose the airport": "Elija el aeropuerto",
  "Choose the cruise port": "Elija el puerto de cruceros",
  "Please review the form": "Revise el formulario",
  // quote-schema.ts custom messages
  "Enter an address, ZIP code or location name": "Indique una dirección, código postal o nombre del lugar",
  "Choose a date": "Elija una fecha",
  "Add at least one item": "Agregue al menos un artículo",
  "Enter your name": "Indique su nombre",
  "Enter a valid email": "Indique un correo electrónico válido",
  "Enter a phone number": "Indique un número de teléfono",
  "Please confirm the prohibited-items policy": "Confirme la política de artículos prohibidos",
  "Please agree to be contacted about this request": "Acepte que le contactemos sobre esta solicitud",
};

/** Path-based fallbacks for zod's generic messages (e.g. "Invalid input: expected number, received NaN"). */
const ES_BY_PATH: [RegExp, string][] = [
  [/quantity$/, "Indique una cantidad válida"],
  [/(weightLbs|lengthIn|widthIn|heightIn)$/, "Indique un número válido"],
  [/^(travelers|hotelsOrVenues)$/, "Indique un número válido"],
  [/\.market$/, "Elija la zona"],
  [/\.type$/, "Elija el tipo de lugar"],
  [/address$/, "Indique una dirección, código postal o nombre del lugar"],
  [/^serviceDate$/, "Elija una fecha"],
  [/^contact\.email$/, "Indique un correo electrónico válido"],
];

/** Translate one validation message for a field path. English is returned unchanged. */
export function localizeMessage(message: string, path: string, lang: Lang): string {
  if (lang === "en") return message;
  if (ES_MESSAGES[message]) return ES_MESSAGES[message];
  for (const [re, msg] of ES_BY_PATH) if (re.test(path)) return msg;
  return "Revise este dato";
}

export function localizeErrors(errors: Record<string, string>, lang: Lang): Record<string, string> {
  if (lang === "en") return errors;
  return Object.fromEntries(Object.entries(errors).map(([p, m]) => [p, localizeMessage(m, p, lang)]));
}

/** All English source messages that must have a Spanish translation (checked by tests). */
export const KNOWN_VALIDATION_MESSAGES = Object.keys(ES_MESSAGES);
