import type { MetadataRoute } from "next";
import { airports, markets, ports, services } from "@/content/site";
import { SITE_URL } from "@/lib/seo";
import { loadPosts } from "@/components/cms/content-api";

/** All public routes. /admin and /api are excluded (see robots.ts). */
const STATIC = [
  "/", "/about", "/our-history", "/notable-projects", "/industries", "/fleet", "/business-accounts", "/gallery",
  "/testimonials", "/faq", "/resources", "/careers", "/blog", "/contact", "/request-a-quote", "/track",
  "/privacy-policy", "/terms", "/accessibility", "/services", "/service-areas", "/airports", "/ports",
];

/** Published blog posts/categories come from the CMS (ISR); if the API is unreachable they are simply omitted. */
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { posts, categories } = await loadPosts();
  const now = new Date();
  const entry = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "monthly") => ({
    url: new URL(path, SITE_URL).toString(),
    lastModified: now,
    changeFrequency,
    priority,
  });
  return [
    ...STATIC.map((p) => entry(p, p === "/" ? 1 : ["/request-a-quote", "/services", "/service-areas"].includes(p) ? 0.9 : 0.6, p === "/blog" ? "weekly" : "monthly")),
    ...services.map((s) => entry(`/services/${s.slug}`, 0.8)),
    ...markets.map((m) => entry(`/service-areas/${m.slug}`, m.tier === "top" ? 0.85 : 0.75)),
    ...airports.map((a) => entry(`/airports/${a.slug}`, 0.7)),
    ...ports.map((p) => entry(`/ports/${p.slug}`, 0.7)),
    // Spanish (es-US) pages
    entry("/es", 0.8),
    entry("/es/servicios", 0.7),
    entry("/es/solicitar-cotizacion", 0.8),
    ...markets.map((m) => entry(`/es/areas/${m.slug}`, 0.7)),
    ...services.map((sv) => entry(`/es/servicios/${sv.slug}`, 0.6)),
    ...posts.map((p) => ({ ...entry(`/blog/${p.slug}`, 0.6), lastModified: new Date(p.updatedAt) })),
    ...categories.map((c) => entry(`/blog/category/${c.slug}`, 0.4, "weekly")),
  ];
}
