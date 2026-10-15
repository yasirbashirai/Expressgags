import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Blog & News | Express Bags, Inc.",
  description: "Florida travel logistics guides, cruise-day tips, event logistics planning and Express Bags company news.",
  path: "/blog",
});

/** Posts are loaded from the CMS/content store once published. Empty until real articles are approved. */
const posts: { slug: string; title: string; excerpt: string; date: string; topic: string }[] = [];

const TOPICS = ["Cruise-day planning", "Airport arrivals", "Group & event logistics", "Business delivery", "Company news"];

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog & news"
        title="Guides for moving luggage, gear and cargo in Florida."
        lead="Practical planning advice from a team that has worked Florida's airports, hotels and cruise ports since 2010."
        crumbs={[{ name: "Home", path: "/" }, { name: "Blog & News", path: "/blog" }]}
        primaryCta={null}
      />
      <Section>
        <ul className="mb-10 flex flex-wrap gap-2" aria-label="Topics">
          {TOPICS.map((t) => (<li key={t} className="rounded-full border border-line px-4 py-2 text-sm text-navy">{t}</li>))}
        </ul>
        {posts.length === 0 ? (
          <div className="card flex flex-col items-start p-10">
            <Newspaper className="h-10 w-10 text-orange-700" aria-hidden />
            <h2 className="mt-6 text-2xl font-bold">First articles are on the way.</h2>
            <p className="mt-3 max-w-xl text-slate-ink">We are preparing guides on cruise-day luggage timing, group arrivals at MIA and FLL, event load-in planning and more.</p>
            <Link href="/faq" className="btn-ghost mt-6">Read the FAQ meanwhile</Link>
          </div>
        ) : (
          <ul className="grid gap-5 md:grid-cols-3">
            {posts.map((p) => (
              <li key={p.slug} className="card p-6">
                <p className="text-xs font-semibold uppercase text-orange-700">{p.topic}</p>
                <h2 className="mt-3 text-lg font-bold"><Link href={`/blog/${p.slug}`}>{p.title}</Link></h2>
                <p className="mt-2 text-sm text-slate-ink">{p.excerpt}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <CtaBand />
    </>
  );
}
