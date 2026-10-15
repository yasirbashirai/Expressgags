/**
 * Small, dependency-free, XSS-safe Markdown renderer for CMS content (blog posts).
 *
 * Supported: ## headings (h2–h4; "#" becomes h2 because the page owns the h1), paragraphs, line breaks,
 * - / * / 1. lists, > blockquotes, --- rules, **bold**, *italic* / _italic_, `code`, [links](url) and
 * ![images](media:ID) that point at PUBLIC CMS media only.
 *
 * Safety model: every piece of user text is HTML-escaped; only the tags this file emits ever reach the page.
 * Link URLs are allow-listed (http/https/mailto/tel, site-relative paths, #anchors); everything else
 * (javascript:, data:, vbscript:, protocol-relative //…) is dropped and rendered as plain text.
 * Image sources must be a CMS media id, rendered as `${mediaBase}/v1/content/media/<id>`.
 * Pure function: usable in server components (public pages) and in the admin live preview.
 */

export type MarkdownOptions = {
  /** API origin for public media, e.g. https://api.express-bags.com (no trailing slash) */
  mediaBase: string;
  /** Optional override for image URLs (admin preview uses the private staff media route) */
  mediaUrl?: (id: string) => string;
};

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Returns a safe href or null. */
export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url || /[\s<>"'`]/.test(url)) return null;
  if (url.startsWith("#")) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (/^(https?:|mailto:|tel:)/i.test(url)) {
    try {
      // Reject malformed absolute URLs
      if (/^https?:/i.test(url)) new URL(url);
      return url;
    } catch {
      return null;
    }
  }
  return null;
}

const MEDIA_RE = /^(?:media:|\/v1\/content\/media\/|https?:\/\/[^/\s]+\/v1\/content\/media\/)([a-z0-9]{8,40})$/i;

/** Extracts a CMS media id from an image source, or null when the source is not public CMS media. */
export const mediaIdFrom = (src: string) => MEDIA_RE.exec(src.trim())?.[1] ?? null;

/** Bold / italic / code on ALREADY-ESCAPED text. */
function emphasis(escaped: string) {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>");
}

/** Inline markup: images, links, then emphasis. Raw text is escaped before any tag is added. */
export function renderInline(raw: string, opts: MarkdownOptions): string {
  const token = /(!?)\[([^\]]{0,300})\]\(([^)\s]{1,500})\)/g;
  let out = "";
  let last = 0;
  for (let m = token.exec(raw); m; m = token.exec(raw)) {
    out += emphasis(escapeHtml(raw.slice(last, m.index)));
    const [whole, bang, label, target] = m;
    if (bang) {
      const id = mediaIdFrom(target);
      out += id
        ? `<img src="${escapeHtml(opts.mediaUrl ? opts.mediaUrl(id) : `${opts.mediaBase}/v1/content/media/${id}`)}" alt="${escapeHtml(label)}" loading="lazy" decoding="async" />`
        : escapeHtml(whole); // non-CMS images are never embedded
    } else {
      const href = safeHref(target);
      if (href) {
        const external = /^https?:/i.test(href);
        out += `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""}>${emphasis(escapeHtml(label))}</a>`;
      } else {
        out += emphasis(escapeHtml(label));
      }
    }
    last = m.index + whole.length;
  }
  out += emphasis(escapeHtml(raw.slice(last)));
  return out;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);

/** Renders a Markdown document to safe HTML. */
export function renderMarkdown(src: string, opts: MarkdownOptions): string {
  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  const isBlank = (l: string) => l.trim() === "";
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const h = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = Math.min(4, Math.max(2, h[1].length + (h[1].length === 1 ? 1 : 0)));
      html.push(`<h${level} id="${slug(h[2])}">${renderInline(h[2], opts)}</h${level}>`);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { html.push("<hr />"); i++; continue; }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      html.push(`<blockquote>${renderMarkdown(quote.join("\n"), opts)}</blockquote>`);
      continue;
    }

    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d{1,3}[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((it) => `<li>${renderInline(it, opts)}</li>`).join("")}</${tag}>`);
      continue;
    }

    // Paragraph: consecutive non-blank lines that don't start another block
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,4}\s|\s*>|\s*[-*]\s+|\s*\d{1,3}[.)]\s+|-{3,}\s*$)/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) { para.push(lines[i++]); }
    html.push(`<p>${para.map((p) => renderInline(p, opts)).join("<br />")}</p>`);
  }
  return html.join("\n");
}

/** Plain-text excerpt from Markdown (for meta descriptions and cards). */
export function markdownToText(src: string, max = 200) {
  const text = (src ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|>|[-*]|\d{1,3}[.)]|-{3,})\s*/gm, " ")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text;
}

/** Media ids referenced by a Markdown body (so publishing can make them public). */
export function referencedMediaIds(src: string): string[] {
  const ids = new Set<string>();
  for (const m of (src ?? "").matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const id = mediaIdFrom(m[1]);
    if (id) ids.add(id);
  }
  return [...ids];
}
