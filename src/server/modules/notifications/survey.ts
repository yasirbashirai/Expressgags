/**
 * Post-delivery satisfaction survey + review routing.
 *  4–5 ★ → thank you + Google review link (when configured)
 *  ≤ threshold ★ → staff alert, never a review prompt
 *  consent checked + comment → unpublished Testimonial draft for the CMS queue (written permission recorded)
 */
import { z } from "zod";
import { prisma } from "../../db";
import { HttpError } from "../../lib/errors";
import { siteUrl } from "../../lib/templates/layout";
import { alertStaff } from "./engine";
import { getNotificationSettings } from "./settings";

export const surveySubmitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
  publishConsent: z.boolean().default(false),
  attribution: z.string().trim().max(120).optional().or(z.literal("")),
});

const TOKEN_RE = /^[23456789A-HJ-NP-Z]{32}$/;

async function findSurvey(token: string) {
  if (!TOKEN_RE.test(token)) throw new HttpError(404, "This survey link is not valid.");
  const s = await prisma.surveyResponse.findUnique({ where: { token }, include: { order: { select: { id: true, reference: true, customer: { select: { name: true, language: true } } } } } });
  if (!s) throw new HttpError(404, "This survey link is not valid.");
  return s;
}

export async function getSurvey(token: string) {
  const s = await findSurvey(token);
  const settings = await getNotificationSettings();
  const responded = !!s.respondedAt;
  return {
    reference: s.order.reference,
    firstName: s.order.customer.name.trim().split(/\s+/)[0] || null,
    language: s.order.customer.language === "es" ? "es" : "en",
    responded,
    rating: s.rating,
    // Review link only for happy customers who already answered
    reviewUrl: responded && (s.rating ?? 0) > settings.lowRatingThreshold && settings.googleReviewUrl ? settings.googleReviewUrl : null,
  };
}

export async function submitSurvey(token: string, input: z.infer<typeof surveySubmitSchema>) {
  const s = await findSurvey(token);
  if (s.respondedAt) throw new HttpError(409, "Thank you, this survey was already answered.");
  const settings = await getNotificationSettings();
  const comment = input.comment?.trim() || null;
  const consent = input.publishConsent && !!comment;
  await prisma.surveyResponse.update({
    where: { id: s.id },
    data: { rating: input.rating, comment, publishConsent: consent, attribution: consent ? input.attribution?.trim() || null : null, respondedAt: new Date() },
  });
  if (consent) {
    await prisma.testimonial.create({
      data: {
        quote: comment!,
        attribution: input.attribution?.trim() || "Express Bags customer",
        permissionGranted: true,
        permissionNote: `Publication consent given in the post-delivery survey for ${s.order.reference} on ${new Date().toISOString().slice(0, 10)}`,
        rating: input.rating,
        published: false,
        sourceSurveyId: s.id,
      },
    });
  }
  const low = input.rating <= settings.lowRatingThreshold;
  if (low) {
    await alertStaff("staff.low_rating", `survey:${s.id}`, { reference: s.order.reference, rating: input.rating, comment: comment ?? undefined, adminUrl: `${siteUrl()}/admin/orders/${s.order.id}` });
  }
  return { ok: true as const, reviewUrl: !low && settings.googleReviewUrl ? settings.googleReviewUrl : null };
}

export async function recordReviewClick(token: string) {
  const s = await findSurvey(token);
  if (!s.reviewLinkClickedAt) await prisma.surveyResponse.update({ where: { id: s.id }, data: { reviewLinkClickedAt: new Date() } });
  return { ok: true as const };
}
