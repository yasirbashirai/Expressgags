/**
 * Protection claims (Master Requirements §8.1): customer submission with categorized evidence,
 * staff adjudication with the order's chain of custody, payouts, and the reserve report.
 * The maximum benefit applies per ORDER: approved + paid amounts across all claims on the same
 * order can never exceed the tier's maximum.
 */
import { z } from "zod";
import { customerOrderScope, type AuthCustomer } from "../../auth-customer";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { emit } from "../../lib/events";
import { HttpError } from "../../lib/errors";
import { claimReference } from "../../lib/reference";
import { tierFor, type ProtectionPlans } from "./plans";

export const EVIDENCE_CATEGORIES = ["damage-photo", "proof-of-value", "pre-trip-photo", "other"] as const;
export const CLAIM_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "NEED_INFO", "APPROVED", "PARTIAL", "DENIED", "PAID"] as const;
const OPEN = ["SUBMITTED", "UNDER_REVIEW", "NEED_INFO"];
/** Statuses whose decision amount counts against the order maximum */
const COMMITTED = ["APPROVED", "PARTIAL", "PAID"];

type Actor = { id?: string; name: string };

/** Benefit still available on an order (max per ORDER minus approved/paid on other claims). */
export async function remainingBenefit(orderId: string, maxBenefitCents: number, excludeClaimId?: string) {
  const claims = await prisma.claim.findMany({ where: { orderId, status: { in: COMMITTED }, ...(excludeClaimId ? { id: { not: excludeClaimId } } : {}) }, select: { decisionCents: true } });
  const used = claims.reduce((s, c) => s + (c.decisionCents ?? 0), 0);
  return Math.max(0, maxBenefitCents - used);
}

/* ------------------------------ Customer side ---------------------------- */

/** Orders in the customer's scope that carry a protection tier (eligible for a claim). */
export async function eligibleOrders(c: AuthCustomer, plans: ProtectionPlans) {
  const orders = await prisma.order.findMany({
    where: { ...customerOrderScope(c), protectionTier: { not: null }, status: { not: "CANCELLED" } },
    orderBy: { serviceDate: "desc" },
    take: 50,
    select: { id: true, reference: true, serviceDate: true, status: true, completedAt: true, protectionTier: true },
  });
  const windowMs = plans.claimWindowDays * 86_400_000;
  const out = [];
  for (const o of orders) {
    const tier = tierFor(plans, o.protectionTier);
    if (!tier) continue;
    const withinWindow = !o.completedAt || Date.now() - o.completedAt.getTime() <= windowMs;
    out.push({ ...o, tierName: tier.name, maxBenefitCents: tier.maxBenefitCents, remainingCents: await remainingBenefit(o.id, tier.maxBenefitCents), withinWindow });
  }
  return out;
}

export const submitSchema = z.object({
  orderId: z.string().min(1),
  description: z.string().trim().min(20, "Describe what happened (at least 20 characters)").max(5000),
  claimedCents: z.coerce.number().int().min(100, "Enter the amount you are claiming").max(100_000_000),
  evidence: z
    .array(z.object({ uploadId: z.string().min(1), category: z.enum(EVIDENCE_CATEGORIES) }))
    .min(1, "Add at least one photo or document")
    .max(30),
});

export async function submitClaim(c: AuthCustomer, input: z.infer<typeof submitSchema>, plans: ProtectionPlans) {
  // Scope first: an order outside the customer's scope is simply "not found"
  const order = await prisma.order.findFirst({ where: { id: input.orderId, ...customerOrderScope(c) }, select: { id: true, reference: true, protectionTier: true, completedAt: true, status: true } });
  if (!order) throw new HttpError(404, "Order not found.");
  const tier = tierFor(plans, order.protectionTier);
  if (!tier) throw new HttpError(409, "This order does not include Express Bags protection.");
  if (order.completedAt && Date.now() - order.completedAt.getTime() > plans.claimWindowDays * 86_400_000) {
    throw new HttpError(409, `Claims must be filed within ${plans.claimWindowDays} days of delivery. Please contact our office.`);
  }
  const remaining = await remainingBenefit(order.id, tier.maxBenefitCents);
  if (input.claimedCents > remaining) {
    throw new HttpError(400, `The ${tier.name} plan covers up to $${(tier.maxBenefitCents / 100).toFixed(0)} per order. $${(remaining / 100).toFixed(2)} is still available on this order.`, [{ path: "claimedCents", message: "Above the remaining benefit" }]);
  }
  const ids = [...new Set(input.evidence.map((e) => e.uploadId))];
  const owned = await prisma.upload.count({ where: { id: { in: ids }, ownerType: "customer", ownerId: c.id, kind: "claim-evidence" } });
  if (owned !== ids.length) throw new HttpError(400, "One or more files were not uploaded from your account.");

  const claim = await prisma.$transaction(async (tx) => {
    const created = await tx.claim.create({
      data: { reference: claimReference(), orderId: order.id, customerId: c.id, tier: tier.code, maxBenefitCents: tier.maxBenefitCents, claimedCents: input.claimedCents, description: input.description, evidenceUploadIds: ids },
    });
    await tx.claimEvidence.createMany({ data: input.evidence.map((e) => ({ claimId: created.id, uploadId: e.uploadId, category: e.category })) });
    await tx.claimEvent.create({ data: { claimId: created.id, type: "SUBMITTED", note: `Claim submitted for $${(input.claimedCents / 100).toFixed(2)}`, actorType: "customer", actorId: c.id, actorName: c.name } });
    return created;
  });
  await emit("claim.submitted", { claimId: claim.id });
  return claim;
}

/** Customer-safe claim view: no staff-only notes, no internal reserve data. */
export async function customerClaim(c: AuthCustomer, id: string) {
  const claim = await prisma.claim.findFirst({ where: { id, customerId: c.id }, include: { order: { select: { reference: true, serviceDate: true } } } });
  if (!claim) throw new HttpError(404, "Claim not found.");
  const [evidence, events] = await Promise.all([
    prisma.claimEvidence.findMany({ where: { claimId: id }, orderBy: { createdAt: "asc" } }),
    prisma.claimEvent.findMany({ where: { claimId: id, customerVisible: true }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, note: true, actorType: true, createdAt: true } }),
  ]);
  const uploads = await prisma.upload.findMany({ where: { id: { in: evidence.map((e) => e.uploadId) } }, select: { id: true, originalName: true, mimeType: true } });
  return {
    claim: { id: claim.id, reference: claim.reference, status: claim.status, tier: claim.tier, maxBenefitCents: claim.maxBenefitCents, claimedCents: claim.claimedCents, decisionCents: claim.decisionCents, decisionNote: claim.decisionNote, description: claim.description, createdAt: claim.createdAt, order: claim.order },
    evidence: evidence.map((e) => ({ ...e, file: uploads.find((u) => u.id === e.uploadId) ?? null })),
    events,
  };
}

export async function customerReply(c: AuthCustomer, id: string, input: { note: string; evidence: { uploadId: string; category: (typeof EVIDENCE_CATEGORIES)[number] }[] }) {
  const claim = await prisma.claim.findFirst({ where: { id, customerId: c.id } });
  if (!claim) throw new HttpError(404, "Claim not found.");
  if (!OPEN.includes(claim.status)) throw new HttpError(409, "This claim has already been decided.");
  const ids = [...new Set(input.evidence.map((e) => e.uploadId))];
  if (ids.length) {
    const owned = await prisma.upload.count({ where: { id: { in: ids }, ownerType: "customer", ownerId: c.id, kind: "claim-evidence" } });
    if (owned !== ids.length) throw new HttpError(400, "One or more files were not uploaded from your account.");
  }
  await prisma.$transaction(async (tx) => {
    if (input.evidence.length) await tx.claimEvidence.createMany({ data: input.evidence.map((e) => ({ claimId: id, uploadId: e.uploadId, category: e.category })) });
    await tx.claim.update({ where: { id }, data: { evidenceUploadIds: [...new Set([...claim.evidenceUploadIds, ...ids])], ...(claim.status === "NEED_INFO" ? { status: "UNDER_REVIEW" } : {}) } });
    await tx.claimEvent.create({ data: { claimId: id, type: "CUSTOMER_REPLY", note: input.note, actorType: "customer", actorId: c.id, actorName: c.name } });
  });
}

/* -------------------------------- Staff side ----------------------------- */

export const adminListSchema = z.object({ status: z.enum(CLAIM_STATUSES).or(z.literal("open")).optional(), q: z.string().max(100).optional() });

export async function adminList(q: z.infer<typeof adminListSchema>) {
  const where: Prisma.ClaimWhereInput = {
    ...(q.status === "open" ? { status: { in: OPEN } } : q.status ? { status: q.status } : {}),
    ...(q.q ? { OR: [{ reference: { contains: q.q, mode: "insensitive" } }, { order: { reference: { contains: q.q, mode: "insensitive" } } }, { customer: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
  };
  const [claims, counts] = await Promise.all([
    prisma.claim.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { reference: true } }, customer: { select: { name: true, email: true } } } }),
    prisma.claim.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { claims, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
}

/** Full staff view, incl. Express Bags intake/pickup condition photos and the chain of custody. */
export async function adminDetail(id: string) {
  const claim = await prisma.claim.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, email: true, phone: true } }, order: { include: { pieces: { select: { pieceId: true, category: true, description: true, conditionNotes: true } } } } } });
  if (!claim) throw new HttpError(404, "Claim not found.");
  const [evidence, events, proofs, custody] = await Promise.all([
    prisma.claimEvidence.findMany({ where: { claimId: id }, orderBy: { createdAt: "asc" } }),
    prisma.claimEvent.findMany({ where: { claimId: id }, orderBy: { createdAt: "asc" } }),
    prisma.proofOfDelivery.findMany({ where: { orderId: claim.orderId }, orderBy: { capturedAt: "asc" } }),
    prisma.orderEvent.findMany({ where: { orderId: claim.orderId }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, status: true, detail: true, actorName: true, uploadIds: true, createdAt: true } }),
  ]);
  const ebPhotoIds = [...new Set([...proofs.flatMap((p) => [...p.photoUploadIds, ...(p.signatureUploadId ? [p.signatureUploadId] : [])]), ...custody.flatMap((e) => e.uploadIds)])];
  const uploads = await prisma.upload.findMany({ where: { id: { in: [...evidence.map((e) => e.uploadId), ...ebPhotoIds] } }, select: { id: true, originalName: true, mimeType: true } });
  const remaining = await remainingBenefit(claim.orderId, claim.maxBenefitCents, claim.id);
  const { order, ...rest } = claim;
  return {
    claim: rest,
    order: { id: order.id, reference: order.reference, status: order.status, serviceDate: order.serviceDate, completedAt: order.completedAt, protectionTier: order.protectionTier, protectionCents: order.protectionCents, pieces: order.pieces },
    remainingCents: remaining,
    evidence: evidence.map((e) => ({ ...e, file: uploads.find((u) => u.id === e.uploadId) ?? null })),
    events,
    proofs: proofs.map((p) => ({ ...p, photos: p.photoUploadIds.map((u) => uploads.find((x) => x.id === u)).filter(Boolean) })),
    custody,
    allowedUploadIds: uploads.map((u) => u.id),
  };
}

export const decisionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNDER_REVIEW"), note: z.string().trim().max(2000).optional() }),
  z.object({ status: z.literal("NEED_INFO"), note: z.string().trim().min(5, "Tell the customer what is needed").max(2000) }),
  z.object({ status: z.literal("APPROVED"), decisionCents: z.coerce.number().int().min(1), note: z.string().trim().min(5).max(2000) }),
  z.object({ status: z.literal("PARTIAL"), decisionCents: z.coerce.number().int().min(1), note: z.string().trim().min(5).max(2000) }),
  z.object({ status: z.literal("DENIED"), note: z.string().trim().min(5, "Explain the decision").max(2000) }),
]);

export async function decide(id: string, input: z.infer<typeof decisionSchema>, actor: Actor) {
  const claim = await prisma.claim.findUnique({ where: { id } });
  if (!claim) throw new HttpError(404, "Claim not found.");
  if (claim.status === "PAID") throw new HttpError(409, "This claim has already been paid.");
  let decisionCents: number | null = null;
  if (input.status === "APPROVED" || input.status === "PARTIAL") {
    const remaining = await remainingBenefit(claim.orderId, claim.maxBenefitCents, claim.id);
    if (input.decisionCents > remaining) throw new HttpError(400, `Above the order maximum: $${(remaining / 100).toFixed(2)} remains for this order.`, [{ path: "decisionCents", message: "Above the remaining benefit" }]);
    if (input.decisionCents > claim.claimedCents) throw new HttpError(400, "The approved amount cannot exceed the amount claimed.");
    if (input.status === "APPROVED" && input.decisionCents !== claim.claimedCents) throw new HttpError(400, "Use “Partial” when approving less than the amount claimed.");
    decisionCents = input.decisionCents;
  }
  const decided = ["APPROVED", "PARTIAL", "DENIED"].includes(input.status);
  await prisma.$transaction(async (tx) => {
    await tx.claim.update({
      where: { id },
      data: {
        status: input.status,
        ...(decided ? { decisionCents: input.status === "DENIED" ? 0 : decisionCents, decisionNote: input.note ?? null, decidedBy: actor.name, decidedAt: new Date() } : {}),
      },
    });
    await tx.claimEvent.create({
      data: {
        claimId: id,
        type: decided ? "DECISION" : input.status === "NEED_INFO" ? "INFO_REQUESTED" : "STATUS",
        note: decided ? `${input.status === "DENIED" ? "Denied" : `${input.status === "PARTIAL" ? "Partially approved" : "Approved"}: $${((decisionCents ?? 0) / 100).toFixed(2)}`}. ${input.note ?? ""}`.trim() : input.note ?? `Status: ${input.status}`,
        actorType: "staff",
        actorId: actor.id,
        actorName: actor.name,
        customerVisible: input.status !== "UNDER_REVIEW" || !!input.note,
      },
    });
  });
}

export async function addStaffNote(id: string, note: string, actor: Actor) {
  if (!(await prisma.claim.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "Claim not found.");
  await prisma.claimEvent.create({ data: { claimId: id, type: "NOTE", note, actorType: "staff", actorId: actor.id, actorName: actor.name, customerVisible: false } });
}

export const payoutSchema = z.object({ method: z.enum(["stripe", "ach", "check", "cash", "account"]), reference: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional() });

/** Records the claim payout as a REFUND payment on the order. */
export async function markPaid(id: string, input: z.infer<typeof payoutSchema>, actor: Actor) {
  const claim = await prisma.claim.findUnique({ where: { id } });
  if (!claim) throw new HttpError(404, "Claim not found.");
  if (!["APPROVED", "PARTIAL"].includes(claim.status) || !claim.decisionCents) throw new HttpError(409, "Only approved claims can be paid.");
  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: { method: input.method, kind: "REFUND", status: "SUCCEEDED", amountCents: claim.decisionCents!, orderId: claim.orderId, recordedBy: actor.name, note: `Protection claim payout ${claim.reference}${input.reference ? ` · ref ${input.reference}` : ""}${input.note ? ` · ${input.note}` : ""}` },
    });
    await tx.claim.update({ where: { id }, data: { status: "PAID" } });
    await tx.claimEvent.create({ data: { claimId: id, type: "PAID", note: `Payout of $${(claim.decisionCents! / 100).toFixed(2)} sent`, actorType: "staff", actorId: actor.id, actorName: actor.name } });
    return p;
  });
  return payment;
}

/** Fees collected vs payouts, and the reserve the owner's percentage implies. */
export async function reserveReport(plans: ProtectionPlans) {
  const [orders, paid, committed, open] = await Promise.all([
    prisma.order.findMany({ where: { protectionTier: { not: null }, status: { not: "CANCELLED" }, paymentStatus: { in: ["DEPOSIT_PAID", "PAID", "ACCOUNT", "INVOICED"] } }, select: { protectionCents: true, protectionTier: true } }),
    prisma.claim.aggregate({ where: { status: "PAID" }, _sum: { decisionCents: true }, _count: { _all: true } }),
    prisma.claim.aggregate({ where: { status: { in: ["APPROVED", "PARTIAL"] } }, _sum: { decisionCents: true }, _count: { _all: true } }),
    prisma.claim.aggregate({ where: { status: { in: OPEN } }, _sum: { claimedCents: true }, _count: { _all: true } }),
  ]);
  const fees = orders.reduce((s, o) => s + (o.protectionCents ?? 0), 0);
  const byTier = Object.fromEntries(plans.tiers.map((t) => [t.code, orders.filter((o) => o.protectionTier === t.code).length]));
  const reserveTarget = Math.round((fees * plans.reservePercent) / 100);
  const paidOut = paid._sum.decisionCents ?? 0;
  return {
    feesCollectedCents: fees,
    protectedOrders: orders.length,
    ordersByTier: byTier,
    paidOutCents: paidOut,
    paidClaims: paid._count._all,
    approvedUnpaidCents: committed._sum.decisionCents ?? 0,
    approvedUnpaidClaims: committed._count._all,
    openClaimedCents: open._sum.claimedCents ?? 0,
    openClaims: open._count._all,
    reservePercent: plans.reservePercent,
    reserveTargetCents: reserveTarget,
    reserveBalanceCents: reserveTarget - paidOut,
    lossRatioPercent: fees ? Math.round((paidOut / fees) * 1000) / 10 : 0,
  };
}
