/**
 * CMS media: staff upload images/documents for the website, and the PUBLIC media route serves
 * ONLY uploads flagged isPublic (set when the owning post / gallery item / resource is published).
 * Everything else (quote attachments, résumés, PODs, employee documents…) can never be served here.
 */
import type { Request, Response } from "express";
import { join, resolve } from "node:path";
import { prisma } from "../../db";
import { env } from "../../lib/env";
import { HttpError } from "../../lib/errors";
import { parseMultipart, storeUpload } from "../../lib/multipart";

export const CMS_OWNER = "cms";
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Store one CMS file privately (isPublic stays false until its content is published). */
export async function receiveCmsFile(req: Request, opts: { kind: "cms-image" | "cms-document"; imagesOnly?: boolean }) {
  const form = await parseMultipart(req);
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.", [{ path: "file", message: "Required" }]);
  if (opts.imagesOnly && !IMAGE_TYPES.includes(file.type)) {
    throw new HttpError(415, "Website images must be JPG, PNG or WEBP.");
  }
  const id = await storeUpload(file);
  await prisma.upload.update({ where: { id }, data: { kind: opts.kind, ownerType: CMS_OWNER, uploadedBy: req.user?.email ?? null, isPublic: false } });
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  return { id, name: file.name, mimeType: file.type, sizeBytes: file.size, fields };
}

/** Flip the public flag for CMS-owned uploads only (never touches other modules' files). */
export async function setMediaPublic(ids: (string | null | undefined)[], isPublic: boolean) {
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return 0;
  const r = await prisma.upload.updateMany({ where: { id: { in: list }, ownerType: CMS_OWNER }, data: { isPublic } });
  return r.count;
}

/**
 * Re-computes the public flag for the given media ids from what is currently published,
 * so unpublishing one item never hides a file another published item still uses.
 */
export async function syncMediaVisibility(ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return;
  const now = new Date();
  const [posts, gallery, resources] = await Promise.all([
    prisma.post.findMany({ where: { status: "PUBLISHED", publishedAt: { lte: now } }, select: { coverUploadId: true, body: true } }),
    prisma.galleryItem.findMany({ where: { published: true, uploadId: { in: list } }, select: { uploadId: true } }),
    prisma.resource.findMany({ where: { published: true, uploadId: { in: list } }, select: { uploadId: true } }),
  ]);
  const used = new Set<string>();
  for (const g of gallery) used.add(g.uploadId);
  for (const r of resources) if (r.uploadId) used.add(r.uploadId);
  for (const p of posts) {
    if (p.coverUploadId) used.add(p.coverUploadId);
    for (const id of list) if (p.body.includes(id)) used.add(id);
  }
  // Scheduled posts (publishedAt in the future) keep their media public too, so they render at go-live.
  const scheduled = await prisma.post.findMany({ where: { status: "PUBLISHED", publishedAt: { gt: now } }, select: { coverUploadId: true, body: true } });
  for (const p of scheduled) {
    if (p.coverUploadId) used.add(p.coverUploadId);
    for (const id of list) if (p.body.includes(id)) used.add(id);
  }
  await setMediaPublic(list.filter((id) => used.has(id)), true);
  await setMediaPublic(list.filter((id) => !used.has(id)), false);
}

/** Streams a CMS upload. publicOnly=true → 404 unless isPublic (the public route). */
export async function sendCmsMedia(req: Request, res: Response, id: string, publicOnly: boolean) {
  if (!/^[a-z0-9]{8,40}$/i.test(id)) throw new HttpError(404, "Not found.");
  const up = await prisma.upload.findUnique({ where: { id } });
  const allowed = up && up.ownerType === CMS_OWNER && (!publicOnly || up.isPublic);
  if (!up || !allowed) throw new HttpError(404, "Not found.");
  const inline = up.mimeType.startsWith("image/") || up.mimeType === "application/pdf";
  res.setHeader("Content-Type", up.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  // Public media is immutable per id; private staff previews must not be cached by shared caches.
  res.setHeader("Cache-Control", publicOnly ? "public, max-age=31536000, immutable" : "private, max-age=60");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader(
    "Content-Disposition",
    `${inline && req.query.download !== "1" ? "inline" : "attachment"}; filename="${up.originalName.replace(/[^\w.\- ]/g, "_")}"`,
  );
  res.sendFile(join(resolve(env.uploadDir), up.storedName));
}
