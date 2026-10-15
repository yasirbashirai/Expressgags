import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { CtaBand } from "@/components/ui/cta-band";
import { CategoryNav, PostCardView } from "@/components/cms/blog-parts";
import { loadPosts } from "@/components/cms/content-api";
import { pageMeta } from "@/lib/seo";

export const revalidate = 300; // ISR: 5 minutes (also revalidated on publish)
export const dynamicParams = true;

export async function generateStaticParams() {
  const { categories } = await loadPosts();
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const { categories } = await loadPosts();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return { title: "Category not found", robots: { index: false } };
  return pageMeta({ title: `${cat.name} | Express Bags Blog`, description: `Express Bags articles about ${cat.name.toLowerCase()} in Florida: practical planning guides and company news.`, path: `/blog/category/${cat.slug}` });
}

/** Category listing (published posts only). Unknown or empty categories 404. */
export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const [{ categories }, { posts }] = await Promise.all([loadPosts(), loadPosts(category)]);
  const cat = categories.find((c) => c.slug === category);
  if (!cat || posts.length === 0) notFound();
  return (
    <>
      <PageHero
        eyebrow="Blog & news"
        title={cat.name}
        lead={`${cat.count} ${cat.count === 1 ? "article" : "articles"} from the Express Bags team.`}
        crumbs={[{ name: "Home", path: "/" }, { name: "Blog & News", path: "/blog" }, { name: cat.name, path: `/blog/category/${cat.slug}` }]}
        primaryCta={null}
      />
      <Section>
        <CategoryNav categories={categories} active={cat.slug} />
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (<li key={p.slug}><PostCardView post={p} /></li>))}
        </ul>
      </Section>
      <CtaBand />
    </>
  );
}
