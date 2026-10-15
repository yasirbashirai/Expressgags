"use client";

/**
 * "From our social pages": Facebook Page timeline + featured Instagram posts.
 * Privacy & speed: nothing from Facebook/Instagram loads until the visitor clicks "Show posts"
 * (those embeds set third-party cookies). Configure URLs in src/content/site.ts → socialFeeds.
 */
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { social, socialFeeds } from "@/content/site";

type IconProps = { className?: string; strokeWidth?: number; "aria-hidden"?: boolean };

/** Simple outline brand marks (lucide no longer ships brand icons). */
function Instagram({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
function Facebook({ className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H6.5v3.5H9V21h3.5v-8.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />
    </svg>
  );
}

/** Turn a post link into its embeddable URL (only real instagram.com/p|reel links are accepted). */
function instagramEmbedUrl(url: string) {
  const m = url.match(/^https:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/);
  return m ? `https://www.instagram.com/${m[2]}/${m[3]}/embed/` : null;
}

export function SocialFeeds() {
  const [optedIn, setLoaded] = useState(false);
  const igProfile = social.find((s) => s.name === "Instagram")?.href ?? `https://www.instagram.com/${socialFeeds.instagramHandle}/`;
  const fbPage = socialFeeds.facebookPageUrl;
  const igPosts = socialFeeds.instagramPostUrls.map(instagramEmbedUrl).filter((u): u is string => !!u).slice(0, 6);
  // Nothing third-party to load yet → show the follow card straight away (no pointless "Show posts" step)
  const loaded = optedIn || (!fbPage && igPosts.length === 0);

  return (
    <section aria-labelledby="social-title" className="bg-sand py-16 md:py-24">
      <div className="container-eb">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="eyebrow">On the road with Express Bags</p>
            <h2 id="social-title" className="mt-3 text-3xl font-bold md:text-4xl">From our social pages</h2>
            <p className="mt-3 text-lg text-slate-ink">Recent moves, ports, hotels and event days across Florida. Follow along for updates.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {fbPage && (
              <a href={fbPage} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                <Facebook className="h-4 w-4" aria-hidden /> Facebook
              </a>
            )}
            <a href={igProfile} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              <Instagram className="h-4 w-4" aria-hidden /> @{socialFeeds.instagramHandle}
            </a>
          </div>
        </div>

        {!loaded ? (
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {/* Lightweight preview tiles until the visitor opts in */}
            {[0, 1, 2].map((i) => (
              <div key={i} aria-hidden className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-navy via-navy-700 to-navy-950">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[3px] border-orange/60" />
                <Instagram className="absolute bottom-5 left-5 h-8 w-8 text-white/70" strokeWidth={1.5} />
              </div>
            ))}
            <div className="md:col-span-3">
              <button type="button" onClick={() => setLoaded(true)} className="btn-primary">
                Show posts
              </button>
              <p className="mt-2 text-xs text-muted">Loads content from Facebook and Instagram, which may set their own cookies.</p>
            </div>
          </div>
        ) : (
          <div className={`mt-10 grid gap-6 ${fbPage ? "lg:grid-cols-[minmax(0,420px)_1fr]" : ""}`}>
            {fbPage && (
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
                <iframe
                  title="Express Bags on Facebook"
                  src={`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(fbPage)}&tabs=timeline&width=420&height=640&small_header=true&adapt_container_width=true&hide_cover=false`}
                  width="100%"
                  height="640"
                  loading="lazy"
                  className="block w-full border-0"
                  allow="encrypted-media"
                />
              </div>
            )}
            {igPosts.length > 0 ? (
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {igPosts.map((src, i) => (
                  <li key={src} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
                    <iframe title={`Express Bags Instagram post ${i + 1}`} src={src} width="100%" height="560" loading="lazy" className="block w-full border-0" />
                  </li>
                ))}
              </ul>
            ) : (
              <a href={igProfile} target="_blank" rel="noopener noreferrer"
                className="group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-navy via-navy-700 to-orange-700 p-8 text-white">
                <div aria-hidden className="absolute -right-16 -top-16 h-72 w-72 rounded-full border-[3px] border-white/30" />
                <Instagram className="h-10 w-10" strokeWidth={1.5} aria-hidden />
                <p className="mt-4 font-display text-2xl font-bold">Follow @{socialFeeds.instagramHandle}</p>
                <p className="mt-1 text-white/80">See our latest moves on Instagram.</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
                  Open Instagram <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
