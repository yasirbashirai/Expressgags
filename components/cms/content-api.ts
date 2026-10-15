/**
 * Server-side CMS content loader for public pages (ISR). Import only from server components.
 * Every call has a short timeout and returns the provided FALLBACK when the API is unreachable,
 * so `next build` and page renders never fail because the API is down.
 * Revalidates every 5 minutes; publishing also triggers on-demand revalidation (/api/revalidate).
 */

/** Server-to-server API origin (build + render). */
const SERVER_API = (process.env.CMS_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
/** Browser-facing API origin for media URLs. */
export const PUBLIC_API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export const REVALIDATE_SECONDS = 300;

export const mediaUrl = (id: string) => `${PUBLIC_API}/v1/content/media/${id}`;

export type PostCard = {
  slug: string;
  title: string;
  excerpt: string;
  category: string | null;
  categorySlug: string | null;
  tags: string[];
  coverMediaId: string | null;
  language: "en" | "es" | string;
  author: string;
  publishedAt: string | null;
  updatedAt: string;
  readMinutes: number;
};
export type PostFull = PostCard & { body: string; seoTitle: string | null; seoDescription: string | null };
export type Category = { name: string; slug: string; count: number };
export type PublicTestimonial = { id: string; quote: string; attribution: string; rating: number | null };
export type PublicGalleryItem = { id: string; mediaId: string; caption: string; alt: string; category: string | null };
export type PublicResource = { id: string; title: string; description: string | null; mediaId: string | null; fileName: string | null; mimeType: string | null; sizeBytes: number | null };
export type PublicHistoryEntry = { key: string; year: string; title: string; type: string | null; summary: string; through: string | null; locations: string[]; named: boolean };

/** GET /v1/content<path>; returns null on any failure (network, timeout, non-2xx, bad JSON). */
async function getContent<T>(path: string, opts: { tags?: string[] } = {}): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API}/v1/content${path}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: opts.tags },
      signal: AbortSignal.timeout(Number(process.env.CMS_FETCH_TIMEOUT_MS || 2500)),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T & { ok?: boolean };
    return data?.ok === false ? null : data;
  } catch {
    return null;
  }
}

export async function loadPosts(category?: string): Promise<{ posts: PostCard[]; categories: Category[]; live: boolean }> {
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  const d = await getContent<{ posts: PostCard[]; categories: Category[] }>(`/posts${q}`, { tags: ["posts"] });
  return d ? { posts: d.posts, categories: d.categories, live: true } : { posts: [], categories: [], live: false };
}

/** Returns undefined when the API is unreachable (caller decides), null when the post doesn't exist. */
export async function loadPost(slug: string): Promise<{ post: PostFull; related: PostCard[] } | null> {
  return getContent<{ post: PostFull; related: PostCard[] }>(`/posts/${encodeURIComponent(slug)}`, { tags: ["posts", `post:${slug}`] });
}

export async function loadTestimonials(): Promise<PublicTestimonial[]> {
  return (await getContent<{ testimonials: PublicTestimonial[] }>("/testimonials", { tags: ["testimonials"] }))?.testimonials ?? [];
}

export async function loadGallery(): Promise<PublicGalleryItem[]> {
  return (await getContent<{ items: PublicGalleryItem[] }>("/gallery", { tags: ["gallery"] }))?.items ?? [];
}

export async function loadResources(): Promise<PublicResource[]> {
  return (await getContent<{ resources: PublicResource[] }>("/resources", { tags: ["resources"] }))?.resources ?? [];
}

/**
 * null → API unreachable OR no history entries created yet (pages fall back to the static, generic
 * history in src/content/site.ts). [] → the office deliberately hid every entry.
 */
export async function loadHistory(): Promise<PublicHistoryEntry[] | null> {
  const d = await getContent<{ entries: PublicHistoryEntry[]; initialized?: boolean }>("/history", { tags: ["history"] });
  return d && d.initialized !== false ? d.entries : null;
}
