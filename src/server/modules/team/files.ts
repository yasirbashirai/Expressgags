/**
 * Private file helpers for the resources modules (team, fleet, credentials): store an uploaded file
 * with ownership metadata, and stream it back to signed-in staff only (images inline, others as attachment).
 */
import type { Request, Response } from "express";
import { join, resolve } from "node:path";
import { prisma } from "../../db";
import { env } from "../../lib/env";
import { HttpError } from "../../lib/errors";
import { parseMultipart, storeUpload } from "../../lib/multipart";

/** Reads a multipart request with one "file" field (+ text fields) and stores the file privately. */
export async function receiveFile(req: Request, meta: { kind: string; ownerType: string; ownerId: string }) {
  const form = await parseMultipart(req);
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.", [{ path: "file", message: "Required" }]);
  const uploadId = await storeUpload(file);
  await prisma.upload.update({ where: { id: uploadId }, data: { ...meta, uploadedBy: req.user?.email } });
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
  return { uploadId, fields, originalName: file.name };
}

const OWNED = ["employee", "vehicle", "credential"];

/** Streams a resources-owned upload to staff (never public). */
export async function sendResourceFile(req: Request, res: Response, uploadId: string) {
  const up = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!up || !up.ownerType || !OWNED.includes(up.ownerType)) throw new HttpError(404, "File not found.");
  const inline = up.mimeType.startsWith("image/") && req.query.inline === "1";
  res.setHeader("Content-Type", up.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${up.originalName.replace(/[^\w.\- ]/g, "_")}"`);
  res.sendFile(join(resolve(env.uploadDir), up.storedName));
}

/** Optional ISO date (yyyy-mm-dd or full ISO) → Date | null; "" clears. */
export const parseDate = (v: unknown): Date | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(String(v).length === 10 ? `${v}T12:00:00Z` : String(v));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid date.");
  return d;
};
