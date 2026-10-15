/**
 * Express Bags — single source of truth for all public website facts.
 *
 * Every value here comes from Carlos Delgado's approved documents
 * (completed Website Requirements Form — Priority Florida Markets, Brand & Privacy Revision;
 * Company History & Roadmap 2010–2026; Master Platform Requirements).
 *
 * PRIVACY RULES (enforced by scripts/check-content.ts):
 *  - Public address is the P.O. Box ONLY. Never the street office address.
 *  - Public phone is the office number ONLY. Never the owner's mobile.
 *  - Never the owner's name/title/bio/photo, never any employee identity or staff count.
 *  - Public email is hidden until Carlos confirms the mailbox is live (contact.emailLive).
 */

export const company = {
  name: "Express Bags, Inc.",
  shortName: "Express Bags",
  founded: 2010,
  yearsOperating: new Date().getFullYear() - 2010,
  url: "https://www.express-bags.com",
  tagline: "Handled with Care. Delivered with Confidence.",
  promise: "We don't just deliver luggage. We deliver peace of mind.",
  sinceLine: "Delivering Excellence in Hospitality, Tourism & Logistics Since 2010",
  northStar:
    "The most dependable luggage and time-sensitive logistics partner connecting Miami with Florida's key travel markets.",
  category: [
    "Florida Luggage Logistics",
    "Hospitality and Travel Logistics",
    "Professional Courier",
    "Last-Mile Delivery",
    "Luggage Storage",
    "Truck-Based Commercial Logistics",
  ],
  description:
    "Express Bags, Inc. is a Florida luggage and commercial logistics company headquartered in Miami. Established in 2010, Express Bags serves hotels, resorts, travelers, destination management companies, airports, cruise ports, sports and entertainment groups, event organizers, and commercial accounts with carefully handled luggage transfers, hospitality logistics, professional courier and last-mile delivery, short-term luggage storage, and cargo-van or box-truck transportation.",
  strength:
    "Dependable execution across local and intercity routes: clear communication, punctual scheduling, careful chain of custody, flexible capacity, and documented handoff from pickup through completion.",
} as const;

export const contact = {
  /** Public mailing/contact address — P.O. Box only (street address is private). */
  poBox: "P.O. Box 667538",
  city: "Miami",
  state: "FL",
  stateLong: "Florida",
  zip: "33166",
  addressLine: "P.O. Box 667538, Miami, FL 33166",
  /** Public office phone (the business-card mobile is private and must never appear). */
  phoneDisplay: "(305) 783-2860",
  phoneHref: "tel:+13057832860",
  phoneE164: "+13057832860",
  /** Recommended public mailbox — shown ONLY when emailLive is true (Carlos must confirm it's active). */
  email: "info@express-bags.com",
  emailLive: false,
  visits: "Visits by appointment only",
  hours: [
    { days: "Monday – Friday", time: "9:00 AM – 7:00 PM", schema: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "19:00" } },
    { days: "Saturday", time: "9:30 AM – 7:00 PM", schema: { days: ["Saturday"], opens: "09:30", closes: "19:00" } },
    { days: "Sunday", time: "9:30 AM – 4:00 PM", schema: { days: ["Sunday"], opens: "09:30", closes: "16:00" } },
  ],
} as const;

export const social = [
  { name: "LinkedIn", href: "https://www.linkedin.com/company/express-bags-inc", note: "confirm exact URL with Carlos" },
  { name: "Facebook", href: "https://www.facebook.com/", note: "owner provided a share link — replace with permanent Page URL" },
  { name: "Instagram", href: "https://www.instagram.com/express_bags_inc/", note: "@express_bags_inc" },
  { name: "Nextdoor", href: "https://nextdoor.com/", note: "confirm exact URL with Carlos" },
] as const;

export const brand = {
  navy: "#002858",
  orange: "#E06010",
  white: "#FFFFFF",
  charcoal: "#1F2933",
  primaryCta: "Request a Quote",
} as const;

/* ------------------------------------------------------------------ */
/* Services (8 public service lines — completed form B1)               */
/* ------------------------------------------------------------------ */

export type Service = {
  slug: string;
  name: string;
  short: string;
  intro: string;
  bullets: string[];
  audiences: string[];
  quoteType: QuoteServiceType;
  icon: string; // lucide icon name
  keywords: string[];
  notes?: string[];
};

export type QuoteServiceType =
  | "luggage-local"
  | "group-event"
  | "airport"
  | "cruise"
  | "storage"
  | "courier"
  | "truck"
  | "nationwide-shipping";

export const services: Service[] = [
  {
    slug: "vip-group-luggage",
    name: "VIP & Group Luggage Transfers",
    short: "Coordinated pickup, secure loading and verified handoff for VIP travelers and large groups.",
    intro:
      "From a single VIP traveler to a full tour group, Express Bags coordinates pickup, secure loading, transport and a verified handoff within and between our priority Florida markets, subject to route and dispatch confirmation.",
    bullets: [
      "Coordinated pickup, secure loading, transport and verified handoff",
      "Designed for guests, families, tour groups, corporate travelers, sports teams, performers and production groups",
      "Supports manifests, bag counts, multiple vehicles, timed arrivals and special instructions",
      "Experienced supervision, careful handling, direct communication and scalable vehicle capacity",
    ],
    audiences: ["VIP travelers", "Tour groups", "Corporate travelers", "Sports teams", "Performers & production groups"],
    quoteType: "group-event",
    icon: "Crown",
    keywords: ["VIP luggage transfer Florida", "group luggage transfer Miami", "luggage logistics for groups"],
  },
  {
    slug: "hotel-hospitality-logistics",
    name: "Hotel, Resort & DMC Hospitality Logistics",
    short: "Scheduled and on-demand luggage transfers for hotels, resorts, concierges and DMCs.",
    intro:
      "Scheduled and on-demand luggage transfers between hotels, airports, cruise ports, venues and other approved locations, built around punctuality, professional conduct and guest-care standards.",
    bullets: [
      "Scheduled and on-demand transfers between hotels, airports, cruise ports and venues",
      "Supports concierges, bell teams, destination management companies, tour operators and group coordinators",
      "Recurring routes, multi-stop movements, rooming or group manifests, centralized billing and proof of delivery",
      "Built around punctuality, professional conduct and guest-care standards",
    ],
    audiences: ["Hotel & resort managers", "Concierge & bell desks", "DMCs", "Tour operators", "Corporate travel programs"],
    quoteType: "luggage-local",
    icon: "Hotel",
    keywords: ["hotel luggage transfer Miami", "resort luggage delivery Florida", "DMC luggage logistics"],
  },
  {
    slug: "airport-luggage",
    name: "Airport Luggage Logistics",
    short: "Planned luggage pickup and delivery involving Florida's major airports.",
    intro:
      "Planned luggage pickup and delivery involving MIA, FLL, EYW, PBI, MCO, TPA and RSW, for arriving and departing travelers, organized groups, hotels, DMCs, sports organizations and entertainment teams.",
    bullets: [
      "Planned pickup and delivery involving MIA, FLL, EYW, PBI, MCO, TPA and RSW",
      "Supports arriving and departing travelers, groups, hotels, DMCs, sports and entertainment teams",
      "Accounts for airline details, arrival windows, baggage counts, oversized items, delays and authorized handoff points",
      "Airport-specific availability and access are confirmed during quoting",
    ],
    audiences: ["Arriving & departing travelers", "Organized groups", "Hotels & DMCs", "Sports & entertainment teams"],
    quoteType: "airport",
    icon: "Plane",
    keywords: ["MIA luggage service", "FLL luggage service", "airport luggage delivery Florida"],
    notes: ["Service is subject to route, terminal rules and confirmed access. We do not promise airside access."],
  },
  {
    slug: "cruise-port-luggage",
    name: "Cruise-Port Luggage Logistics",
    short: "Timed luggage movements to and from Florida's cruise ports.",
    intro:
      "Timed luggage movements involving PortMiami, Port Everglades, Port of Key West, Port of Palm Beach, Port Canaveral and Port Tampa Bay, coordinated around ship schedules with detailed manifests and buffer time.",
    bullets: [
      "Hotel-to-port, airport-to-port, port-to-hotel and other approved transfer routes",
      "Supports cruise passengers, hotels, tour operators, DMCs, group coordinators and hospitality partners",
      "Detailed manifests, buffer time and an accountable dispatch contact",
      "Documented delivery to reduce handoff risk",
    ],
    audiences: ["Cruise passengers", "Hotels", "Tour operators & DMCs", "Group coordinators"],
    quoteType: "cruise",
    icon: "Ship",
    keywords: ["PortMiami cruise luggage service", "Port Everglades cruise luggage service", "Port Canaveral cruise luggage service"],
    notes: ["Service is subject to route, terminal rules, access and ship schedules."],
  },
  {
    slug: "luggage-storage",
    name: "Luggage Storage & Delayed Delivery",
    short: "Short-term holding when check-in, flight or cruise times don't line up.",
    intro:
      "Short-term luggage holding when a guest's check-in, flight, cruise or onward transportation does not align with pickup or delivery time, a controlled bridge between itineraries, available by quotation.",
    bullets: [
      "Short-term holding between itineraries",
      "Combine with pickup and/or later delivery",
      "Useful for travelers, hotels, groups, events and travel coordinators",
      "Availability, duration, item restrictions, access and fees confirmed by quotation",
    ],
    audiences: ["Travelers", "Hotels", "Groups & events", "Travel coordinators"],
    quoteType: "storage",
    icon: "Warehouse",
    keywords: ["luggage storage Miami", "luggage storage and delivery Florida", "cruise luggage storage Miami"],
  },
  {
    slug: "sports-entertainment-events",
    name: "Sports, Entertainment & Event Logistics",
    short: "Luggage, gear and equipment moved on exact timelines for teams, artists and events.",
    intro:
      "Transportation of luggage, golf clubs, sports equipment, team gear, performance equipment and approved event materials, with time-specific loading, staging, multi-vehicle coordination and venue handoffs.",
    bullets: [
      "Luggage, golf clubs, sports equipment, team gear, performance equipment and event materials",
      "Designed for visiting teams, tournament groups, artists, touring crews, venues and organizers",
      "Time-specific loading, staging, multi-vehicle coordination and oversized-item review",
      "Venue handoffs planned to the minute",
    ],
    audiences: ["Visiting teams", "Tournament groups", "Artists & touring crews", "Venues & organizers"],
    quoteType: "group-event",
    icon: "Trophy",
    keywords: ["sports equipment transportation Florida", "event logistics Miami", "touring gear transport Florida"],
  },
  {
    slug: "courier-last-mile",
    name: "Professional Courier & Last-Mile Delivery",
    short: "Scheduled, routed and time-sensitive delivery for approved business items and documents.",
    intro:
      "Scheduled, routed, same-day when locally available, and time-sensitive pickup and delivery for approved business items and documents, with recipient verification, status updates and proof of delivery.",
    bullets: [
      "Scheduled, routed and time-sensitive delivery, same-day when locally available",
      "Best suited to hotels, travel businesses, corporate accounts, event organizations and retailers",
      "Recurring routes, multiple stops, recipient verification, status updates and proof of delivery",
      "No food or catering delivery. Prohibited, hazardous, illegal or unsafe items are not accepted",
    ],
    audiences: ["Hotels & travel businesses", "Corporate accounts", "Event organizations", "Retailers & commercial clients"],
    quoteType: "courier",
    icon: "PackageCheck",
    keywords: ["Miami courier service", "Fort Lauderdale last-mile delivery", "Florida business courier"],
  },
  {
    slug: "cargo-van-box-truck",
    name: "Cargo-Van & Box-Truck Logistics",
    short: "Regional and intercity capacity from cargo vans to 26-foot box trucks.",
    intro:
      "Regional and intercity route capacity using cargo vans and approximately 15-, 20- and 26-foot box trucks, assigned to the size and requirements of each approved job.",
    bullets: [
      "Cargo vans and approximately 15-, 20- and 26-foot box trucks",
      "Palletized goods, equipment, event materials, bulk luggage, commercial routes and special projects",
      "Pricing may include route or truck charges, labor, mileage, fuel, waiting time, access, overtime, pallets or storage",
      "General household moving is not offered",
    ],
    audiences: ["Commercial businesses", "Event producers", "Hospitality groups", "Special logistics projects"],
    quoteType: "truck",
    icon: "Truck",
    keywords: ["box truck delivery Miami", "cargo van delivery Florida", "26 foot box truck logistics Florida"],
  },
];

/* ------------------------------------------------------------------ */
/* Priority markets (8) — completed form B4                             */
/* ------------------------------------------------------------------ */

export type Market = {
  slug: string;
  name: string;
  tier: "top" | "next" | "additional";
  hq?: boolean;
  summary: string;
  areas: string[];
  airports: string[]; // airport codes
  ports: string[]; // port slugs
  keywords: string[];
  spanishKeywords: string[];
  seasonal: string[];
};

export const markets: Market[] = [
  {
    slug: "miami",
    name: "Miami & Miami-Dade",
    tier: "top",
    hq: true,
    summary:
      "Our headquarters market. Miami and approved Miami-Dade routes, with dedicated emphasis on Miami International Airport, PortMiami, hotels, hospitality groups, events and commercial accounts.",
    areas: ["Miami", "Miami Beach", "Brickell", "Downtown Miami", "Doral", "Coral Gables", "Aventura", "Key Biscayne"],
    airports: ["MIA"],
    ports: ["portmiami"],
    keywords: ["Miami luggage delivery", "Miami luggage transfer", "hotel luggage transfer Miami", "MIA luggage service", "PortMiami cruise luggage service", "Miami courier service", "Miami last-mile delivery"],
    spanishKeywords: ["entrega de equipaje en Miami", "traslado de equipaje al puerto de cruceros"],
    seasonal: ["Formula 1 Miami Grand Prix weekend", "Orange Bowl and college-football events", "Miami Open", "Miami International Boat Show", "Art Basel / Miami Art Week", "Ultra Music Festival", "Cruise season", "Holiday and spring-break travel"],
  },
  {
    slug: "fort-lauderdale-broward",
    name: "Fort Lauderdale & Broward County",
    tier: "top",
    summary:
      "Fort Lauderdale and approved Broward County routes, including FLL, Port Everglades, hotels, resorts, cruise movements, conventions, events and commercial accounts.",
    areas: ["Fort Lauderdale", "Hollywood", "Miramar", "Pembroke Pines", "Pompano Beach", "Coral Springs", "Sunrise", "Plantation", "Davie", "Deerfield Beach"],
    airports: ["FLL"],
    ports: ["port-everglades"],
    keywords: ["Broward County luggage delivery", "Fort Lauderdale luggage transfer", "Fort Lauderdale hotel luggage transfer", "FLL luggage service", "Port Everglades cruise luggage service", "Broward courier service", "Fort Lauderdale last-mile delivery"],
    spanishKeywords: ["entrega de equipaje en Broward", "traslado de maletas en Fort Lauderdale", "servicio de equipaje en FLL", "traslado de equipaje a Port Everglades"],
    seasonal: ["Fort Lauderdale International Boat Show", "Port Everglades cruise peaks", "Broward conventions and events"],
  },
  {
    slug: "florida-keys-key-west",
    name: "Florida Keys & Key West",
    tier: "top",
    summary:
      "Key Largo, Islamorada, Marathon, Key West and approved routes through the Florida Keys, including Key West International Airport and Port of Key West movements.",
    areas: ["Key Largo", "Islamorada", "Marathon", "Lower Keys", "Key West"],
    airports: ["EYW"],
    ports: ["port-of-key-west"],
    keywords: ["Florida Keys luggage delivery", "Key West luggage transfer", "Key West airport luggage service", "Port of Key West cruise luggage service"],
    spanishKeywords: ["transporte de equipaje en los Cayos de Florida"],
    seasonal: ["Florida Keys peak travel periods", "Key West cruise calls", "Keys festivals"],
  },
  {
    slug: "west-palm-beach",
    name: "West Palm Beach & Palm Beach County",
    tier: "next",
    summary:
      "West Palm Beach and approved Palm Beach County routes, with emphasis on the West Palm Beach airport (PBI), Port of Palm Beach, hotels, resorts, events and commercial accounts.",
    areas: ["West Palm Beach", "Palm Beach", "Boca Raton", "Delray Beach", "Jupiter", "Palm Beach Gardens"],
    airports: ["PBI"],
    ports: ["port-of-palm-beach"],
    keywords: ["West Palm Beach luggage delivery", "West Palm Beach hotel luggage transfer", "PBI luggage service", "Port of Palm Beach luggage transfer", "West Palm Beach courier service"],
    spanishKeywords: ["traslado de maletas en West Palm Beach"],
    seasonal: ["Palm Beach boat shows", "Golf events", "Equestrian season"],
  },
  {
    slug: "orlando",
    name: "Orlando",
    tier: "additional",
    summary:
      "Orlando and approved metro-area routes, with emphasis on Orlando International Airport, hotels and resorts, convention groups, events and Orlando-to-Port Canaveral transfers.",
    areas: ["Orlando", "Lake Buena Vista", "Kissimmee", "International Drive"],
    airports: ["MCO"],
    ports: [],
    keywords: ["Orlando luggage delivery", "Orlando hotel and resort luggage transfer", "MCO luggage service", "Orlando convention luggage logistics", "Orlando courier service"],
    spanishKeywords: ["entrega de equipaje en Orlando"],
    seasonal: ["Orlando conventions", "Resort and theme-park group peaks", "Major entertainment schedules"],
  },
  {
    slug: "tampa",
    name: "Tampa",
    tier: "additional",
    summary:
      "Tampa and approved metro-area routes, with emphasis on Tampa International Airport, Port Tampa Bay, hotels, cruise movements, events and commercial accounts.",
    areas: ["Tampa", "St. Petersburg", "Clearwater"],
    airports: ["TPA"],
    ports: ["port-tampa-bay"],
    keywords: ["Tampa luggage delivery", "Tampa hotel luggage transfer", "TPA luggage service", "Port Tampa Bay cruise luggage service", "Tampa courier service"],
    spanishKeywords: ["servicio de equipaje en Tampa"],
    seasonal: ["Tampa cruise traffic", "Conventions and festivals", "Professional-sports traffic"],
  },
  {
    slug: "fort-myers",
    name: "Fort Myers",
    tier: "additional",
    summary:
      "Fort Myers and approved Lee County routes, with emphasis on Southwest Florida International Airport, hotels and resorts, seasonal group travel and commercial accounts.",
    areas: ["Fort Myers", "Cape Coral", "Naples", "Sanibel", "Bonita Springs"],
    airports: ["RSW"],
    ports: [],
    keywords: ["Fort Myers luggage delivery", "Fort Myers hotel and resort luggage transfer", "RSW luggage service", "Fort Myers courier service"],
    spanishKeywords: ["entrega de equipaje en Fort Myers"],
    seasonal: ["Seasonal tourism", "Group travel", "Sports and event demand"],
  },
  {
    slug: "cape-canaveral-port-canaveral",
    name: "Cape Canaveral & Port Canaveral",
    tier: "additional",
    summary:
      "Cape Canaveral and Port Canaveral, with emphasis on cruise luggage transfers, hotel-to-port and airport-to-port movements, group logistics and the Orlando–Port Canaveral corridor.",
    areas: ["Cape Canaveral", "Cocoa Beach", "Port Canaveral", "Orlando–Port Canaveral corridor"],
    airports: [],
    ports: ["port-canaveral"],
    keywords: ["Cape Canaveral luggage delivery", "Port Canaveral cruise luggage service", "Orlando-to-Port Canaveral luggage transfer"],
    spanishKeywords: ["traslado de equipaje a Puerto Cañaveral"],
    seasonal: ["Port Canaveral cruise departure and arrival days", "Orlando-to-port group movements"],
  },
];

export const otherFloridaRoute = {
  label: "Other Florida route (special quote)",
  note: "Other Florida routes may be considered by special quotation when route, capacity, timing, access and pricing are confirmed.",
};

export type Airport = { code: string; name: string; officialName?: string; market: string; slug: string };

export const airports: Airport[] = [
  { code: "MIA", slug: "mia-miami-international-airport", name: "Miami International Airport", market: "miami" },
  { code: "FLL", slug: "fll-fort-lauderdale-hollywood-international-airport", name: "Fort Lauderdale-Hollywood International Airport", market: "fort-lauderdale-broward" },
  { code: "EYW", slug: "eyw-key-west-international-airport", name: "Key West International Airport", market: "florida-keys-key-west" },
  {
    code: "PBI",
    slug: "pbi-palm-beach-international-airport",
    name: "Palm Beach International Airport",
    officialName: "President Donald J. Trump International Airport (PBI)",
    market: "west-palm-beach",
  },
  { code: "MCO", slug: "mco-orlando-international-airport", name: "Orlando International Airport", market: "orlando" },
  { code: "TPA", slug: "tpa-tampa-international-airport", name: "Tampa International Airport", market: "tampa" },
  { code: "RSW", slug: "rsw-southwest-florida-international-airport", name: "Southwest Florida International Airport", market: "fort-myers" },
];

export type Port = { slug: string; name: string; market: string };

export const ports: Port[] = [
  { slug: "portmiami", name: "PortMiami", market: "miami" },
  { slug: "port-everglades", name: "Port Everglades", market: "fort-lauderdale-broward" },
  { slug: "port-of-key-west", name: "Port of Key West", market: "florida-keys-key-west" },
  { slug: "port-of-palm-beach", name: "Port of Palm Beach", market: "west-palm-beach" },
  { slug: "port-canaveral", name: "Port Canaveral", market: "cape-canaveral-port-canaveral" },
  { slug: "port-tampa-bay", name: "Port Tampa Bay", market: "tampa" },
];

/* ------------------------------------------------------------------ */
/* Positioning & standards                                              */
/* ------------------------------------------------------------------ */

export const careStandard = {
  title: "The Express Care Standard",
  lead: "Every bag is treated as a customer's valuable property, not as ordinary cargo.",
  points: [
    "Arrive on time or early for the confirmed window",
    "Present a clean, professional appearance",
    "Confirm the job instructions and bag count before loading",
    "Identify or tag items according to the manifest",
    "Handle and secure every item carefully",
    "Never leave property unattended or release it to an unauthorized person",
    "Protect the chain of custody from pickup to handoff",
    "Communicate delays, exceptions or count discrepancies immediately",
    "Re-count at handoff",
    "Document completion with the approved proof-of-delivery method",
  ],
  closing: "Safety comes before speed, and no one guesses when an instruction, recipient or item is unclear.",
};

export const howItWorks = [
  { step: "Request", text: "Tell us what is moving, from where, to where and when. A complete request produces the fastest accurate quote." },
  { step: "Quote", text: "We price the job privately for route, vehicle, labor, timing and handling, then send a written quotation." },
  { step: "Book", text: "Approve the quote, confirm contacts, itinerary and manifest, and receive a booking confirmation." },
  { step: "Dispatch", text: "We assign the right vehicle and team, with one complete job ticket and an accountable dispatcher." },
  { step: "Deliver", text: "Items are counted, handed only to the authorized party, and completion is documented and confirmed." },
];

export const winReasons = [
  { title: "Reliable coordination", text: "One accountable dispatcher, clear communication and punctual scheduling." },
  { title: "Careful handling", text: "Accurate counts, protected chain of custody and documented handoffs." },
  { title: "Local knowledge", text: "Practical experience with Florida hotels, airports, cruise ports, tourism corridors and event markets." },
  { title: "Flexible capacity", text: "From a cargo van to a 26-foot box truck, matched to the actual job." },
];

export const fleet = [
  { name: "Cargo vans", use: "Courier, last-mile, small groups and time-sensitive deliveries" },
  { name: "15-foot box trucks", use: "Group luggage, event materials and multi-stop routes" },
  { name: "20-foot box trucks", use: "Larger groups, equipment and commercial routes" },
  { name: "26-foot box trucks", use: "High-volume group movements, palletized goods and intercity routes" },
];

export const industries = [
  { name: "Hotels & Resorts", text: "Guest luggage transfers, group staging and recurring routes." },
  { name: "Destination Management (DMCs)", text: "Program logistics with manifests, timings and centralized billing." },
  { name: "Cruise & Shore Operations", text: "Embarkation and debarkation flows, consolidation and port transfers." },
  { name: "Airlines & Airports", text: "Arrival-window coordination and authorized handoff points." },
  { name: "Corporate & Incentive Groups", text: "Large passenger groups and multi-day programs." },
  { name: "Sports Organizations", text: "Team luggage and equipment between airport, hotel and venue." },
  { name: "Entertainment & Touring", text: "Artist, crew, guest and gear logistics on exact timelines." },
  { name: "Conventions & Events", text: "Equipment, materials and luggage for events and trade shows." },
  { name: "Universities", text: "Team, band and equipment movements." },
  { name: "Commercial Businesses", text: "Scheduled courier, last-mile, pallet and box-truck routes." },
];

export const exclusions = [
  "Household moving or local moving",
  "Food or catering delivery",
  "Illegal, hazardous, prohibited, improperly packaged or unsafe items",
  "Items barred by airline, TSA, airport, port, venue, carrier or law-enforcement rules",
];

export const faqs: { q: string; a: string }[] = [
  {
    q: "Where do you operate?",
    a: "Express Bags is headquartered in Miami and focuses on Miami/Miami-Dade, Broward County/Fort Lauderdale, the Florida Keys/Key West, West Palm Beach/Palm Beach County, Orlando, Tampa, Fort Myers and Cape Canaveral/Port Canaveral. Other Florida routes may be considered by special quotation. Every route is confirmed for vehicle, labor, timing, distance, access and dispatch availability.",
  },
  {
    q: "How much does it cost?",
    a: "Pricing is custom because route, time, volume, labor, vehicle, access, urgency and storage needs vary. A complete request produces the fastest accurate quote.",
  },
  {
    q: "Can you help today or after a delay?",
    a: "Same-day or urgent work may be available, but only after dispatch confirms capacity and access.",
  },
  {
    q: "Can you pick up at an airport or cruise port?",
    a: "Yes, for approved services and handoff points, subject to terminal rules, timing, access and required credentials.",
  },
  {
    q: "Can you handle a large group or many bags?",
    a: "Yes, subject to a confirmed manifest, vehicle plan, labor plan and service window.",
  },
  {
    q: "Do you store luggage?",
    a: "Short-term storage may be available by quotation. Duration, access, prohibited items and fees must be confirmed.",
  },
  {
    q: "How will I know the job is complete?",
    a: "You receive status updates and a completion confirmation with proof of delivery such as recipient name, time, signature, photo or another approved record.",
  },
  {
    q: "Will I know who is assigned to my job?",
    a: "Team member identities are not published on the website. After a booking is confirmed and dispatch assigns a driver, the booked customer may receive the assigned driver's name and approved job-specific contact information through secure job communications.",
  },
  {
    q: "Can you carry golf clubs, sports gear, instruments or oversized items?",
    a: "Many special items can be handled after size, weight, packaging, value and access are reviewed.",
  },
  {
    q: "What happens if my flight, ship, hotel room or event schedule changes?",
    a: "Contact dispatch immediately. The team will confirm whether the new plan, waiting time, storage or additional charges can be accommodated.",
  },
  {
    q: "Are you insured, and what happens if there is damage?",
    a: "Current certificates can be provided to approved business clients when appropriate. Any issue is documented and handled under the signed terms and claims procedure.",
  },
];

/* ------------------------------------------------------------------ */
/* History (company-level only — file 06). Named end-clients live in    */
/* notableProjects and are hidden unless permission is recorded.        */
/* ------------------------------------------------------------------ */

export const historyEras = [
  { years: "2010", title: "Foundation", text: "Express Bags begins operations in South Florida, built around the airport, hotel and cruise-port ecosystem, providing luggage and truck support for travel groups, transportation partners and destination-service companies." },
  { years: "2011–2012", title: "Large corporate groups from the start", text: "Within its first years the company was already executing four-figure passenger group logistics, including corporate charter programs of roughly 1,400 to 1,500 passengers, and VIP movements between private aviation terminals and luxury hotels." },
  { years: "2013–2016", title: "Cruise and destination-services growth", text: "Express Bags becomes deeply embedded with shore-service companies, DMCs, coach and transportation providers and cruise-related operators, running recurring airport, hotel, port and group logistics." },
  { years: "2017–2018", title: "Sports and entertainment", text: "Professional basketball team logistics between airport, hotel and arena, touring-artist movements involving private aviation, and a growing portfolio of themed and music cruise programs." },
  { years: "2018–2019", title: "High-frequency baggage networks", text: "Repeated ship-to-storage and bag-consolidation operations across many vessels, college athletics movements, and commercial pallet logistics beyond passenger baggage." },
  { years: "2019–2020", title: "Pre-pandemic peak capability", text: "A mature network across cruise lines, shore services, DMCs, group travel, luxury hospitality, private aviation, sports and entertainment, including royal-family VIP assignments." },
  { years: "2020", title: "Pandemic disruption", text: "COVID-19 hit nearly every sector the business served: cruises, international travel, group events, hotels, DMCs, motor coaches and entertainment. The company survived, though many historic accounts did not return." },
  { years: "2021–2023", title: "Rebuilding", text: "Core relationships resumed, including complex multi-wave corporate luggage operations with two airport arrival waves, overnight truck holding and sequenced cruise-port delivery." },
  { years: "2024–2026", title: "Large artist and cruise programs continue", text: "Dedicated artist, guest and gear trucks for music-cruise programs serving roughly 95 to 197 people per assignment, and high-profile entertainment logistics between luxury hotels and private aviation." },
  { years: "2026", title: "Digital expansion", text: "Turning sixteen years of field-proven capability into a modern Florida logistics platform: online quoting, structured pricing, custom quotations for complex work, business accounts and Florida-wide service." },
];

export const operatingEnvironments = [
  "Miami International Airport (MIA)",
  "Fort Lauderdale-Hollywood International Airport (FLL)",
  "Palm Beach International Airport (PBI)",
  "PortMiami",
  "Port Everglades",
  "Private aviation terminals",
  "Luxury and convention hotels across Miami, Miami Beach, Fort Lauderdale and Broward",
  "Cruise vessels across multiple major cruise brands",
  "Arenas and sports facilities",
  "Warehouses and commercial pickup/delivery locations",
];

export type EvidenceLevel = "contracting-customer" | "end-client-project" | "company-recollection" | "operating-environment";

export type NotableProject = {
  id: string;
  period: string;
  title: string; // named end-client/project — PUBLIC ONLY when permissionGranted
  genericTitle: string; // safe description used when permission is not granted
  type: string;
  through?: string; // contracting partner, shown as "supported through …" only with permission
  summary: string;
  evidence: EvidenceLevel;
  permissionGranted: boolean; // default false — written permission required (form B13)
};

export const notableProjects: NotableProject[] = [
  { id: "rbc-groups", period: "2011–2023", title: "Royal Bank of Canada corporate groups", genericTitle: "Major corporate charter groups", type: "Corporate & incentive", through: "travel and DMC partners", summary: "Charter programs of roughly 1,455–1,481 passengers in 2011–2012, and a 2023 multi-wave operation with two airport arrival waves, overnight truck holding and sequenced PortMiami delivery.", evidence: "end-client-project", permissionGranted: false },
  { id: "u2", period: "2017", title: "U2 touring operations", genericTitle: "Touring-artist operations", type: "Entertainment", summary: "Airport, hotel and private-aviation luggage movements for a world-touring band.", evidence: "end-client-project", permissionGranted: false },
  { id: "roger-waters", period: "2017", title: "Roger Waters luggage movement", genericTitle: "Touring-artist luggage movement", type: "Entertainment", summary: "Luggage logistics for a touring artist.", evidence: "end-client-project", permissionGranted: false },
  { id: "madonna", period: "2024", title: "Madonna groups", genericTitle: "High-profile entertainment group", type: "Entertainment", summary: "26-foot truck luggage movement from a luxury Miami hotel to a private aviation terminal at MIA.", evidence: "end-client-project", permissionGranted: false },
  { id: "nba", period: "2017–2019", title: "Philadelphia 76ers & Indiana Pacers", genericTitle: "Professional basketball teams", type: "Professional sports", through: "a charter transportation partner", summary: "Team logistics between MIA, hotel, arena and return airport movements.", evidence: "end-client-project", permissionGranted: false },
  { id: "oklahoma", period: "2018", title: "University of Oklahoma", genericTitle: "Collegiate athletics program", type: "College athletics", through: "a charter transportation partner", summary: "Two trucks from a Hollywood resort to a private aviation terminal at FLL.", evidence: "end-client-project", permissionGranted: false },
  { id: "royal-family", period: "2012 · 2019–2020", title: "Royal-family VIP assignments", genericTitle: "Royal-family VIP assignments", type: "VIP / private aviation", summary: "VIP movements between private aviation terminals and luxury hotels. (Country of the 2012 assignment is never stated.)", evidence: "end-client-project", permissionGranted: false },
  { id: "themed-cruises", period: "2018–2026", title: "Themed & music cruise programs", genericTitle: "Themed & music cruise programs", type: "Entertainment cruises", through: "a travel-program partner", summary: "Hotel/airport-to-ship and ship-to-airport movements, dedicated artist, guest and gear trucks for programs of roughly 95 to 197 people.", evidence: "end-client-project", permissionGranted: false },
  { id: "pallet", period: "2018–2019", title: "Commercial pallet logistics", genericTitle: "Commercial pallet logistics", type: "Commercial", summary: "Warehouse-to-warehouse pallet deliveries for an energy-efficiency program.", evidence: "end-client-project", permissionGranted: false },
];

/* ------------------------------------------------------------------ */
/* Navigation                                                           */
/* ------------------------------------------------------------------ */

export const nav = {
  main: [
    { label: "Services", href: "/services" },
    { label: "Service Areas", href: "/service-areas" },
    { label: "Industries", href: "/industries" },
    { label: "Business Accounts", href: "/business-accounts" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  footer: {
    company: [
      { label: "About Express Bags", href: "/about" },
      { label: "Our History", href: "/our-history" },
      { label: "Notable Projects", href: "/notable-projects" },
      { label: "Fleet & Capabilities", href: "/fleet" },
      { label: "Careers", href: "/careers" },
      { label: "Blog & News", href: "/blog" },
    ],
    help: [
      { label: "Request a Quote", href: "/request-a-quote" },
      { label: "Track Your Delivery", href: "/track" },
      { label: "Client Login", href: "/client-login" },
      { label: "FAQ", href: "/faq" },
      { label: "Resources & Downloads", href: "/resources" },
      { label: "Contact", href: "/contact" },
    ],
    legal: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
};

/** Old express-bags.com URLs (GoDaddy Website Builder) → new equivalents. */
export const legacyRedirects = [
  { source: "/home", destination: "/" },
  { source: "/about", destination: "/about" },
  { source: "/services", destination: "/services" },
  { source: "/our-team", destination: "/about" },
  { source: "/locations", destination: "/service-areas" },
];
