/**
 * Module "cms" — website content managed by the office (Owner / Staff):
 * blog posts, testimonials (written permission required), gallery, resources/downloads,
 * company history entries and naming permissions (History & Roadmap brief §10, form B13).
 *
 * Admin  : /v1/admin/cms/*      (OWNER, STAFF) — every write is audited.
 * Public : /v1/content/*        published content only; names only with recorded permission;
 *          /v1/content/media/:id serves ONLY uploads flagged isPublic.
 * After every change the affected website pages are revalidated (ISR).
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { referencedMediaIds, markdownToText } from "@/components/cms/markdown";
import { audit, requireRole } from "../../auth";
import { prisma } from "../../db";
import type { Prisma } from "../../generated/prisma/client";
import { asyncHandler, HttpError } from "../../lib/errors";
import type { PlatformModule } from "../types";
import { EVIDENCE_LEVELS, VISIBILITY, grantedProjectIds, importHistoryFromBrief, publicHistory } from "./history";
import { receiveCmsFile, sendCmsMedia, setMediaPublic, syncMediaVisibility } from "./media";
import { PATHS, categorySlug, revalidatePaths } from "./revalidate";

export const adminRouter = Router();
export const publicRouter = Router();

const EDIT = requireRole("STAFF"); // OWNER + STAFF

/** Author is always the company — never a personal name (privacy rule). */
export const AUTHOR_LABEL = "Express Bags Team";

/* ------------------------------------------------------------------------- */
/* Validation                                                                 */
/* ------------------------------------------------------------------------- */

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const toSlug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const postInput = z.object({
  title: z.string().trim().min(3, "Add a title").max(160),
  slug: z.string().trim().max(90).optional().transform((v) => (v ? toSlug(v) : undefined)),
  excerpt: optText(320),
  body: z.string().max(100_000).default(""),
  coverUploadId: optText(40),
  category: optText(60),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  seoTitle: optText(70),
  seoDescription: optText(170),
  language: z.enum(["en", "es"]).default("en"),
});

const testimonialInput = z.object({
  quote: z.string().trim().min(10, "The quote is too short").max(1200),
  attribution: z
    .string()
    .trim()
    .min(3, "Add a generic attribution")
    .max(140)
    .refine((v) => !/@|https?:|\d{3}[\s.-]?\d{4}/.test(v), "Attribution must be generic (no emails, links or phone numbers)"),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  permissionGranted: z.boolean().default(false),
  permissionNote: optText(500),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

const galleryPatch = z.object({
  caption: z.string().trim().min(3).max(200).optional(),
  alt: z.string().trim().min(5, "Describe the image for screen readers").max(200).optional(),
  category: z.enum(["fleet", "team-in-action", "port", "airport", "hotel", "event", "storage", "other"]).optional().nullable(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const resourcePatch = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: optText(400),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const historyInput = z.object({
  year: z.string().trim().min(4).max(30),
  title: z.string().trim().min(3).max(200),
  genericTitle: z.string().trim().min(3, "Add the generic (no-names) title").max(200),
  contractingCustomer: optText(200),
  endClient: optText(200),
  projectType: optText(120),
  locations: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  operationalNotes: optText(4000),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  genericSummary: z.string().trim().min(10, "Add a public-safe summary").max(1200),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

const visibilityInput = z.object({
  visibility: z.enum(VISIBILITY),
  permissionNote: optText(600),
});

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

async function uniqueSlug(base: string, excludeId?: string) {
  const root = base || "post";
  let slug = root;
  for (let n = 2; n < 200; n++) {
    const clash = await prisma.post.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
    slug = `${root}-${n}`;
  }
  throw new HttpError(409, "Could not create a unique link for this post.");
}

/** Post fields that must exist before publishing. */
export function publishProblems(p: { title: string; body: string; slug: string; seoDescription: string | null; excerpt: string | null }) {
  const problems: string[] = [];
  if (p.title.trim().length < 3) problems.push("Add a title.");
  if (!slugRe.test(p.slug)) problems.push("The link (slug) may only use lowercase letters, numbers and dashes.");
  if (markdownToText(p.body, 10_000).length < 120) problems.push("Write at least a short article (120+ characters) before publishing.");
  if (!p.excerpt && !p.seoDescription) problems.push("Add an excerpt or SEO description for search results.");
  return problems;
}

/** Testimonials can only be published with recorded written permission (form B13). */
export function testimonialPublishProblems(t: { permissionGranted: boolean; permissionNote: string | null; attribution: string }) {
  const problems: string[] = [];
  if (!t.permissionGranted) problems.push("Record the client's written permission before publishing.");
  if (!t.permissionNote || t.permissionNote.trim().length < 10) problems.push("Add a permission note (who approved the wording, when, and how).");
  if (!t.attribution.trim()) problems.push("Add a generic attribution.");
  return problems;
}

const readMinutes = (body: string) => Math.max(1, Math.round(markdownToText(body, 1_000_000).split(" ").length / 220));

type PostRow = Awaited<ReturnType<typeof prisma.post.findFirstOrThrow>>;
const publicPostCard = (p: PostRow) => ({
  slug: p.slug,
  title: p.title,
  excerpt: p.excerpt ?? p.seoDescription ?? markdownToText(p.body, 180),
  category: p.category,
  categorySlug: p.category ? categorySlug(p.category) : null,
  tags: p.tags,
  coverMediaId: p.coverUploadId,
  language: p.language,
  author: AUTHOR_LABEL,
  publishedAt: p.publishedAt?.toISOString() ?? null,
  updatedAt: p.updatedAt.toISOString(),
  readMinutes: readMinutes(p.body),
});

const livePostWhere = (): Prisma.PostWhereInput => ({ status: "PUBLISHED", publishedAt: { lte: new Date() } });

/* ------------------------------------------------------------------------- */
/* Public API                                                                 */
/* ------------------------------------------------------------------------- */

const publicLimiter = rateLimit({ windowMs: 60_000, limit: Number(process.env.CONTENT_RATE_LIMIT || 600), standardHeaders: "draft-8", legacyHeaders: false });
publicRouter.use(publicLimiter);

/** Short shared cache on public JSON (pages also use ISR). */
publicRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  next();
});

publicRouter.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const q = z.object({ category: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const all = await prisma.post.findMany({ where: livePostWhere(), orderBy: { publishedAt: "desc" } });
    const counts = new Map<string, { name: string; slug: string; count: number }>();
    for (const p of all) {
      if (!p.category) continue;
      const s = categorySlug(p.category);
      counts.set(s, { name: p.category, slug: s, count: (counts.get(s)?.count ?? 0) + 1 });
    }
    const filtered = q.category ? all.filter((p) => p.category && categorySlug(p.category) === q.category) : all;
    res.json({ ok: true, posts: filtered.slice(0, q.limit).map(publicPostCard), categories: [...counts.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  }),
);

publicRouter.get(
  "/posts/:slug",
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug);
    if (!slugRe.test(slug)) throw new HttpError(404, "Not found.");
    const post = await prisma.post.findFirst({ where: { slug, ...livePostWhere() } });
    if (!post) throw new HttpError(404, "Not found.");
    const related = await prisma.post.findMany({
      where: { ...livePostWhere(), NOT: { id: post.id }, ...(post.category ? { category: post.category } : {}) },
      orderBy: { publishedAt: "desc" },
      take: 3,
    });
    const fill = related.length < 3 ? await prisma.post.findMany({ where: { ...livePostWhere(), NOT: { id: { in: [post.id, ...related.map((r) => r.id)] } } }, orderBy: { publishedAt: "desc" }, take: 3 - related.length }) : [];
    res.json({
      ok: true,
      post: { ...publicPostCard(post), body: post.body, seoTitle: post.seoTitle, seoDescription: post.seoDescription },
      related: [...related, ...fill].map(publicPostCard),
    });
  }),
);

publicRouter.get(
  "/testimonials",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.testimonial.findMany({ where: { published: true, permissionGranted: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    res.json({ ok: true, testimonials: rows.map((t) => ({ id: t.id, quote: t.quote, attribution: t.attribution, rating: t.rating })) });
  }),
);

publicRouter.get(
  "/gallery",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.galleryItem.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    // Double-check the file is public (never leak a private upload id)
    const ups = await prisma.upload.findMany({ where: { id: { in: rows.map((r) => r.uploadId) }, isPublic: true }, select: { id: true } });
    const ok = new Set(ups.map((u) => u.id));
    res.json({ ok: true, items: rows.filter((r) => ok.has(r.uploadId)).map((r) => ({ id: r.id, mediaId: r.uploadId, caption: r.caption, alt: r.alt, category: r.category })) });
  }),
);

publicRouter.get(
  "/resources",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.resource.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    const ups = await prisma.upload.findMany({ where: { id: { in: rows.map((r) => r.uploadId).filter((x): x is string => !!x) }, isPublic: true } });
    const byId = new Map(ups.map((u) => [u.id, u]));
    res.json({
      ok: true,
      resources: rows.map((r) => {
        const up = r.uploadId ? byId.get(r.uploadId) : undefined;
        return { id: r.id, title: r.title, description: r.description, mediaId: up?.id ?? null, fileName: up?.originalName ?? null, mimeType: up?.mimeType ?? null, sizeBytes: up?.sizeBytes ?? null };
      }),
    });
  }),
);

publicRouter.get(
  "/history",
  asyncHandler(async (_req, res) => {
    // initialized=false → the office hasn't imported/created history yet; the site then shows its static generic copy
    const [entries, total] = await Promise.all([publicHistory(), prisma.historyEntry.count()]);
    res.json({ ok: true, entries, initialized: total > 0 });
  }),
);

/** Public media: ONLY uploads flagged isPublic (published CMS content). */
publicRouter.get(
  "/media/:id",
  asyncHandler(async (req, res) => {
    await sendCmsMedia(req, res, String(req.params.id), true);
  }),
);

/* ------------------------------------------------------------------------- */
/* Admin API                                                                  */
/* ------------------------------------------------------------------------- */

adminRouter.use(EDIT);

/* ---- Media ---- */

adminRouter.post(
  "/media",
  asyncHandler(async (req, res) => {
    const kind = req.query.kind === "document" ? "cms-document" : "cms-image";
    const { fields: _fields, ...file } = await receiveCmsFile(req, { kind, imagesOnly: kind === "cms-image" });
    void _fields;
    await audit(req, "upload", "cms-media", file.id, { kind, name: file.name });
    res.status(201).json({ ok: true, ...file });
  }),
);

/** Staff preview of any CMS upload (published or not). */
adminRouter.get(
  "/media/:id",
  asyncHandler(async (req, res) => {
    await sendCmsMedia(req, res, String(req.params.id), false);
  }),
);

/* ---- Overview ---- */

adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [posts, drafts, testimonials, pendingTestimonials, gallery, resources, history] = await Promise.all([
      prisma.post.count({ where: livePostWhere() }),
      prisma.post.count({ where: { status: "DRAFT" } }),
      prisma.testimonial.count({ where: { published: true } }),
      prisma.testimonial.count({ where: { published: false } }),
      prisma.galleryItem.count({ where: { published: true } }),
      prisma.resource.count({ where: { published: true } }),
      prisma.historyEntry.count(),
    ]);
    res.json({ ok: true, counts: { posts, drafts, testimonials, pendingTestimonials, gallery, resources, history }, revalidation: process.env.REVALIDATE_SECRET ? "on-demand" : "every 5 minutes" });
  }),
);

/* ---- Posts ---- */

adminRouter.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "SCHEDULED"]).optional(), search: z.string().max(100).optional() }).parse(req.query);
    const where: Prisma.PostWhereInput = {};
    if (q.status === "SCHEDULED") Object.assign(where, { status: "PUBLISHED", publishedAt: { gt: new Date() } });
    else if (q.status) where.status = q.status;
    if (q.search) where.OR = [{ title: { contains: q.search, mode: "insensitive" } }, { slug: { contains: q.search, mode: "insensitive" } }];
    const posts = await prisma.post.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200 });
    res.json({ ok: true, posts });
  }),
);

adminRouter.get(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const post = await prisma.post.findUnique({ where: { id: String(req.params.id) } });
    if (!post) throw new HttpError(404, "Post not found.");
    res.json({ ok: true, post });
  }),
);

adminRouter.post(
  "/posts",
  asyncHandler(async (req, res) => {
    const input = postInput.parse(req.body);
    const slug = await uniqueSlug(input.slug ?? toSlug(input.title));
    const post = await prisma.post.create({ data: { ...input, slug, authorLabel: AUTHOR_LABEL, status: "DRAFT" } });
    await audit(req, "create", "post", post.id, { slug });
    res.status(201).json({ ok: true, post });
  }),
);

adminRouter.patch(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Post not found.");
    const input = postInput.partial().parse(req.body);
    const slug = input.slug !== undefined ? await uniqueSlug(input.slug || toSlug(input.title ?? existing.title), id) : undefined;
    const post = await prisma.post.update({ where: { id }, data: { ...input, ...(slug ? { slug } : {}), authorLabel: AUTHOR_LABEL } });
    if (post.status === "PUBLISHED") {
      await syncMediaVisibility([existing.coverUploadId, post.coverUploadId, ...referencedMediaIds(existing.body), ...referencedMediaIds(post.body)]);
      await revalidatePaths([...PATHS.post(existing.slug, existing.category), ...PATHS.post(post.slug, post.category)]);
    }
    await audit(req, "update", "post", id, { fields: Object.keys(input) });
    res.json({ ok: true, post });
  }),
);

/** Publish now or schedule (publishedAt in the future). */
adminRouter.post(
  "/posts/:id/publish",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { publishedAt } = z.object({ publishedAt: z.string().datetime({ offset: true }).optional() }).parse(req.body ?? {});
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new HttpError(404, "Post not found.");
    const problems = publishProblems(post);
    if (problems.length) throw new HttpError(422, problems[0], problems.map((m) => ({ path: "post", message: m })));
    const when = publishedAt ? new Date(publishedAt) : post.publishedAt && post.status === "PUBLISHED" ? post.publishedAt : new Date();
    const updated = await prisma.post.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: when } });
    await syncMediaVisibility([updated.coverUploadId, ...referencedMediaIds(updated.body)]);
    const reval = await revalidatePaths(PATHS.post(updated.slug, updated.category));
    await audit(req, when > new Date() ? "schedule" : "publish", "post", id, { slug: updated.slug, publishedAt: when.toISOString() });
    res.json({ ok: true, post: updated, scheduled: when > new Date(), revalidation: reval });
  }),
);

adminRouter.post(
  "/posts/:id/unpublish",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { archive } = z.object({ archive: z.boolean().default(false) }).parse(req.body ?? {});
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new HttpError(404, "Post not found.");
    const updated = await prisma.post.update({ where: { id }, data: { status: archive ? "ARCHIVED" : "DRAFT" } });
    await syncMediaVisibility([post.coverUploadId, ...referencedMediaIds(post.body)]);
    const reval = await revalidatePaths(PATHS.post(post.slug, post.category));
    await audit(req, archive ? "archive" : "unpublish", "post", id);
    res.json({ ok: true, post: updated, revalidation: reval });
  }),
);

adminRouter.delete(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw new HttpError(404, "Post not found.");
    await prisma.post.delete({ where: { id } });
    await syncMediaVisibility([post.coverUploadId, ...referencedMediaIds(post.body)]);
    await revalidatePaths(PATHS.post(post.slug, post.category));
    await audit(req, "delete", "post", id, { slug: post.slug });
    res.json({ ok: true });
  }),
);

/* ---- Testimonials ---- */

adminRouter.get(
  "/testimonials",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.testimonial.findMany({ orderBy: [{ published: "asc" }, { createdAt: "desc" }] });
    res.json({ ok: true, testimonials: rows });
  }),
);

adminRouter.post(
  "/testimonials",
  asyncHandler(async (req, res) => {
    const input = testimonialInput.parse(req.body);
    const t = await prisma.testimonial.create({ data: { ...input, published: false } });
    await audit(req, "create", "testimonial", t.id);
    res.status(201).json({ ok: true, testimonial: t });
  }),
);

adminRouter.patch(
  "/testimonials/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.testimonial.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Testimonial not found.");
    const input = testimonialInput.partial().extend({ published: z.boolean().optional() }).parse(req.body);
    const merged = { ...existing, ...input };
    // Revoking permission always unpublishes; publishing requires recorded permission
    const published = merged.permissionGranted ? merged.published : false;
    if (published) {
      const problems = testimonialPublishProblems(merged);
      if (problems.length) throw new HttpError(422, problems[0], problems.map((m) => ({ path: "permission", message: m })));
    }
    if (input.published && !published) throw new HttpError(422, "Record the client's written permission before publishing.");
    const t = await prisma.testimonial.update({ where: { id }, data: { ...input, published } });
    if (existing.published || t.published) await revalidatePaths(PATHS.testimonials());
    await audit(req, input.published === true ? "publish" : input.published === false ? "unpublish" : "update", "testimonial", id, {
      permissionGranted: t.permissionGranted,
    });
    res.json({ ok: true, testimonial: t });
  }),
);

adminRouter.delete(
  "/testimonials/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const t = await prisma.testimonial.findUnique({ where: { id } });
    if (!t) throw new HttpError(404, "Testimonial not found.");
    await prisma.testimonial.delete({ where: { id } });
    if (t.published) await revalidatePaths(PATHS.testimonials());
    await audit(req, "delete", "testimonial", id);
    res.json({ ok: true });
  }),
);

/* ---- Gallery ---- */

adminRouter.get(
  "/gallery",
  asyncHandler(async (_req, res) => {
    const items = await prisma.galleryItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    res.json({ ok: true, items });
  }),
);

/** Multipart: file + alt + caption [+ category]. Images only. Starts unpublished. */
adminRouter.post(
  "/gallery",
  asyncHandler(async (req, res) => {
    const file = await receiveCmsFile(req, { kind: "cms-image", imagesOnly: true });
    const meta = z
      .object({
        alt: z.string().trim().min(5, "Describe the image for screen readers").max(200),
        caption: z.string().trim().min(3, "Add a caption").max(200),
        category: z.string().max(40).optional(),
      })
      .safeParse(file.fields);
    const count = await prisma.galleryItem.count();
    const item = await prisma.galleryItem.create({
      data: {
        uploadId: file.id,
        alt: meta.success ? meta.data.alt : "",
        caption: meta.success ? meta.data.caption : file.name.replace(/\.[a-z0-9]+$/i, ""),
        category: meta.success ? meta.data.category ?? null : null,
        published: false,
        sortOrder: count,
      },
    });
    await audit(req, "create", "gallery-item", item.id);
    res.status(201).json({ ok: true, item, needsAlt: !meta.success });
  }),
);

adminRouter.patch(
  "/gallery/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.galleryItem.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Image not found.");
    const input = galleryPatch.parse(req.body);
    const merged = { ...existing, ...input };
    if (merged.published && merged.alt.trim().length < 5) throw new HttpError(422, "Add alt text (a short description for screen readers) before publishing.");
    const item = await prisma.galleryItem.update({ where: { id }, data: input });
    await syncMediaVisibility([item.uploadId]);
    if (existing.published || item.published) await revalidatePaths(PATHS.gallery());
    await audit(req, input.published === true ? "publish" : input.published === false ? "unpublish" : "update", "gallery-item", id);
    res.json({ ok: true, item });
  }),
);

adminRouter.post(
  "/gallery/reorder",
  asyncHandler(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string().max(40)).max(500) }).parse(req.body);
    await prisma.$transaction(ids.map((id, i) => prisma.galleryItem.update({ where: { id }, data: { sortOrder: i } })));
    await revalidatePaths(PATHS.gallery());
    await audit(req, "reorder", "gallery", undefined, { count: ids.length });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  "/gallery/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const item = await prisma.galleryItem.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, "Image not found.");
    await prisma.galleryItem.delete({ where: { id } });
    await syncMediaVisibility([item.uploadId]);
    if (item.published) await revalidatePaths(PATHS.gallery());
    await audit(req, "delete", "gallery-item", id);
    res.json({ ok: true });
  }),
);

/* ---- Resources / downloads ---- */

adminRouter.get(
  "/resources",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.resource.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    const ups = await prisma.upload.findMany({ where: { id: { in: rows.map((r) => r.uploadId).filter((x): x is string => !!x) } }, select: { id: true, originalName: true, sizeBytes: true, mimeType: true, isPublic: true } });
    const byId = new Map(ups.map((u) => [u.id, u]));
    res.json({ ok: true, resources: rows.map((r) => ({ ...r, file: r.uploadId ? byId.get(r.uploadId) ?? null : null })) });
  }),
);

/** Multipart: file (any allowed document type) + title [+ description]. Starts unpublished. */
adminRouter.post(
  "/resources",
  asyncHandler(async (req, res) => {
    const file = await receiveCmsFile(req, { kind: "cms-document" });
    const parsed = z.object({ title: z.string().trim().min(3, "Add a title").max(160), description: z.string().trim().max(400).optional() }).safeParse(file.fields);
    if (!parsed.success) {
      await prisma.upload.delete({ where: { id: file.id } }).catch(() => undefined);
      throw new HttpError(400, "Add a title for this download.", [{ path: "title", message: "Required" }]);
    }
    const meta = parsed.data;
    const count = await prisma.resource.count();
    const r = await prisma.resource.create({ data: { title: meta.title, description: meta.description || null, uploadId: file.id, published: false, sortOrder: count } });
    await audit(req, "create", "resource", r.id);
    res.status(201).json({ ok: true, resource: r });
  }),
);

adminRouter.patch(
  "/resources/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.resource.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Resource not found.");
    const input = resourcePatch.parse(req.body);
    if (input.published && !existing.uploadId) throw new HttpError(422, "Attach a file before publishing.");
    const r = await prisma.resource.update({ where: { id }, data: input });
    await syncMediaVisibility([r.uploadId]);
    if (existing.published || r.published) await revalidatePaths(PATHS.resources());
    await audit(req, input.published === true ? "publish" : input.published === false ? "unpublish" : "update", "resource", id);
    res.json({ ok: true, resource: r });
  }),
);

adminRouter.delete(
  "/resources/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const r = await prisma.resource.findUnique({ where: { id } });
    if (!r) throw new HttpError(404, "Resource not found.");
    await prisma.resource.delete({ where: { id } });
    await setMediaPublic([r.uploadId], false);
    if (r.published) await revalidatePaths(PATHS.resources());
    await audit(req, "delete", "resource", id);
    res.json({ ok: true });
  }),
);

/* ---- History entries & naming permission ---- */

adminRouter.get(
  "/history",
  asyncHandler(async (_req, res) => {
    const [rows, displays, perms] = await Promise.all([
      prisma.historyEntry.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      prisma.historyEntryDisplay.findMany(),
      prisma.notableProjectPermission.findMany(),
    ]);
    const g = new Map(displays.map((d) => [d.entryId, d.genericTitle]));
    const p = new Map(perms.map((x) => [x.projectId, x]));
    res.json({
      ok: true,
      entries: rows.map((r) => ({
        ...r,
        genericTitle: g.get(r.id) ?? "",
        permissionGranted: p.get(r.id)?.permissionGranted ?? false,
        permissionNote: p.get(r.id)?.evidenceNote ?? "",
        grantedAt: p.get(r.id)?.grantedAt ?? null,
      })),
    });
  }),
);

adminRouter.post(
  "/history/import",
  asyncHandler(async (req, res) => {
    const result = await importHistoryFromBrief();
    if (result.created) await revalidatePaths(PATHS.history());
    await audit(req, "import", "history", undefined, result);
    res.json({ ok: true, ...result });
  }),
);

adminRouter.post(
  "/history",
  asyncHandler(async (req, res) => {
    const { genericTitle, ...input } = historyInput.parse(req.body);
    const entry = await prisma.historyEntry.create({ data: { ...input, visibility: "HIDDEN" } });
    await prisma.historyEntryDisplay.create({ data: { entryId: entry.id, genericTitle } });
    await audit(req, "create", "history-entry", entry.id);
    res.status(201).json({ ok: true, entry });
  }),
);

adminRouter.patch(
  "/history/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.historyEntry.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Entry not found.");
    const { genericTitle, ...input } = historyInput.partial().parse(req.body);
    const entry = await prisma.historyEntry.update({ where: { id }, data: input });
    if (genericTitle) await prisma.historyEntryDisplay.upsert({ where: { entryId: id }, update: { genericTitle }, create: { entryId: id, genericTitle } });
    if (entry.visibility !== "HIDDEN") await revalidatePaths(PATHS.history());
    await audit(req, "update", "history-entry", id, { fields: Object.keys(input).concat(genericTitle ? ["genericTitle"] : []) });
    res.json({ ok: true, entry });
  }),
);

/**
 * Visibility change. NAMED requires a written-permission note (who approved, when, how) and records it in
 * NotableProjectPermission (source of truth for the public-naming guardrail). Leaving NAMED revokes permission.
 */
adminRouter.put(
  "/history/:id/visibility",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { visibility, permissionNote } = visibilityInput.parse(req.body);
    const entry = await prisma.historyEntry.findUnique({ where: { id } });
    if (!entry) throw new HttpError(404, "Entry not found.");
    if (visibility === "NAMED" && (!permissionNote || permissionNote.trim().length < 10)) {
      throw new HttpError(422, "Naming requires a permission note: who approved, when and how (written permission).", [{ path: "permissionNote", message: "Required" }]);
    }
    if (visibility !== "HIDDEN") {
      const display = await prisma.historyEntryDisplay.findUnique({ where: { entryId: id } });
      if (!display?.genericTitle) throw new HttpError(422, "Add a generic title before making this entry public.");
    }
    const granted = visibility === "NAMED";
    await prisma.$transaction([
      prisma.historyEntry.update({ where: { id }, data: { visibility } }),
      prisma.notableProjectPermission.upsert({
        where: { projectId: id },
        update: { permissionGranted: granted, ...(granted ? { evidenceNote: permissionNote, grantedAt: new Date() } : { grantedAt: null }), updatedBy: req.user!.email },
        create: { projectId: id, permissionGranted: granted, evidenceNote: granted ? permissionNote : null, grantedAt: granted ? new Date() : null, updatedBy: req.user!.email },
      }),
    ]);
    const reval = await revalidatePaths(PATHS.history());
    await audit(req, "visibility", "history-entry", id, { visibility, permissionGranted: granted });
    res.json({ ok: true, visibility, permissionGranted: granted, revalidation: reval });
  }),
);

adminRouter.delete(
  "/history/:id",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const entry = await prisma.historyEntry.findUnique({ where: { id } });
    if (!entry) throw new HttpError(404, "Entry not found.");
    await prisma.$transaction([
      prisma.historyEntry.delete({ where: { id } }),
      prisma.historyEntryDisplay.deleteMany({ where: { entryId: id } }),
      prisma.notableProjectPermission.updateMany({ where: { projectId: id }, data: { permissionGranted: false, grantedAt: null } }),
    ]);
    if (entry.visibility !== "HIDDEN") await revalidatePaths(PATHS.history());
    await audit(req, "delete", "history-entry", id);
    res.json({ ok: true });
  }),
);

/** IDs with written naming permission (for the content guardrail export). */
adminRouter.get(
  "/permissions",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, granted: await grantedProjectIds() });
  }),
);

/** Regenerate every CMS-driven page now. */
adminRouter.post(
  "/revalidate",
  asyncHandler(async (req, res) => {
    const posts = await prisma.post.findMany({ where: livePostWhere(), select: { slug: true, category: true } });
    const paths = [...PATHS.post(), ...posts.flatMap((p) => PATHS.post(p.slug, p.category)), ...PATHS.testimonials(), ...PATHS.gallery(), ...PATHS.resources(), ...PATHS.history()];
    const result = await revalidatePaths(paths);
    await audit(req, "revalidate", "cms", undefined, { paths: paths.length });
    res.json({ ok: true, result, paths: paths.length });
  }),
);

export const platformModule: PlatformModule = {
  name: "cms",
  routes: [
    { scope: "admin", path: "/cms", router: adminRouter },
    { scope: "public", path: "/content", router: publicRouter },
  ],
};
