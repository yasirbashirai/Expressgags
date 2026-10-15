/**
 * Spanish (es-US) public copy for the /es pages: home, services overview and the 8 market pages.
 * Written for Spanish-speaking customers in Miami and Florida (not a literal translation).
 * Same rules as the English site: no guarantees, no "24/7", same-day always subject to dispatch,
 * no named clients, no moving or food delivery.
 */

export const esCommon = {
  cta: "Solicitar cotización",
  ctaHref: "/request-a-quote?lang=es",
  call: "Llamar",
  tagline: "Con cuidado en cada maleta. Con confianza en cada entrega.",
  dispatchNote: "Cada ruta, horario y vehículo se confirma con despacho antes de comprometernos.",
  sameDay: "El servicio el mismo día, urgente o entre ciudades puede estar disponible según capacidad, distancia, acceso y confirmación de despacho.",
  pricing: "Los precios se cotizan según la ruta, el vehículo, el personal, el horario y el manejo requerido.",
  otherRoute: "Otras rutas dentro de Florida pueden considerarse mediante cotización especial.",
  visits: "Visitas solo con cita previa",
};

export const esHome = {
  eyebrow: "Con sede en Miami · desde 2010",
  title: "Su equipaje, en manos expertas.",
  titleAccent: "Su entrega, con total confianza.",
  lead: "Logística de equipaje para hoteles, aeropuertos y puertos de cruceros, mensajería profesional, entregas de última milla, almacenamiento de maletas y transporte en furgoneta o camión de caja, conectando Miami con los principales destinos turísticos de Florida.",
  stats: [
    ["8", "Mercados en Florida"],
    ["7", "Aeropuertos"],
    ["6", "Puertos de cruceros"],
  ] as [string, string][],
  servicesTitle: "Ocho servicios. Un solo socio logístico responsable.",
  servicesLead: "Desde una maleta VIP hasta un camión de 26 pies con equipo para un evento, cada trabajo se planifica, se cuenta y se documenta con un solo equipo de despacho.",
  stepsTitle: "Así funciona cada trabajo",
  steps: [
    { t: "Solicitud", d: "Cuéntenos qué se mueve, desde dónde, hacia dónde y cuándo. Una solicitud completa permite una cotización más rápida y precisa." },
    { t: "Cotización", d: "Despacho calcula el precio según la ruta, el vehículo, el personal, el horario y el manejo, y le envía una cotización por escrito." },
    { t: "Reserva", d: "Usted aprueba la cotización, confirmamos contactos, itinerario y manifiesto, y recibe la confirmación de su reserva." },
    { t: "Despacho", d: "Asignamos el vehículo y el equipo adecuados con una orden de trabajo completa y un despachador responsable." },
    { t: "Entrega", d: "Contamos cada pieza, la entregamos solo a la persona autorizada y documentamos la entrega." },
  ],
  careTitle: "Nuestro estándar de cuidado",
  care: [
    "Llegar a tiempo o antes del horario confirmado",
    "Confirmar instrucciones y cantidad de maletas antes de cargar",
    "Identificar cada pieza según el manifiesto",
    "Nunca dejar pertenencias sin supervisión ni entregarlas a una persona no autorizada",
    "Comunicar de inmediato cualquier retraso o diferencia en el conteo",
    "Volver a contar en la entrega y documentar la prueba de entrega",
  ],
  marketsTitle: "Sede en Miami. Ocho mercados prioritarios en Florida.",
  b2bTitle: "Para hoteles, DMC, organizadores de eventos y empresas",
  b2bText: "Cuentas empresariales con términos aprobados, facturación centralizada, números de orden de compra, rutas recurrentes, manifiestos, planificación con varios vehículos, un contacto de despacho dedicado y prueba de entrega en cada trabajo.",
  travelerTitle: "¿Viaja con equipaje?",
  travelerText: "Del hotel al aeropuerto, al puerto de cruceros o a su residencia, con almacenamiento temporal cuando los horarios de salida, vuelos o embarque no coinciden.",
  closingTitle: "¿Planea un traslado de hotel, crucero o grupo?",
  closingText: "Comparta la ruta, la fecha y la cantidad de piezas. Despacho confirma vehículo, personal, horario y acceso, y le envía una cotización por escrito.",
};

export const esServices: Record<string, { name: string; short: string }> = {
  "vip-group-luggage": { name: "Traslados de equipaje VIP y para grupos", short: "Recogida coordinada, carga segura y entrega verificada para viajeros VIP y grupos grandes." },
  "hotel-hospitality-logistics": { name: "Logística para hoteles, resorts y DMC", short: "Traslados programados y a pedido para hoteles, resorts, conserjería y empresas de gestión de destinos." },
  "airport-luggage": { name: "Logística de equipaje en aeropuertos", short: "Recogida y entrega planificadas en los principales aeropuertos de Florida, según horarios de llegada." },
  "cruise-port-luggage": { name: "Equipaje en puertos de cruceros", short: "Traslados coordinados con el itinerario del barco, con manifiestos y tiempo de margen." },
  "luggage-storage": { name: "Almacenamiento de maletas y entrega diferida", short: "Resguardo temporal cuando el check-out, el vuelo o el embarque no coinciden, bajo cotización." },
  "sports-entertainment-events": { name: "Logística deportiva, de entretenimiento y eventos", short: "Equipaje, equipo deportivo y material de producción con horarios exactos para equipos, artistas y eventos." },
  "courier-last-mile": { name: "Mensajería profesional y última milla", short: "Entregas programadas y urgentes de documentos y artículos empresariales, con prueba de entrega." },
  "cargo-van-box-truck": { name: "Logística en furgoneta y camión de caja", short: "Capacidad regional y entre ciudades, desde furgonetas de carga hasta camiones de caja de 26 pies." },
};

export type EsMarket = { name: string; headline: string; intro: string; points: { t: string; d: string }[]; routes: string[]; tips: string[] };

export const esMarkets: Record<string, EsMarket> = {
  miami: {
    name: "Miami y Miami-Dade",
    headline: "Entrega y traslado de equipaje en Miami",
    intro: "Nuestra sede está en Miami. Coordinamos la entrega de equipaje en Miami entre hoteles, el Aeropuerto Internacional de Miami (MIA), PortMiami, terminales de aviación privada, recintos de eventos y empresas en todo Miami-Dade.",
    points: [
      { t: "Conocimiento local", d: "Años de experiencia con los hoteles de Miami Beach, Brickell y el centro, y con los días de embarque de PortMiami." },
      { t: "Traslado de equipaje al puerto de cruceros", d: "Movimientos del hotel o del aeropuerto al barco con manifiesto, margen de tiempo y un despachador responsable." },
      { t: "Empresas y eventos", d: "Mensajería, última milla y camiones de caja para hoteles, convenciones, producciones y cuentas comerciales." },
    ],
    routes: ["Hotel en Miami Beach → PortMiami", "MIA → hotel en Brickell o el centro", "Hotel → terminal de aviación privada", "Doral → entregas comerciales en Miami-Dade"],
    tips: ["Indique la naviera, el barco y la fecha de salida para traslados al puerto.", "Para llegadas a MIA, comparta números de vuelo y punto de entrega autorizado.", "Los días de mucho embarque conviene reservar con anticipación."],
  },
  "fort-lauderdale-broward": {
    name: "Fort Lauderdale y Broward",
    headline: "Traslado de maletas en Fort Lauderdale y Broward",
    intro: "Traslados de maletas en Fort Lauderdale y rutas aprobadas en el condado de Broward, incluido el aeropuerto FLL, Port Everglades, hoteles, resorts, convenciones y cuentas empresariales.",
    points: [
      { t: "Servicio de equipaje en FLL", d: "Recogida y entrega según los horarios de llegada y salida, con punto de entrega confirmado durante la cotización." },
      { t: "Traslado de equipaje a Port Everglades", d: "Coordinación con los días de embarque y desembarque de uno de los puertos de cruceros más activos del mundo." },
      { t: "Todo Broward", d: "Hollywood, Miramar, Pembroke Pines, Pompano Beach, Coral Springs, Sunrise, Plantation, Davie y Deerfield Beach, según ruta aprobada." },
    ],
    routes: ["FLL → hotel en Fort Lauderdale Beach", "Hotel → Port Everglades", "Port Everglades → MIA o FLL", "Rutas comerciales en Broward"],
    tips: ["Los días de crucero el tráfico hacia el puerto aumenta; reserve con margen.", "Indique si hay equipaje sobredimensionado o equipo deportivo.", "Para grupos, prepare un manifiesto con cantidad de maletas por persona."],
  },
  "florida-keys-key-west": {
    name: "Cayos de Florida y Key West",
    headline: "Transporte de equipaje en los Cayos de Florida",
    intro: "Transporte de equipaje en los Cayos de Florida, desde Key Largo, Islamorada y Marathon hasta Key West, incluidos el Aeropuerto Internacional de Key West y movimientos en el Puerto de Key West.",
    points: [
      { t: "Rutas largas, planificadas", d: "La distancia entre Key Largo y Key West requiere planificación de horarios, peajes y tiempos de espera." },
      { t: "Hoteles y resorts", d: "Traslados entre resorts, marinas, residencias y el aeropuerto EYW según ruta aprobada." },
      { t: "Temporada alta", d: "Los periodos de mayor turismo exigen reservar con anticipación." },
    ],
    routes: ["Miami → resort en Key Largo o Islamorada", "EYW → hotel en Key West", "Marathon → aeropuerto de Miami", "Puerto de Key West → hotel"],
    tips: ["Indique la dirección exacta del resort o la marina.", "Considere el tiempo de traslado por la Overseas Highway.", "Comparta el contacto en destino para la entrega."],
  },
  "west-palm-beach": {
    name: "West Palm Beach y Palm Beach",
    headline: "Traslado de maletas en West Palm Beach",
    intro: "Traslado de maletas en West Palm Beach y rutas aprobadas en el condado de Palm Beach, con énfasis en el aeropuerto PBI, el Puerto de Palm Beach, hoteles, resorts, eventos y cuentas comerciales.",
    points: [
      { t: "Aeropuerto PBI", d: "Recogidas y entregas planificadas según horarios de vuelo y punto de entrega autorizado." },
      { t: "Hoteles y temporada", d: "Traslados para huéspedes, grupos y eventos de golf, náutica y ecuestres." },
      { t: "Conexión con Miami y Broward", d: "Rutas entre Palm Beach, Fort Lauderdale y Miami según capacidad y despacho." },
    ],
    routes: ["PBI → hotel en Palm Beach", "Hotel → Port Everglades o PortMiami", "Boca Raton → MIA", "Rutas comerciales en Palm Beach"],
    tips: ["Durante temporada alta, reserve con anticipación.", "Indique equipo de golf o equipaje especial.", "Comparta los contactos de recogida y entrega."],
  },
  orlando: {
    name: "Orlando",
    headline: "Entrega de equipaje en Orlando",
    intro: "Entrega de equipaje en Orlando y rutas aprobadas del área metropolitana, con énfasis en el Aeropuerto Internacional de Orlando (MCO), hoteles y resorts, grupos de convenciones, eventos y traslados de Orlando a Port Canaveral.",
    points: [
      { t: "Convenciones y resorts", d: "Logística de equipaje y materiales para grupos de convenciones y resorts del área de International Drive y Lake Buena Vista." },
      { t: "Orlando a Port Canaveral", d: "Traslados coordinados con el horario de embarque, con margen para el tráfico del corredor." },
      { t: "Aeropuerto MCO", d: "Recogidas y entregas planificadas según llegadas y salidas." },
    ],
    routes: ["MCO → resort en Lake Buena Vista", "Hotel en Orlando → Port Canaveral", "Centro de convenciones → hotel", "Rutas comerciales en Orlando"],
    tips: ["Para grupos de convención, prepare un manifiesto por habitación.", "Indique el horario de embarque si va a Port Canaveral.", "Las temporadas de parques temáticos aumentan la demanda."],
  },
  tampa: {
    name: "Tampa",
    headline: "Servicio de equipaje en Tampa",
    intro: "Servicio de equipaje en Tampa y rutas aprobadas del área metropolitana, con énfasis en el Aeropuerto Internacional de Tampa (TPA), Port Tampa Bay, hoteles, cruceros, eventos y cuentas comerciales.",
    points: [
      { t: "Port Tampa Bay", d: "Traslados coordinados con los días de crucero y el horario de embarque." },
      { t: "Aeropuerto TPA", d: "Recogidas y entregas según horarios de vuelo y punto de entrega autorizado." },
      { t: "Eventos y deportes", d: "Logística para convenciones, festivales y eventos deportivos profesionales." },
    ],
    routes: ["TPA → hotel en Tampa", "Hotel → Port Tampa Bay", "St. Petersburg → TPA", "Rutas comerciales en Tampa"],
    tips: ["Indique la naviera y el barco para traslados al puerto.", "Prepare el conteo de maletas por persona.", "Comparta contactos en ambos extremos."],
  },
  "fort-myers": {
    name: "Fort Myers",
    headline: "Entrega de equipaje en Fort Myers",
    intro: "Entrega de equipaje en Fort Myers y rutas aprobadas en el condado de Lee, con énfasis en el Aeropuerto Internacional del Suroeste de Florida (RSW), hoteles y resorts, viajes de grupos de temporada y cuentas comerciales.",
    points: [
      { t: "Aeropuerto RSW", d: "Recogidas y entregas planificadas para viajeros y grupos." },
      { t: "Turismo de temporada", d: "Más demanda en invierno y primavera; reserve con anticipación." },
      { t: "Naples, Cape Coral y Sanibel", d: "Rutas aprobadas en la región según capacidad y despacho." },
    ],
    routes: ["RSW → resort en Fort Myers Beach", "Naples → RSW", "Hotel → residencia de temporada", "Rutas comerciales en el condado de Lee"],
    tips: ["Indique la dirección exacta del resort.", "Para grupos, comparta el manifiesto.", "Las rutas largas requieren planificación de horario."],
  },
  "cape-canaveral-port-canaveral": {
    name: "Cape Canaveral y Port Canaveral",
    headline: "Traslado de equipaje a Puerto Cañaveral",
    intro: "Traslado de equipaje a Puerto Cañaveral y Cape Canaveral, con énfasis en equipaje de cruceros, traslados del hotel o el aeropuerto al puerto, logística para grupos y el corredor entre Orlando y Port Canaveral.",
    points: [
      { t: "Días de embarque", d: "Planificamos según el horario del barco, con margen de tiempo para la terminal." },
      { t: "Desde Orlando", d: "Traslados desde MCO y hoteles de Orlando hasta el puerto." },
      { t: "Grupos", d: "Manifiestos, conteo por pasajero y varios vehículos cuando el volumen lo requiere." },
    ],
    routes: ["MCO → Port Canaveral", "Hotel en Cocoa Beach → Port Canaveral", "Port Canaveral → hotel en Orlando", "Grupos de crucero desde Orlando"],
    tips: ["Indique naviera, barco y fecha de salida.", "Considere el tráfico del corredor Orlando–Port Canaveral.", "Comparta la cantidad de maletas por pasajero."],
  },
};
