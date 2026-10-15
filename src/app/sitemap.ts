import type { MetadataRoute } from "next";
import { airports, markets, ports, services } from "@/content/site";
import { SITE_URL } from "@/lib/seo";

/** All public routes. /admin and /api are excluded (see robots.ts). */
const STATIC = [
  "/", "/about", "/our-history", "/notable-projects", "/industries", "/fleet", "/business-accounts", "/gallery",
  "/testimonials", "/faq", "/resources", "/careers", "/blog", "/contact", "/request-a-quote", "/track",
  "/privacy-policy", "/terms", "/accessibility", "/services", "/service-areas", "/airports", "/ports",
];

export default function sitemap(): MetadataRoute.Sitemap {
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
  ];
}
