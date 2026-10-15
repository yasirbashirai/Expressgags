import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock, Newspaper } from "lucide-react";
import { renderMarkdown } from "./markdown";
import { PUBLIC_API, mediaUrl, type Category, type PostCard } from "./content-api";

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "";

/** Blog card: optional cover image, category, title, excerpt, date + reading time. */
export function PostCardView({ post, featured = false }: { post: PostCard; featured?: boolean }) {
  return (
    <article className={`group card flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] ${featured ? "md:flex-row" : ""}`}>
      <Link href={`/blog/${post.slug}`} className={`relative block shrink-0 overflow-hidden bg-navy ${featured ? "aspect-[16/10] md:aspect-auto md:w-1/2" : "aspect-[16/10]"}`} tabIndex={-1} aria-hidden>
        {post.coverMediaId ? (
          <Image src={mediaUrl(post.coverMediaId)} alt="" fill sizes={featured ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"} className="object-cover transition duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy via-navy-700 to-navy-950">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[3px] border-orange/60" />
            <Newspaper className="absolute bottom-5 left-5 h-8 w-8 text-white/70" strokeWidth={1.4} />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {post.category && post.categorySlug && (
            <Link href={`/blog/category/${post.categorySlug}`} className="rounded-full bg-orange-50 px-2.5 py-1 font-semibold text-orange-700 hover:bg-orange-100">{post.category}</Link>
          )}
          {post.language === "es" && <span lang="es" className="rounded-full bg-navy-50 px-2.5 py-1 font-semibold text-navy">Español</span>}
        </div>
        <h2 className={`mt-3 font-bold leading-snug ${featured ? "text-2xl md:text-3xl" : "text-lg"}`}>
          <Link href={`/blog/${post.slug}`} className="hover:text-orange-700">{post.title}</Link>
        </h2>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-ink">{post.excerpt}</p>
        <p className="mt-5 flex items-center gap-3 text-xs text-muted">
          <span>{formatDate(post.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {post.readMinutes} min read</span>
          <ArrowUpRight className="ml-auto h-4 w-4 text-muted transition group-hover:text-orange" aria-hidden />
        </p>
      </div>
    </article>
  );
}

export function CategoryNav({ categories, active }: { categories: Category[]; active?: string }) {
  if (!categories.length) return null;
  return (
    <nav aria-label="Blog categories" className="mb-10">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link href="/blog" aria-current={!active ? "page" : undefined} className={`inline-block rounded-full border px-4 py-2 text-sm font-medium ${!active ? "border-navy bg-navy text-white" : "border-line text-navy hover:border-navy/40"}`}>
            All articles
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/blog/category/${c.slug}`} aria-current={active === c.slug ? "page" : undefined} className={`inline-block rounded-full border px-4 py-2 text-sm font-medium ${active === c.slug ? "border-navy bg-navy text-white" : "border-line text-navy hover:border-navy/40"}`}>
              {c.name} <span className="opacity-60">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Honest empty state: no fake posts, ever. */
export function BlogEmpty() {
  return (
    <div className="card flex flex-col items-start p-10">
      <Newspaper className="h-10 w-10 text-orange-700" aria-hidden />
      <h2 className="mt-6 text-2xl font-bold">First articles are on the way.</h2>
      <p className="mt-3 max-w-xl text-slate-ink">We are preparing guides on cruise-day luggage timing, group arrivals at MIA and FLL, event load-in planning and more.</p>
      <Link href="/faq" className="btn-ghost mt-6">Read the FAQ meanwhile</Link>
    </div>
  );
}

/** Rendered (sanitized) Markdown body. */
export function MarkdownBody({ source }: { source: string }) {
  return (
    <div
      className="prose-eb max-w-none text-lg [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-orange [&_blockquote]:bg-orange-50/50 [&_blockquote]:px-5 [&_blockquote]:py-3 [&_blockquote_p]:mb-0 [&_code]:rounded [&_code]:bg-cloud [&_code]:px-1.5 [&_code]:text-[0.9em] [&_h2]:scroll-mt-28 [&_h2]:text-navy [&_h3]:text-navy [&_hr]:my-10 [&_hr]:border-line [&_img]:my-6 [&_img]:w-full [&_img]:rounded-2xl [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6"
      // Safe: renderMarkdown escapes all user text and only emits an allow-listed set of tags (see markdown.ts)
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source, { mediaBase: PUBLIC_API }) }}
    />
  );
}
