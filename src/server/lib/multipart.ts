/**
 * Dependency-free multipart/form-data parsing using Node's built-in WHATWG Request/FormData
 * (no multer/busboy). Body is buffered with a hard size limit first.
 */
import type { Request as ExpressRequest } from "express";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { prisma } from "../db";
import { env } from "./env";
import { HttpError } from "./errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Allowed upload types (quote attachments, résumés). */
export const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif", ".heic"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
};

async function readBody(req: ExpressRequest, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, "File is too large (maximum 10 MB).");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Parses a multipart request into a FormData (fields + File objects). */
export async function parseMultipart(req: ExpressRequest, limit = MAX_UPLOAD_BYTES + 512 * 1024): Promise<FormData> {
  const type = req.headers["content-type"] || "";
  if (!type.startsWith("multipart/form-data")) throw new HttpError(415, "Expected multipart/form-data.");
  const body = await readBody(req, limit);
  try {
    return await new Request("http://local/upload", { method: "POST", headers: { "content-type": type }, body: new Uint8Array(body) }).formData();
  } catch {
    throw new HttpError(400, "Could not read the uploaded form.");
  }
}

/** Validates and stores one file privately (random name, never served publicly). */
export async function storeUpload(file: File) {
  if (file.size === 0) throw new HttpError(400, "The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File is too large (maximum 10 MB).");
  const ext = extname(file.name).toLowerCase();
  const allowedExts = ALLOWED_TYPES[file.type];
  const extOk = Object.values(ALLOWED_TYPES).some((list) => list.includes(ext));
  // Some browsers send an empty/odd type for HEIC/CSV; accept when the extension is allowed.
  if (!(allowedExts?.includes(ext) || (extOk && (!file.type || file.type === "application/octet-stream")))) {
    throw new HttpError(415, "File type not allowed. Use PDF, JPG, PNG, WEBP, HEIC, DOC/DOCX, XLS/XLSX or CSV.");
  }
  const dir = resolve(env.uploadDir);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomBytes(16).toString("hex")}${ext}`;
  await writeFile(join(dir, storedName), Buffer.from(await file.arrayBuffer()));
  const row = await prisma.upload.create({
    data: { originalName: file.name.slice(0, 200), storedName, mimeType: file.type || "application/octet-stream", sizeBytes: file.size },
  });
  return row.id;
}
