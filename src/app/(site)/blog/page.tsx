import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { BlogEmpty, CategoryNav, PostCardView } from "@/components/cms/blog-parts";
import { loadPosts } from "@/components/cms/content-api";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300; // ISR: 5 minutes (also revalidated on publish)

export const metadata: Metadata = pageMeta({
  title: "Blog & News | Express Bags, Inc.",
  description: "Florida travel logistics guides, cruise-day tips, event logistics planning and Express Bags company news.",
  path: "/blog",
});

/** Blog index: published CMS posts (ISR), newest first. Honest empty state until real articles are approved. */
export default async function BlogPage() {
  const { posts, categories } = await loadPosts();
  const [featured, ...rest] = posts;
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
        <CategoryNav categories={categories} />
        {!featured ? (
          <BlogEmpty />
        ) : (
          <div className="grid gap-6">
            <PostCardView post={featured} featured />
            {rest.length > 0 && (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p) => (<li key={p.slug}><PostCardView post={p} /></li>))}
              </ul>
            )}
          </div>
        )}
      </Section>
      <CtaBand />
    </>
  );
}
