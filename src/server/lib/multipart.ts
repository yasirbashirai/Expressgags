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
import { EXT_KINDS, sniffKind } from "./security";

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
export async function storeUpload(file: File, opts: { stripImageMetadata?: boolean } = {}) {
  if (file.size === 0) throw new HttpError(400, "The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File is too large (maximum 10 MB).");
  const ext = extname(file.name).toLowerCase();
  const allowedExts = ALLOWED_TYPES[file.type];
  const extOk = Object.values(ALLOWED_TYPES).some((list) => list.includes(ext));
  // Some browsers send an empty/odd type for HEIC/CSV; accept when the extension is allowed.
  if (!(allowedExts?.includes(ext) || (extOk && (!file.type || file.type === "application/octet-stream")))) {
    throw new HttpError(415, "File type not allowed. Use PDF, JPG, PNG, WEBP, HEIC, DOC/DOCX, XLS/XLSX or CSV.");
  }
  // Content sniffing: the bytes must match the claimed extension (blocks HTML/SVG/scripts renamed as .pdf/.jpg, polyglots)
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniffKind(bytes);
  if (!EXT_KINDS[ext]?.includes(kind)) {
    throw new HttpError(415, "This file's contents don't match its type. Please upload the original PDF, image or document.");
  }
  // Optional: re-encode images to strip EXIF (GPS, device) metadata, e.g. for public website media
  if (opts.stripImageMetadata && (kind === "jpeg" || kind === "png" || kind === "webp")) {
    const sharp = (await import("sharp")).default;
    try {
      const img = sharp(bytes, { failOn: "error" }).rotate(); // auto-orient; output carries no metadata by default
      bytes = kind === "png" ? await img.png().toBuffer() : kind === "webp" ? await img.webp({ quality: 90 }).toBuffer() : await img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    } catch {
      throw new HttpError(415, "This image couldn't be read. Please upload the original JPG, PNG or WEBP file.");
    }
  }
  const dir = resolve(env.uploadDir);
  await mkdir(dir, { recursive: true });
  const storedName = `${randomBytes(16).toString("hex")}${ext}`;
  await writeFile(join(dir, storedName), bytes);
  const row = await prisma.upload.create({
    data: {
      // Filename is display-only (never used as a path); strip control/path characters
      originalName: file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 200) || "file",
      storedName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: bytes.length,
    },
  });
  return row.id;
}
