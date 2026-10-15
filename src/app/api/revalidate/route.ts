/**
 * On-demand ISR endpoint called by the API after CMS content changes.
 * POST { paths: string[] } with header x-revalidate-secret: REVALIDATE_SECRET.
 * Only site-relative public paths are accepted (never /admin, /account, /driver, /api).
 */
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BLOCKED = /^\/(admin|account|driver|api|q|invoice|pay)(\/|$)/;

function secretOk(given: string | null) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-revalidate-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const paths = Array.isArray((body as { paths?: unknown })?.paths) ? ((body as { paths: unknown[] }).paths as unknown[]) : [];
  const accepted = paths
    .filter((p): p is string => typeof p === "string" && /^\/[a-z0-9\-/.]*$/i.test(p) && p.length < 200 && !BLOCKED.test(p))
    .slice(0, 100);
  for (const p of accepted) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: accepted });
}
