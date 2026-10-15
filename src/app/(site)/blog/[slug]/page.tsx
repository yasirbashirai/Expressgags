import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CtaBand } from "@/components/ui/cta-band";
import { JsonLd } from "@/components/ui/json-ld";
import { MarkdownBody, PostCardView, formatDate } from "@/components/cms/blog-parts";
import { loadPost, loadPosts, mediaUrl } from "@/components/cms/content-api";
import { company } from "@/content/site";
import { SITE_URL, pageMeta } from "@/lib/seo";

export const revalidate = 300; // ISR: 5 minutes (also revalidated on publish)
// New posts render on first request after publishing (then cached via ISR)
export const dynamicParams = true;

export async function generateStaticParams() {
  const { posts } = await loadPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPost(slug);
  if (!data) return { title: "Article not found", robots: { index: false } };
  const { post } = data;
  const meta = pageMeta({ title: post.seoTitle || `${post.title} | Express Bags Blog`, description: post.seoDescription || post.excerpt, path: `/blog/${post.slug}` });
  return {
    ...meta,
    openGraph: { ...meta.openGraph, type: "article", publishedTime: post.publishedAt ?? undefined, ...(post.coverMediaId ? { images: [{ url: mediaUrl(post.coverMediaId), alt: post.title }] } : {}) },
    ...(post.language === "es" ? { other: { "content-language": "es" } } : {}),
  };
}

/** Blog article: breadcrumbs, cover, sanitized Markdown body, Article schema, related posts and CTA. */
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPost(slug);
  if (!data) notFound();
  const { post, related } = data;
  const url = new URL(`/blog/${post.slug}`, SITE_URL).toString();
  return (
    <>
      <article lang={post.language === "es" ? "es" : undefined}>
        <header className="bg-navy text-white">
          <div className="container-eb py-12 md:py-16">
            <Breadcrumbs light items={[{ name: "Home", path: "/" }, { name: "Blog & News", path: "/blog" }, { name: post.title, path: `/blog/${post.slug}` }]} />
            <div className="mt-8 max-w-3xl">
              {post.category && post.categorySlug && (
                <Link href={`/blog/category/${post.categorySlug}`} className="eyebrow !text-orange-100 hover:underline">{post.category}</Link>
              )}
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] text-white md:text-5xl">{post.title}</h1>
              {post.excerpt && <p className="mt-5 text-lg text-white/80">{post.excerpt}</p>}
              <p className="mt-6 flex flex-wrap items-center gap-3 text-sm text-white/70">
                <span>{post.author}</span>
                <span aria-hidden>·</span>
                <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden /> {post.readMinutes} min read</span>
              </p>
            </div>
          </div>
          <div className="flight-line opacity-70" aria-hidden />
        </header>

        <div className="container-eb py-12 md:py-16">
          {post.coverMediaId && (
            <div className="relative mx-auto mb-12 aspect-[16/9] max-w-4xl overflow-hidden rounded-[1.75rem] bg-cloud">
              <Image src={mediaUrl(post.coverMediaId)} alt={post.title} fill priority sizes="(min-width: 1024px) 896px, 100vw" className="object-cover" />
            </div>
          )}
          <div className="mx-auto max-w-3xl">
            <MarkdownBody source={post.body} />
            {post.tags.length > 0 && (
              <ul className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6" aria-label="Tags">
                {post.tags.map((t) => (<li key={t} className="rounded-full bg-cloud px-3 py-1 text-xs text-slate-ink">#{t}</li>))}
              </ul>
            )}
            <Link href="/blog" className="btn-ghost mt-10"><ArrowLeft className="h-4 w-4" aria-hidden /> All articles</Link>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <section className="bg-cloud py-16" aria-labelledby="related-heading">
          <div className="container-eb">
            <h2 id="related-heading" className="text-2xl font-bold md:text-3xl">Keep reading</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (<li key={p.slug}><PostCardView post={p} /></li>))}
            </ul>
          </div>
        </section>
      )}
      <CtaBand />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.seoDescription || post.excerpt,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          inLanguage: post.language === "es" ? "es-US" : "en-US",
          mainEntityOfPage: url,
          url,
          ...(post.coverMediaId ? { image: mediaUrl(post.coverMediaId) } : {}),
          author: { "@type": "Organization", name: company.name, url: SITE_URL },
          publisher: { "@id": `${SITE_URL}/#organization` },
          keywords: post.tags.join(", ") || undefined,
        }}
      />
    </>
  );
}
