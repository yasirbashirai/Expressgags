/**
 * Long-form, page-specific copy for service, service-area, airport and port pages.
 * Owned by the services/areas pages. Facts must stay consistent with src/content/site.ts.
 * Rules: no named clients, no guarantees, every timing claim subject to dispatch confirmation.
 */

export type ServiceCopy = {
  headline: string;
  visual: "manifest" | "concierge" | "arrivals" | "sailing" | "storage" | "runofshow" | "route" | "fleet";
  steps: { title: string; text: string }[];
  prepare: string[];
  faqIndexes: number[]; // indexes into faqs in site.ts
  relatedMarkets: string[];
  showAirports?: boolean;
  showPorts?: boolean;
  group: "luggage" | "commercial";
};

export const serviceCopy: Record<string, ServiceCopy> = {
  "vip-group-luggage": {
    headline: "One manifest. Every bag accounted for.",
    visual: "manifest",
    group: "luggage",
    steps: [
      { title: "Manifest first", text: "We start from your guest list or bag count, flight or arrival times and the pickup and receiving contacts." },
      { title: "Vehicle and team plan", text: "Dispatch matches vans or box trucks and helpers to the real volume, with buffer time for arrivals that run late." },
      { title: "Count at pickup", text: "Bags are counted and checked against the manifest before loading. Any discrepancy is reported before departure." },
      { title: "Verified handoff", text: "Items are released only to the authorized receiving party, re-counted and the completion is documented." },
    ],
    prepare: ["Group or guest list with bag counts", "Arrival or departure times", "Pickup and receiving contacts on site", "Oversized or special items", "Room or delivery instructions"],
    faqIndexes: [4, 7, 9, 2],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "florida-keys-key-west", "orlando"],
    showAirports: true,
    showPorts: true,
  },
  "hotel-hospitality-logistics": {
    headline: "A dependable logistics partner behind the front desk.",
    visual: "concierge",
    group: "luggage",
    steps: [
      { title: "Set the routine", text: "For recurring work we agree routes, cut-off times, contacts and billing once, so each request is quick." },
      { title: "Request in minutes", text: "Concierge or bell teams send guest name, room, bag count, pickup time and destination." },
      { title: "Guest-care handling", text: "Our team arrives in a clean, professional manner, confirms the count and handles every bag as guest property." },
      { title: "Proof back to you", text: "Completion is confirmed with the approved proof-of-delivery record, ready for your guest and your records." },
    ],
    prepare: ["Property contact and billing details", "Guest name or reference and room", "Bag count and pickup time", "Destination (airport, port, hotel or venue)", "Recurring schedule if any"],
    faqIndexes: [0, 6, 7, 10],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "west-palm-beach", "orlando", "florida-keys-key-west"],
  },
  "airport-luggage": {
    headline: "Built around arrival windows, not guesswork.",
    visual: "arrivals",
    group: "luggage",
    steps: [
      { title: "Share the itinerary", text: "Airline, flight numbers, arrival windows and the authorized handoff point for each traveler or group." },
      { title: "Plan the handoff", text: "We confirm the handoff location, terminal rules and access for that airport during quoting." },
      { title: "Track the flight", text: "Dispatch watches for delays and adjusts timing with you. No delivery promise is changed silently." },
      { title: "Deliver and confirm", text: "Bags go to the hotel, cruise port, residence or venue and completion is documented." },
    ],
    prepare: ["Airline and flight numbers", "Arrival or departure windows", "Bag count and oversized items", "Authorized handoff contact", "Final destination address"],
    faqIndexes: [3, 9, 2, 8],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "west-palm-beach", "orlando", "tampa", "fort-myers", "florida-keys-key-west"],
    showAirports: true,
  },
  "cruise-port-luggage": {
    headline: "Timed to the ship schedule, with buffer built in.",
    visual: "sailing",
    group: "luggage",
    steps: [
      { title: "Sailing details", text: "Port, sailing date and embarkation or debarkation timing, plus the hotel or airport on the other end." },
      { title: "Manifest and buffer", text: "We build the plan from a detailed manifest and add realistic buffer for terminal traffic." },
      { title: "One dispatch contact", text: "An accountable dispatcher coordinates timing, terminal rules and any last-minute changes." },
      { title: "Documented delivery", text: "Hotel-to-port, airport-to-port and port-to-hotel movements finish with a documented handoff." },
    ],
    prepare: ["Port and sailing date", "Embarkation or debarkation time", "Pickup or delivery hotel or airport", "Bag count per passenger or group", "Terminal or group coordinator contact"],
    faqIndexes: [3, 4, 5, 9],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "cape-canaveral-port-canaveral", "tampa", "florida-keys-key-west", "west-palm-beach"],
    showPorts: true,
  },
  "luggage-storage": {
    headline: "A controlled bridge between itineraries.",
    visual: "storage",
    group: "luggage",
    steps: [
      { title: "Tell us the gap", text: "When your check-out, flight, cruise or onward transportation leaves bags with nowhere to go." },
      { title: "Choose the combination", text: "Storage only, pickup and storage, storage and later delivery, or the complete door-to-door bridge." },
      { title: "Counted intake", text: "Bags are counted and tagged at intake so the chain of custody is protected while they are held." },
      { title: "Release or deliver", text: "Bags are released to the authorized person or delivered to the next stop on your itinerary." },
    ],
    prepare: ["Drop-off or pickup date and time", "Expected retrieval or delivery time", "Number and size of bags", "Pickup and delivery addresses if transport is included", "Special handling notes"],
    faqIndexes: [5, 9, 2],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "florida-keys-key-west"],
  },
  "sports-entertainment-events": {
    headline: "Load-in, load-out and every handoff in between.",
    visual: "runofshow",
    group: "luggage",
    steps: [
      { title: "Run of show", text: "We work from your schedule: arrivals, hotel, venue load-in, performance or game day and departure." },
      { title: "Gear review", text: "Oversized cases, golf clubs, equipment and team gear are reviewed for size, weight and packaging." },
      { title: "Multi-vehicle plan", text: "Vans and box trucks are staged to the minute, with helpers sized to the load." },
      { title: "Venue handoffs", text: "Every movement ends with a counted, documented handoff to your authorized crew member." },
    ],
    prepare: ["Program schedule and venues", "Team, crew or guest counts", "Equipment list with sizes and weights", "Loading dock and access details", "On-site coordinator contact"],
    faqIndexes: [4, 8, 9, 7],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "orlando", "tampa"],
    showAirports: true,
  },
  "courier-last-mile": {
    headline: "Professional delivery for business items and documents.",
    visual: "route",
    group: "commercial",
    steps: [
      { title: "Book the run", text: "One-off, scheduled or recurring routes for approved business items and documents." },
      { title: "Route and assign", text: "Dispatch sequences stops and assigns the right vehicle for the window you need." },
      { title: "Status along the way", text: "You receive status updates, and any exception is reported right away." },
      { title: "Recipient verified", text: "Delivery is completed with recipient verification and proof of delivery." },
    ],
    prepare: ["Pickup and delivery addresses", "Item type, count and size", "Required delivery window", "Recipient name and contact", "Recurring schedule if any"],
    faqIndexes: [2, 6, 0],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "west-palm-beach", "orlando", "tampa"],
  },
  "cargo-van-box-truck": {
    headline: "From a cargo van to a 26-foot box truck, matched to the job.",
    visual: "fleet",
    group: "commercial",
    steps: [
      { title: "Scope the load", text: "Palletized goods, equipment, event materials or bulk luggage, with weights, dimensions and access." },
      { title: "Match the vehicle", text: "We assign a cargo van or a 15-, 20- or 26-foot box truck based on the real load." },
      { title: "Plan the route", text: "Local and intercity Florida routes are planned for distance, tolls, timing and loading access." },
      { title: "Deliver and document", text: "Loads are delivered to the authorized receiver with a documented handoff." },
    ],
    prepare: ["Pickup and delivery locations", "Pallet or item count, weights and dimensions", "Loading dock, liftgate or stairs details", "Labor needed", "Date, window and deadline"],
    faqIndexes: [0, 1, 4],
    relatedMarkets: ["miami", "fort-lauderdale-broward", "west-palm-beach", "orlando", "tampa", "fort-myers"],
  },
};

export type MarketCopy = {
  headline: string;
  intro: string;
  local: { title: string; text: string }[];
  routes: string[];
  tips: string[];
  spanishLine: string;
};

export const marketCopy: Record<string, MarketCopy> = {
  miami: {
    headline: "Luggage delivery and logistics in Miami, from our headquarters market",
    intro:
      "Miami is where Express Bags was founded in 2010 and where our dispatch operation is based. Our Miami work connects Miami International Airport, PortMiami, private aviation terminals, Miami Beach and Brickell hotels, convention venues and commercial addresses across Miami-Dade.",
    local: [
      { title: "MIA and PortMiami in one plan", text: "Many Miami jobs link a flight arrival to a same-week sailing. We plan the airport handoff, any hotel stop or holding, and the PortMiami delivery as one coordinated movement." },
      { title: "Hotel corridors", text: "Miami Beach, Brickell, Downtown and Key Biscayne properties each have their own loading and parking realities. We confirm access and receiving contacts before dispatch." },
      { title: "Event weekends", text: "Major event weekends tighten road access and hotel docks. Requests made early give dispatch the room to plan realistic windows." },
    ],
    routes: ["MIA to Miami Beach hotels", "Hotel to PortMiami embarkation", "PortMiami debarkation to MIA", "Private aviation terminal to luxury hotel", "Miami business courier runs"],
    tips: ["Share sailing dates and flight numbers together when a trip includes both", "Tell us about loading docks or valet-only entrances", "For groups, send the manifest as early as you have it"],
    spanishLine: "Ofrecemos entrega de equipaje en Miami y traslado de equipaje al puerto de cruceros. Solicite su cotización y nuestro equipo de despacho le confirmará los detalles.",
  },
  "fort-lauderdale-broward": {
    headline: "Fort Lauderdale luggage transfers and Broward County logistics",
    intro:
      "Broward combines a busy airport, one of the world's leading cruise ports and a long stretch of beach hotels and convention venues. Express Bags runs approved routes across Fort Lauderdale and Broward County, from FLL and Port Everglades to hotels, residences and businesses.",
    local: [
      { title: "FLL and Port Everglades are close, timing still matters", text: "The airport and the port sit near each other, but terminal traffic on turnaround days is real. We build buffer into airport-to-port plans and confirm terminal handoff rules." },
      { title: "Beach hotels to inland business districts", text: "From Fort Lauderdale beach hotels to Sunrise, Plantation, Davie and Coral Springs offices, we plan routes around I-95, I-595 and the turnpike." },
      { title: "Boat show and convention season", text: "Large events in Broward bring equipment, materials and guest luggage. Early requests help us reserve the right vehicles." },
    ],
    routes: ["FLL to Port Everglades", "Port Everglades to Fort Lauderdale hotels", "Hotel to FLL departures", "Broward business courier routes", "Convention equipment and materials"],
    tips: ["Include the cruise terminal number if you have it", "For courier routes, list every stop in order", "Tell us if a property requires a certificate of insurance before entry"],
    spanishLine: "Entrega de equipaje en Broward, traslado de maletas en Fort Lauderdale, servicio de equipaje en FLL y traslado de equipaje a Port Everglades, con confirmación de nuestro equipo de despacho.",
  },
  "florida-keys-key-west": {
    headline: "Florida Keys luggage delivery, from Key Largo to Key West",
    intro:
      "The Keys are one long route with very different distances: Key Largo, Islamorada, Marathon, the Lower Keys and Key West each need their own timing. Express Bags plans approved Keys routes, including Key West International Airport and Port of Key West movements.",
    local: [
      { title: "Distance changes everything", text: "A delivery to Key Largo and a delivery to Key West are very different jobs. We quote by the real distance and the single highway that connects the islands." },
      { title: "Resort and marina properties", text: "Many Keys resorts and marinas have specific receiving points. We confirm where and to whom bags should be released." },
      { title: "Weather and traffic awareness", text: "Seasonal traffic and weather can affect the Overseas Highway. Dispatch monitors conditions and tells you early if a plan needs to change." },
    ],
    routes: ["Miami or MIA to Key Largo and Islamorada resorts", "Marathon and Lower Keys deliveries", "Key West hotel and resort transfers", "Key West International Airport (EYW) handoffs", "Port of Key West cruise movements"],
    tips: ["Tell us the exact island or mile marker area", "Allow realistic time windows for the Overseas Highway", "Share resort receiving instructions in advance"],
    spanishLine: "Transporte de equipaje en los Cayos de Florida, desde Key Largo hasta Key West, sujeto a ruta y confirmación de despacho.",
  },
  "west-palm-beach": {
    headline: "West Palm Beach luggage delivery and Palm Beach County logistics",
    intro:
      "Palm Beach County brings resort hospitality, golf, equestrian and boating events together with a growing business district. Express Bags plans approved routes across West Palm Beach and the county, including PBI and the Port of Palm Beach.",
    local: [
      { title: "Resort and club properties", text: "Palm Beach hotels and private clubs often expect discreet, punctual service. Our teams confirm counts quietly and hand off only to authorized staff." },
      { title: "Golf, equestrian and boat events", text: "Golf bags, tack trunks and event materials need careful handling. We review sizes and packaging before quoting." },
      { title: "Port of Palm Beach movements", text: "We coordinate luggage around Port of Palm Beach schedules and terminal rules." },
    ],
    routes: ["PBI to Palm Beach resorts", "Resort to PBI departures", "Port of Palm Beach transfers", "Golf and sports equipment delivery", "West Palm Beach courier routes"],
    tips: ["Tell us about gated entrances or club rules", "List golf bags and equipment separately from luggage", "Share event load-in times early"],
    spanishLine: "Traslado de maletas en West Palm Beach y servicio de equipaje en PBI, con cotización y confirmación de despacho.",
  },
  orlando: {
    headline: "Orlando luggage delivery for resorts, conventions and cruise groups",
    intro:
      "Orlando runs on resort stays, convention programs and group travel, and many visitors continue to Port Canaveral. Express Bags plans approved Orlando-area routes involving Orlando International Airport, hotels and resorts, convention groups and Orlando-to-Port Canaveral transfers.",
    local: [
      { title: "Convention programs", text: "Convention groups need materials, equipment and luggage to arrive in a set order. We plan around show schedules and venue loading rules." },
      { title: "Resort groups", text: "Large resort groups mean multiple buildings and receiving points. We work from your rooming or group manifest." },
      { title: "The cruise corridor", text: "Orlando to Port Canaveral is one of Florida's busiest leisure corridors. We plan hotel or airport pickups to meet embarkation timing." },
    ],
    routes: ["MCO to Orlando resorts", "Convention equipment and materials", "Resort to Port Canaveral embarkation", "Port Canaveral debarkation to MCO", "Orlando courier routes"],
    tips: ["Share convention move-in and move-out times", "Tell us which resort building or tower receives the bags", "For cruise transfers, include sailing date and terminal"],
    spanishLine: "Entrega de equipaje en Orlando para hoteles, convenciones y traslados al puerto, con cotización previa.",
  },
  tampa: {
    headline: "Tampa luggage delivery, cruise transfers and courier routes",
    intro:
      "Tampa combines a busy international airport, Port Tampa Bay cruise traffic, downtown convention venues and a strong professional sports calendar. Express Bags plans approved Tampa-area routes for hotels, cruise movements, events and commercial accounts.",
    local: [
      { title: "TPA and Port Tampa Bay", text: "We coordinate airport arrivals with cruise embarkation and debarkation, with buffer for terminal traffic." },
      { title: "Events and sports traffic", text: "Downtown events and game days change traffic patterns. Dispatch plans windows around them." },
      { title: "Bay-area routes", text: "Deliveries between Tampa, St. Petersburg and Clearwater are planned around bridge crossings and timing." },
    ],
    routes: ["TPA to downtown and Westshore hotels", "Hotel to Port Tampa Bay", "Port Tampa Bay to TPA", "Event equipment delivery", "Tampa courier routes"],
    tips: ["Include the cruise terminal if known", "Tell us if delivery crosses the bay", "Share event or game-day schedules"],
    spanishLine: "Servicio de equipaje en Tampa, traslados al puerto de cruceros y entregas comerciales, sujetos a confirmación de despacho.",
  },
  "fort-myers": {
    headline: "Fort Myers luggage delivery for resorts and seasonal travel",
    intro:
      "Southwest Florida's peak season brings resort guests, group travel and seasonal events to Fort Myers, Naples, Sanibel and nearby communities. Express Bags plans approved Fort Myers and Lee County routes involving Southwest Florida International Airport, hotels and resorts and commercial accounts.",
    local: [
      { title: "Seasonal demand", text: "Winter and early spring are the busiest months. Booking early gives dispatch room to plan the right vehicle." },
      { title: "Island and beach resorts", text: "Beach and island properties can have limited loading areas. We confirm receiving points in advance." },
      { title: "Group and event travel", text: "Seasonal tournaments and group programs need luggage and equipment on time, with counted handoffs." },
    ],
    routes: ["RSW to Fort Myers and Naples resorts", "Resort to RSW departures", "Group luggage for seasonal programs", "Sports and event equipment", "Fort Myers courier routes"],
    tips: ["Tell us the island or beach community", "Share seasonal program dates early", "List equipment and oversized items separately"],
    spanishLine: "Entrega de equipaje en Fort Myers para hoteles, grupos y viajes de temporada, con cotización previa.",
  },
  "cape-canaveral-port-canaveral": {
    headline: "Port Canaveral cruise luggage service and the Orlando corridor",
    intro:
      "Port Canaveral is one of the busiest cruise ports in the world, and many of its passengers start in Orlando. Express Bags plans approved cruise luggage transfers, hotel-to-port and airport-to-port movements, and group logistics along the Orlando to Port Canaveral corridor.",
    local: [
      { title: "Embarkation day timing", text: "Port Canaveral turnaround days are busy. We plan pickups with realistic buffer and confirm terminal handoff rules." },
      { title: "Orlando to the port", text: "Hotel and airport pickups in Orlando are timed to meet your sailing, so the luggage is handled while you travel." },
      { title: "Groups and programs", text: "Cruise groups need manifests, counts and one accountable dispatcher. We work from your group list." },
    ],
    routes: ["MCO to Port Canaveral", "Orlando resorts to Port Canaveral", "Cocoa Beach hotels to the port", "Port Canaveral debarkation to MCO", "Cruise group luggage"],
    tips: ["Share sailing date, terminal and time", "Tell us your Orlando hotel or flight", "Send group manifests as early as possible"],
    spanishLine: "Traslado de equipaje a Puerto Cañaveral desde Orlando y la zona del cabo, sujeto a confirmación de despacho.",
  },
};

export type FacilityCopy = { intro: string; routes: string[]; notes: string[] };

export const airportCopy: Record<string, FacilityCopy> = {
  MIA: {
    intro: "Miami International Airport is our home airport. We plan luggage pickups and deliveries for arriving and departing travelers, groups, hotels, DMCs and teams, with authorized handoff points confirmed for each job.",
    routes: ["MIA to Miami Beach, Brickell and Downtown hotels", "MIA to PortMiami for same-week sailings", "Hotels and PortMiami back to MIA", "Private aviation terminal handoffs"],
    notes: ["Large groups often arrive across several flights. We plan by arrival wave.", "Share airline, flight numbers and baggage counts per traveler."],
  },
  FLL: {
    intro: "Fort Lauderdale-Hollywood International Airport sits close to Port Everglades and the beach hotel corridor. We plan FLL pickups and deliveries for travelers, groups, cruise passengers and event programs.",
    routes: ["FLL to Port Everglades", "FLL to Fort Lauderdale beach hotels", "Hotels and Port Everglades back to FLL", "Private aviation terminal handoffs"],
    notes: ["Airport-to-port plans include buffer for turnaround-day traffic.", "Tell us the terminal and airline for each arrival."],
  },
  EYW: {
    intro: "Key West International Airport is the gateway to the Lower Keys. We plan luggage handoffs at EYW for Key West hotels, resorts, marinas and cruise movements.",
    routes: ["EYW to Key West hotels and resorts", "Key West hotels back to EYW", "Miami to Key West luggage routes", "Port of Key West connections"],
    notes: ["Routes to and from the mainland follow the Overseas Highway, so allow realistic windows.", "Share resort receiving instructions in advance."],
  },
  PBI: {
    intro: "The West Palm Beach airport, now officially named President Donald J. Trump International Airport and still widely known as Palm Beach International (PBI), serves Palm Beach resorts, clubs and events. We plan PBI luggage pickups and deliveries for travelers, groups and equipment.",
    routes: ["PBI to Palm Beach resorts and clubs", "Resorts back to PBI", "PBI to Port of Palm Beach", "Golf and event equipment from PBI"],
    notes: ["List golf bags and sports equipment separately.", "Tell us about gated or club entrances."],
  },
  MCO: {
    intro: "Orlando International Airport connects resort, convention and cruise travel. We plan MCO luggage pickups and deliveries for resort guests, convention groups and travelers continuing to Port Canaveral.",
    routes: ["MCO to Orlando resorts", "MCO to convention venues", "MCO to Port Canaveral", "Port Canaveral back to MCO"],
    notes: ["For cruise transfers, share sailing date and terminal.", "Convention groups should share move-in times."],
  },
  TPA: {
    intro: "Tampa International Airport serves downtown and Westshore hotels, Port Tampa Bay and a busy events calendar. We plan TPA luggage pickups and deliveries for travelers, groups and cruise passengers.",
    routes: ["TPA to downtown and Westshore hotels", "TPA to Port Tampa Bay", "Port Tampa Bay back to TPA", "Event and team equipment from TPA"],
    notes: ["Tell us if delivery crosses the bay to St. Petersburg or Clearwater.", "Share event or game-day schedules."],
  },
  RSW: {
    intro: "Southwest Florida International Airport serves Fort Myers, Naples, Sanibel and nearby resorts. We plan RSW luggage pickups and deliveries for resort guests, seasonal groups and events.",
    routes: ["RSW to Fort Myers and Naples resorts", "Resorts back to RSW", "Seasonal group luggage", "Sports and event equipment"],
    notes: ["Peak season fills quickly, so request early.", "Tell us the island or beach community."],
  },
};

export const portCopy: Record<string, FacilityCopy> = {
  portmiami: {
    intro: "PortMiami is one of the world's busiest cruise ports and part of our headquarters market. We coordinate timed luggage movements between PortMiami, MIA, Miami hotels and other approved locations.",
    routes: ["Miami hotels to PortMiami embarkation", "MIA to PortMiami", "PortMiami debarkation to MIA", "PortMiami to hotels and residences"],
    notes: ["Share terminal and sailing time.", "Large groups should send manifests early."],
  },
  "port-everglades": {
    intro: "Port Everglades is Broward County's cruise and cargo port, close to FLL and the Fort Lauderdale hotel corridor. We coordinate cruise luggage transfers to and from the port.",
    routes: ["FLL to Port Everglades", "Fort Lauderdale hotels to Port Everglades", "Port Everglades debarkation to FLL", "Port Everglades to Miami hotels and MIA"],
    notes: ["Turnaround days are busy, so we build in buffer.", "Include the terminal number if known."],
  },
  "port-of-key-west": {
    intro: "Port of Key West welcomes cruise calls into the heart of Key West. We coordinate approved luggage movements involving the port, Key West hotels and EYW.",
    routes: ["Key West hotels to the port", "Port to EYW", "Mainland to Key West luggage routes"],
    notes: ["Port and city rules vary by berth, so access is confirmed during quoting.", "Allow realistic windows for the Overseas Highway."],
  },
  "port-of-palm-beach": {
    intro: "Port of Palm Beach serves cruise and ferry traffic in Palm Beach County. We coordinate luggage movements between the port, PBI and Palm Beach hotels and resorts.",
    routes: ["PBI to Port of Palm Beach", "Palm Beach hotels to the port", "Port back to PBI and resorts"],
    notes: ["Share sailing schedule and terminal details.", "Tell us about any gated property entrances."],
  },
  "port-canaveral": {
    intro: "Port Canaveral is one of Florida's busiest cruise ports and the end point of the Orlando cruise corridor. We coordinate luggage transfers from Orlando hotels, MCO and Cocoa Beach to the port, and back.",
    routes: ["MCO to Port Canaveral", "Orlando resorts to Port Canaveral", "Cocoa Beach hotels to the port", "Port Canaveral debarkation to MCO"],
    notes: ["Share sailing date, terminal and time.", "Groups should send manifests early."],
  },
  "port-tampa-bay": {
    intro: "Port Tampa Bay brings cruise traffic into downtown Tampa. We coordinate luggage movements between the port, TPA and Tampa-area hotels.",
    routes: ["TPA to Port Tampa Bay", "Tampa hotels to the port", "Port Tampa Bay debarkation to TPA"],
    notes: ["Include the cruise terminal if known.", "Downtown events can affect traffic, so share your timing early."],
  },
};
