/**
 * AI business reports: numbers are computed with SQL/Prisma here; the AI only narrates them in plain English.
 * Without a provider key, a deterministic text summary is produced instead.
 * "Operational recommendations" are labeled as needing 6–12 months of data (proposal, Phase 3 AI suite).
 */
import { SERVICE_LABELS, type ServiceType } from "@/lib/quote-schema";
import { prisma } from "../../db";
import { marketName } from "../../services/quotes";
import { ai } from "../../providers/registry";
import { getAssistantSettings } from "./settings";

export type ReportData = {
  periodStart: string;
  periodEnd: string;
  quotes: { total: number; byService: Record<string, number>; byMarket: Record<string, number>; custom: number };
  quotations: { sent: number; accepted: number; conversionPct: number | null };
  orders: { created: number; delivered: number; cancelled: number };
  revenue: { bookedCents: number; collectedCents: number };
  exceptions: { opened: number; openNow: number; byType: Record<string, number> };
  assistant: { conversations: number; handoffs: number; quoteLinks: number };
  previousWeek: { quotes: number; orders: number; collectedCents: number };
};

const count = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T) =>
  Object.fromEntries(rows.map((r) => [String(r[key]), r._count._all]));

export async function computeReportData(periodEnd = new Date(), days = 7): Promise<ReportData> {
  const start = new Date(periodEnd.getTime() - days * 86400000);
  const prevStart = new Date(start.getTime() - days * 86400000);
  const range = { gte: start, lt: periodEnd };
  const prevRange = { gte: prevStart, lt: start };
  const [quotesByService, quotesByMarket, custom, sent, accepted, created, delivered, cancelled, booked, collected, excOpened, excOpen, excByType, convs, handoffs, drafts, prevQuotes, prevOrders, prevCollected] = await Promise.all([
    prisma.quoteRequest.groupBy({ by: ["serviceType"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.quoteRequest.groupBy({ by: ["pickupMarket"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.quoteRequest.count({ where: { createdAt: range, route: "CUSTOM_QUOTE" } }),
    prisma.quotation.count({ where: { sentAt: range } }),
    prisma.quotation.count({ where: { acceptedAt: range } }),
    prisma.order.count({ where: { createdAt: range } }),
    prisma.order.count({ where: { completedAt: range } }),
    prisma.order.count({ where: { cancelledAt: range } }),
    prisma.order.aggregate({ where: { createdAt: range, status: { not: "CANCELLED" } }, _sum: { retailCents: true } }),
    prisma.payment.aggregate({ where: { createdAt: range, status: "SUCCEEDED", kind: { not: "REFUND" } }, _sum: { amountCents: true } }),
    prisma.orderException.count({ where: { createdAt: range } }),
    prisma.orderException.count({ where: { status: { not: "RESOLVED" } } }),
    prisma.orderException.groupBy({ by: ["type"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.aiConversation.count({ where: { createdAt: range } }),
    prisma.aiConversation.count({ where: { createdAt: range, handoffRequested: true } }),
    prisma.aiQuoteDraft.count({ where: { createdAt: range } }),
    prisma.quoteRequest.count({ where: { createdAt: prevRange } }),
    prisma.order.count({ where: { createdAt: prevRange } }),
    prisma.payment.aggregate({ where: { createdAt: prevRange, status: "SUCCEEDED", kind: { not: "REFUND" } }, _sum: { amountCents: true } }),
  ]);
  const total = quotesByService.reduce((s, r) => s + r._count._all, 0);
  return {
    periodStart: start.toISOString(),
    periodEnd: periodEnd.toISOString(),
    quotes: { total, byService: count(quotesByService, "serviceType"), byMarket: count(quotesByMarket, "pickupMarket"), custom },
    quotations: { sent, accepted, conversionPct: sent ? Math.round((accepted / sent) * 1000) / 10 : null },
    orders: { created, delivered, cancelled },
    revenue: { bookedCents: booked._sum.retailCents ?? 0, collectedCents: collected._sum.amountCents ?? 0 },
    exceptions: { opened: excOpened, openNow: excOpen, byType: count(excByType, "type") },
    assistant: { conversations: convs, handoffs, quoteLinks: drafts },
    previousWeek: { quotes: prevQuotes, orders: prevOrders, collectedCents: prevCollected._sum.amountCents ?? 0 },
  };
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** Deterministic narrative (used without an AI key, and as the fact sheet the AI narrates from). */
export function factSheet(d: ReportData): string {
  const top = (o: Record<string, number>, name: (k: string) => string) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${name(k)} (${v})`).join(", ") || "none";
  const service = (k: string) => SERVICE_LABELS[k as ServiceType] ?? k;
  const exception = (k: string) => k.toLowerCase().replace(/_/g, " ");
  return [
    `Period: ${d.periodStart.slice(0, 10)} to ${d.periodEnd.slice(0, 10)}.`,
    `Quote requests: ${d.quotes.total} (previous week ${d.previousWeek.quotes}); ${d.quotes.custom} needed a custom quotation. Top services: ${top(d.quotes.byService, service)}. Top markets: ${top(d.quotes.byMarket, marketName)}.`,
    `Quotations: ${d.quotations.sent} sent, ${d.quotations.accepted} accepted${d.quotations.conversionPct != null ? ` (${d.quotations.conversionPct}% of those sent)` : ""}.`,
    `Orders: ${d.orders.created} created (previous week ${d.previousWeek.orders}), ${d.orders.delivered} delivered, ${d.orders.cancelled} cancelled.`,
    `Revenue: ${usd(d.revenue.bookedCents)} booked, ${usd(d.revenue.collectedCents)} collected (previous week ${usd(d.previousWeek.collectedCents)}).`,
    `Exceptions: ${d.exceptions.opened} opened this week, ${d.exceptions.openNow} still open. Types: ${top(d.exceptions.byType, exception)}.`,
    `Website assistant: ${d.assistant.conversations} conversations, ${d.assistant.quoteLinks} quote links created, ${d.assistant.handoffs} handoffs to the team.`,
  ].join("\n");
}

const NARRATOR = `You write a short weekly business summary for the owner of Express Bags (Florida luggage and logistics).
Use ONLY the numbers in the fact sheet; never invent figures, causes, customers or forecasts. Plain English, under 220 words, no markdown headings.
Structure: 1) Headline sentence. 2) Three to five short bullet points comparing with the previous week where the data allows. 3) "What to look at this week": one or two practical checks based on the data (e.g. open exceptions, quotations awaiting acceptance).
End with this exact line: "Operational recommendations based on trends will become meaningful after 6–12 months of platform data."`;

export async function generateWeeklyReport() {
  const data = await computeReportData();
  const facts = factSheet(data);
  const provider = ai();
  let content = `${facts}\n\nOperational recommendations based on trends will become meaningful after 6–12 months of platform data.`;
  let narrated = false;
  if (provider.name !== "scripted") {
    try {
      const settings = await getAssistantSettings();
      const res = await provider.chat(NARRATOR, [{ role: "user", content: facts }], { maxTokens: 1200, model: settings.model });
      if (res.text.trim()) {
        content = res.text.trim();
        narrated = true;
      }
    } catch (e) {
      console.error("[assistant] report narration failed:", (e as Error).message);
    }
  }
  return prisma.aiReport.create({
    data: { kind: "weekly-summary", periodStart: new Date(data.periodStart), periodEnd: new Date(data.periodEnd), content, data: { ...data, narrated, facts } as object },
  });
}
