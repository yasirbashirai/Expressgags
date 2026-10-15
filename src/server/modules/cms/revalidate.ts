/**
 * On-demand ISR: after content is published/changed, ask the Next.js site to regenerate the affected
 * pages (src/app/api/revalidate/route.ts, protected by REVALIDATE_SECRET). Pages also revalidate on
 * their own every 5 minutes, so a failed call only delays the update — it never breaks publishing.
 */
import { webBaseUrl } from "../../auth";

export type RevalidateResult = { ok: boolean; skipped?: string; status?: number };

/** Internal URL of the website (server-to-server). */
export const webInternalUrl = () => (process.env.WEB_INTERNAL_URL || process.env.PUBLIC_WEB_URL || webBaseUrl()).replace(/\/$/, "");

export async function revalidatePaths(paths: string[]): Promise<RevalidateResult> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return { ok: false, skipped: "REVALIDATE_SECRET not set (pages refresh within 5 minutes)" };
  const unique = [...new Set(paths)].filter((p) => p.startsWith("/"));
  try {
    const res = await fetch(`${webInternalUrl()}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ paths: unique }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.warn("[cms] revalidation call failed:", (e as Error).message);
    return { ok: false, skipped: "website unreachable" };
  }
}

/** Paths affected by each content type. */
export const PATHS = {
  post: (slug?: string, category?: string | null) =>
    ["/blog", "/sitemap.xml", ...(slug ? [`/blog/${slug}`] : []), ...(category ? [`/blog/category/${categorySlug(category)}`] : [])],
  testimonials: () => ["/testimonials", "/"],
  gallery: () => ["/gallery"],
  resources: () => ["/resources"],
  history: () => ["/our-history", "/notable-projects"],
};

export const categorySlug = (c: string) => c.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
