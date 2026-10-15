/**
 * Owner & Operations Dashboard data and business reports (requirements #1, form Q34/Q35, Master §13).
 * Revenue is reported two ways: BOOKED (non-cancelled order value) and COLLECTED (succeeded payments
 * minus refunds). Margin uses each order's recorded cost; orders without cost are excluded from margin.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { agingReport } from "../billing/invoices";

const DAY = 86400000;
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = (d = new Date()) => new Date(startOfDay(d).getTime() - ((d.getDay() + 6) % 7) * DAY); // Monday
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfYear = (d = new Date()) => new Date(d.getFullYear(), 0, 1);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

const ACTIVE: Prisma.OrderWhereInput["status"] = { in: ["EN_ROUTE", "PICKED_UP", "AT_FACILITY", "TRANSFERRED_TO_CARRIER", "IN_TRANSIT", "OUT_FOR_DELIVERY"] };

async function bookedSince(from: Date) {
  const r = await prisma.order.aggregate({ where: { createdAt: { gte: from }, status: { not: "CANCELLED" } }, _sum: { retailCents: true }, _count: { _all: true } });
  return { cents: r._sum.retailCents ?? 0, orders: r._count._all };
}
async function collectedSince(from: Date) {
  const [inn, out] = await Promise.all([
    prisma.payment.aggregate({ where: { createdAt: { gte: from }, status: "SUCCEEDED", kind: { not: "REFUND" } }, _sum: { amountCents: true } }),
    prisma.payment.aggregate({ where: { createdAt: { gte: from }, status: "SUCCEEDED", kind: "REFUND" }, _sum: { amountCents: true } }),
  ]);
  return (inn._sum.amountCents ?? 0) - (out._sum.amountCents ?? 0);
}

export async function dashboardData(opts: { includeMoney: boolean; includeOps: boolean }) {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY);
  const since90 = new Date(now.getTime() - 90 * DAY);

  const [todayOrders, newQuotes, pendingOrders, awaitingAcceptance, activeDeliveries, openExceptions, todaysAssignments] = await Promise.all([
    prisma.order.findMany({
      where: { serviceDate: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } },
      orderBy: [{ windowStart: "asc" }, { createdAt: "asc" }],
      take: 50,
      include: { customer: { select: { name: true } }, assignments: { where: { status: { not: "REMOVED" } }, select: { role: true, employeeId: true, vehicleId: true } } },
    }),
    prisma.quoteRequest.count({ where: { status: "NEW" } }),
    prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.quotation.count({ where: { status: { in: ["SENT", "VIEWED"] } } }),
    prisma.order.count({ where: { status: ACTIVE } }),
    prisma.orderException.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
    prisma.assignment.findMany({ where: { status: { not: "REMOVED" }, order: { serviceDate: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } } }, select: { role: true, employeeId: true, vehicleId: true } }),
  ]);

  const assignments = {
    drivers: new Set(todaysAssignments.filter((a) => a.role === "DRIVER").map((a) => a.employeeId)).size,
    helpers: new Set(todaysAssignments.filter((a) => a.role === "HELPER").map((a) => a.employeeId)).size,
    trucks: new Set(todaysAssignments.map((a) => a.vehicleId).filter(Boolean)).size,
    unassignedToday: todayOrders.filter((o) => !o.assignments.some((a) => a.role === "DRIVER")).length,
  };

  // Activity feed: newest quotes, status changes, payments, quotation acceptances
  const [recentQuotes, recentEvents, recentPayments, recentAccepted] = await Promise.all([
    prisma.quoteRequest.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, reference: true, createdAt: true, serviceType: true, customer: { select: { name: true } } } }),
    prisma.orderEvent.findMany({ where: { type: "STATUS" }, orderBy: { createdAt: "desc" }, take: 10, select: { createdAt: true, detail: true, order: { select: { id: true, reference: true } } } }),
    opts.includeMoney ? prisma.payment.findMany({ where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, take: 8, select: { createdAt: true, amountCents: true, kind: true, order: { select: { reference: true } }, invoice: { select: { number: true } } } }) : Promise.resolve([]),
    prisma.quotation.findMany({ where: { acceptedAt: { not: null } }, orderBy: { acceptedAt: "desc" }, take: 6, select: { id: true, reference: true, acceptedAt: true, acceptedName: true } }),
  ]);
  const activity = [
    ...recentQuotes.map((q) => ({ at: q.createdAt, kind: "quote", text: `New quote request ${q.reference} from ${q.customer.name}`, href: `/admin/quotes/${q.id}` })),
    ...recentEvents.map((e) => ({ at: e.createdAt, kind: "status", text: `${e.order.reference}: ${e.detail ?? "status updated"}`, href: `/admin/orders/${e.order.id}` })),
    ...recentPayments.map((p) => ({ at: p.createdAt, kind: "payment", text: `${p.kind === "REFUND" ? "Refund" : p.kind === "DEPOSIT" ? "Deposit" : "Payment"} ${(p.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} · ${p.invoice?.number ?? p.order?.reference ?? ""}`, href: "/admin/billing?tab=payments" })),
    ...recentAccepted.map((q) => ({ at: q.acceptedAt!, kind: "accepted", text: `Quotation ${q.reference} accepted by ${q.acceptedName}`, href: `/admin/quotations/${q.id}` })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 14);

  const kpis = await performanceKpis(since90);
  const targets = await successTargets(now);

  let money = null;
  if (opts.includeMoney) {
    const [bd, bw, bm, by, cd, cw, cm, cy, aging, trend] = await Promise.all([
      bookedSince(today), bookedSince(startOfWeek(now)), bookedSince(startOfMonth(now)), bookedSince(startOfYear(now)),
      collectedSince(today), collectedSince(startOfWeek(now)), collectedSince(startOfMonth(now)), collectedSince(startOfYear(now)),
      agingReport(now),
      revenueTrend(30),
    ]);
    money = {
      booked: { day: bd.cents, week: bw.cents, month: bm.cents, year: by.cents },
      collected: { day: cd, week: cw, month: cm, year: cy },
      ordersThisMonth: bm.orders,
      outstanding: { totalCents: aging.totalCents, buckets: aging.buckets, overdueInvoices: aging.invoices.filter((i) => i.bucket !== "current").length, openInvoices: aging.invoices.length },
      trend,
    };
  }

  return {
    generatedAt: now,
    ops: opts.includeOps
      ? {
          todayOrders: todayOrders.map((o) => ({ id: o.id, reference: o.reference, status: o.status, serviceType: o.serviceType, market: o.market, timeWindow: o.timeWindow, customer: o.customer.name, assigned: o.assignments.some((a) => a.role === "DRIVER") })),
          assignments,
        }
      : null,
    counts: { newQuotes, pendingOrders, awaitingAcceptance, activeDeliveries, openExceptions, todayJobs: todayOrders.length },
    activity,
    kpis: opts.includeMoney ? kpis : { ...kpis, marginByService: [] },
    targets,
    money,
  };
}

/** Booked and collected per day for the last N days. */
export async function revenueTrend(days: number) {
  const from = startOfDay(new Date(Date.now() - (days - 1) * DAY));
  const [orders, pays] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: from }, status: { not: "CANCELLED" } }, select: { createdAt: true, retailCents: true } }),
    prisma.payment.findMany({ where: { createdAt: { gte: from }, status: "SUCCEEDED" }, select: { createdAt: true, amountCents: true, kind: true } }),
  ]);
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(from.getTime() + i * DAY);
    return { date: d.toISOString().slice(0, 10), bookedCents: 0, collectedCents: 0 };
  });
  const idx = (d: Date) => Math.floor((startOfDay(d).getTime() - from.getTime()) / DAY);
  for (const o of orders) {
    const b = buckets[idx(o.createdAt)];
    if (b) b.bookedCents += o.retailCents ?? 0;
  }
  for (const p of pays) {
    const b = buckets[idx(p.createdAt)];
    if (b) b.collectedCents += p.kind === "REFUND" ? -p.amountCents : p.amountCents;
  }
  return buckets;
}

/** Form Q35 KPI set over a window. */
export async function performanceKpis(from: Date) {
  const [quotes, quotations, orders, delivered] = await Promise.all([
    prisma.quoteRequest.findMany({ where: { createdAt: { gte: from } }, select: { id: true, createdAt: true, status: true, order: { select: { id: true } }, quotations: { select: { sentAt: true } } } }),
    prisma.quotation.findMany({ where: { createdAt: { gte: from }, source: "manual" }, select: { status: true, sentAt: true } }),
    prisma.order.findMany({ where: { createdAt: { gte: from }, status: { not: "CANCELLED" } }, select: { id: true, serviceType: true, market: true, retailCents: true, costCents: true, customerId: true } }),
    prisma.order.findMany({ where: { status: "DELIVERED", completedAt: { gte: from } }, select: { id: true, completedAt: true, windowEnd: true, proofs: { where: { kind: { in: ["DELIVERY", "RELEASE"] } }, select: { id: true } } } }),
  ]);

  // Quote response time: request received → first quotation sent
  const responseHours = quotes
    .map((q) => {
      const sent = q.quotations.map((x) => x.sentAt).filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0];
      return sent ? (sent.getTime() - q.createdAt.getTime()) / 3600000 : null;
    })
    .filter((h): h is number => h !== null);
  const avgResponseHours = responseHours.length ? Math.round((responseHours.reduce((a, b) => a + b, 0) / responseHours.length) * 10) / 10 : null;

  const converted = quotes.filter((q) => q.status === "WON" || q.order).length;
  const sentQuotations = quotations.filter((q) => q.sentAt);
  const won = sentQuotations.filter((q) => ["ACCEPTED", "CONVERTED"].includes(q.status)).length;

  const group = (key: "serviceType" | "market") => {
    const m = new Map<string, { key: string; jobs: number; retailCents: number; costCents: number; costedRetail: number }>();
    for (const o of orders) {
      const k = o[key];
      const r = m.get(k) ?? { key: k, jobs: 0, retailCents: 0, costCents: 0, costedRetail: 0 };
      r.jobs++;
      r.retailCents += o.retailCents ?? 0;
      if (o.costCents != null && o.retailCents != null) {
        r.costCents += o.costCents;
        r.costedRetail += o.retailCents;
      }
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.jobs - a.jobs);
  };

  const byCustomer = new Map<string, number>();
  for (const o of orders) byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + 1);
  const repeatCustomers = [...byCustomer.values()].filter((n) => n > 1).length;

  const withWindow = delivered.filter((d) => d.windowEnd);
  const onTime = withWindow.filter((d) => d.completedAt! <= d.windowEnd!).length;

  return {
    windowDays: Math.round((Date.now() - from.getTime()) / DAY),
    avgQuoteResponseHours: avgResponseHours,
    quoteToBookingPercent: pct(converted, quotes.length),
    quotationWinPercent: pct(won, sentQuotations.length),
    jobsByService: group("serviceType").map((g) => ({ key: g.key, jobs: g.jobs })),
    jobsByMarket: group("market").map((g) => ({ key: g.key, jobs: g.jobs })),
    marginByService: group("serviceType")
      .filter((g) => g.costedRetail > 0)
      .map((g) => ({ key: g.key, marginPercent: pct(g.costedRetail - g.costCents, g.costedRetail), retailCents: g.retailCents })),
    repeatBookingPercent: pct(repeatCustomers, byCustomer.size),
    podCompletionPercent: pct(delivered.filter((d) => d.proofs.length > 0).length, delivered.length),
    onTimePercent: pct(onTime, withWindow.length),
    deliveredCount: delivered.length,
  };
}

/** Form Q34 six-month definition of success (targets are proposals for owner approval). */
export async function successTargets(now = new Date()) {
  const fourWeeks = new Date(now.getTime() - 28 * DAY);
  const sixMonths = new Date(now.getTime() - 182 * DAY);
  const [quotes4w, recurringCompanies, delivered, deliveredWithPod, quotesTotal, quotesWithSource] = await Promise.all([
    prisma.quoteRequest.count({ where: { createdAt: { gte: fourWeeks }, route: { not: "SPECIAL_ROUTE" } } }),
    prisma.company.findMany({ where: { orders: { some: { createdAt: { gte: sixMonths } } } }, select: { _count: { select: { orders: true } } } }),
    prisma.order.count({ where: { status: "DELIVERED", completedAt: { gte: sixMonths } } }),
    prisma.order.count({ where: { status: "DELIVERED", completedAt: { gte: sixMonths }, proofs: { some: { kind: { in: ["DELIVERY", "RELEASE"] } } } } }),
    prisma.quoteRequest.count({ where: { createdAt: { gte: sixMonths } } }),
    prisma.quoteRequest.count({ where: { createdAt: { gte: sixMonths }, NOT: { leadSource: "other" } } }),
  ]);
  const perWeek = Math.round((quotes4w / 4) * 10) / 10;
  const recurring = recurringCompanies.filter((c) => c._count.orders >= 2).length;
  const podPct = pct(deliveredWithPod, delivered);
  return [
    { key: "quotes-per-week", label: "Qualified quote requests per week", value: perWeek, target: 5, unit: "per week" },
    { key: "recurring-accounts", label: "New recurring hotel, DMC, event or commercial accounts", value: recurring, target: 1, unit: "accounts" },
    { key: "pod", label: "Completed jobs with digital proof of delivery", value: podPct, target: 90, unit: "%" },
    { key: "lead-source", label: "Requests with a captured lead source", value: pct(quotesWithSource, quotesTotal), target: 100, unit: "%" },
    { key: "status-calls", label: "Reduction in manual status calls", value: null, target: 30, unit: "%", note: "Needs call tracking. Compare against tracking-page and notification usage once Phase 2 is live." },
  ];
}

/* ------------------------------- Reports page ------------------------------ */

type Row = { key: string; jobs: number; retailCents: number; costCents: number; marginPercent: number | null };

export async function revenueReport(from: Date, to: Date) {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
    select: { serviceType: true, market: true, retailCents: true, costCents: true, createdAt: true, pickup: true, delivery: true, customer: { select: { name: true, company: { select: { name: true } } } } },
  });
  const add = (m: Map<string, Row>, key: string, o: (typeof orders)[number]) => {
    const r = m.get(key) ?? { key, jobs: 0, retailCents: 0, costCents: 0, marginPercent: null };
    r.jobs++;
    r.retailCents += o.retailCents ?? 0;
    r.costCents += o.costCents ?? 0;
    m.set(key, r);
  };
  const by = { service: new Map<string, Row>(), market: new Map<string, Row>(), route: new Map<string, Row>(), customer: new Map<string, Row>(), month: new Map<string, Row>() };
  for (const o of orders) {
    const from = (o.pickup as { market?: string })?.market ?? o.market;
    const toM = (o.delivery as { market?: string })?.market ?? o.market;
    add(by.service, o.serviceType, o);
    add(by.market, o.market, o);
    add(by.route, `${from} → ${toM}`, o);
    add(by.customer, o.customer.company?.name ?? o.customer.name, o);
    add(by.month, o.createdAt.toISOString().slice(0, 7), o);
  }
  const finish = (m: Map<string, Row>, sortByKey = false) =>
    [...m.values()]
      .map((r) => ({ ...r, marginPercent: r.retailCents > 0 && r.costCents > 0 ? pct(r.retailCents - r.costCents, r.retailCents) : null }))
      .sort((a, b) => (sortByKey ? a.key.localeCompare(b.key) : b.retailCents - a.retailCents));

  const [leads, quotations, carriers] = await Promise.all([
    prisma.quoteRequest.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { leadSource: true, status: true, order: { select: { id: true } } } }),
    prisma.quotation.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { status: true, sentAt: true, totalCents: true, source: true } }),
    prisma.carrierShipment.groupBy({ by: ["carrier"], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { costCents: true, retailCents: true } }),
  ]);
  const leadMap = new Map<string, { key: string; requests: number; won: number }>();
  for (const l of leads) {
    const r = leadMap.get(l.leadSource) ?? { key: l.leadSource, requests: 0, won: 0 };
    r.requests++;
    if (l.status === "WON" || l.order) r.won++;
    leadMap.set(l.leadSource, r);
  }
  const sent = quotations.filter((q) => q.sentAt || q.source === "instant");
  const wonQ = sent.filter((q) => ["ACCEPTED", "CONVERTED"].includes(q.status));
  return {
    range: { from, to },
    byService: finish(by.service),
    byMarket: finish(by.market),
    byRoute: finish(by.route),
    byCustomer: finish(by.customer).slice(0, 50),
    byMonth: finish(by.month, true),
    leadSources: [...leadMap.values()].map((l) => ({ ...l, conversionPercent: pct(l.won, l.requests) })).sort((a, b) => b.requests - a.requests),
    quotations: { sent: sent.length, won: wonQ.length, declined: quotations.filter((q) => q.status === "DECLINED").length, expired: quotations.filter((q) => q.status === "EXPIRED").length, winPercent: pct(wonQ.length, sent.length), wonValueCents: wonQ.reduce((s, q) => s + q.totalCents, 0) },
    carriers: carriers.map((c) => ({ key: c.carrier, shipments: c._count._all, costCents: c._sum.costCents ?? 0, retailCents: c._sum.retailCents ?? 0 })),
  };
}
