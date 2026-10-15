import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/** Error with an HTTP status that is safe to show to clients. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Wraps async route handlers so rejections reach the error middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

/** Structured JSON errors: { ok:false, error, details? } */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  void _next;
  if (err instanceof ZodError) {
    return res.status(400).json({
      ok: false,
      error: "Please check the highlighted fields.",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message, details: err.details });
  const e = err as { type?: string; status?: number };
  if (e?.type === "entity.too.large") return res.status(413).json({ ok: false, error: "Request is too large." });
  if (e?.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON." });
  console.error("[api] unhandled error", err);
  return res.status(500).json({ ok: false, error: "Something went wrong. Please call our office or try again." });
}
