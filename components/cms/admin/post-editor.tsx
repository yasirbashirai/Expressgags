"use client";

/**
 * Blog post editor: Markdown with live (sanitized) preview, cover image, inline image upload,
 * category/tags, SEO fields, language, and draft / publish / schedule / unpublish / archive.
 * The author is always "Express Bags Team" (never a personal name).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, Eye, ImagePlus, Pencil, Send, Trash2, Upload } from "lucide-react";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { api, dateTime } from "@/components/admin/api";
import { ConfirmButton, Field, inputCls } from "@/components/admin/ui";
import { markdownToText, renderMarkdown } from "../markdown";
import { StateBadge, errorText, postState, staffMediaUrl, uploadTo, type Post } from "./shared";

const blank = { title: "", slug: "", excerpt: "", body: "", coverUploadId: "", category: "", tags: "", seoTitle: "", seoDescription: "", language: "en" as "en" | "es" };

const toForm = (p: Post) => ({
  title: p.title, slug: p.slug, excerpt: p.excerpt ?? "", body: p.body, coverUploadId: p.coverUploadId ?? "", category: p.category ?? "",
  tags: p.tags.join(", "), seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", language: p.language,
});

/** Local datetime-input value (Miami time is what the office thinks in; the browser converts to ISO). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function PostEditor({ id }: { id: string }) {
  const router = useRouter();
  const isNew = id === "new";
  const [post, setPost] = useState<Post | null>(null);
  const [form, setForm] = useState(blank);
  const [view, setView] = useState<"write" | "preview">("write");
  const [schedule, setSchedule] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isNew) return;
    api<{ post: Post }>(`/cms/posts/${id}`).then((r) => { setPost(r.post); setForm(toForm(r.post)); setSchedule(toLocalInput(r.post.publishedAt)); }).catch((e) => setMsg({ kind: "error", text: errorText(e) }));
  }, [id, isNew]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const payload = () => ({
    title: form.title, ...(form.slug ? { slug: form.slug } : {}), excerpt: form.excerpt, body: form.body, coverUploadId: form.coverUploadId || null,
    category: form.category, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean), seoTitle: form.seoTitle, seoDescription: form.seoDescription, language: form.language,
  });

  /** Save the draft fields; returns the saved post. */
  const save = async (): Promise<Post | null> => {
    setSaving(true);
    setMsg(null);
    // Once a new post is created, keep editing that same post (never create a duplicate)
    const currentId = post?.id ?? (isNew ? null : id);
    try {
      const r = currentId
        ? await api<{ post: Post }>(`/cms/posts/${currentId}`, { method: "PATCH", json: payload() })
        : await api<{ post: Post }>("/cms/posts", { method: "POST", json: payload() });
      setPost(r.post);
      setForm(toForm(r.post));
      // Update the address bar without remounting the editor (keeps status messages and state)
      if (!currentId) window.history.replaceState(null, "", `/admin/content/posts/${r.post.id}`);
      setMsg({ kind: "ok", text: "Saved." });
      return r.post;
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = async (when?: string) => {
    const saved = await save();
    if (!saved) return;
    try {
      const r = await api<{ post: Post; scheduled: boolean }>(`/cms/posts/${saved.id}/publish`, { method: "POST", json: when ? { publishedAt: new Date(when).toISOString() } : {} });
      setPost(r.post);
      setMsg({ kind: "ok", text: r.scheduled ? `Scheduled for ${dateTime(r.post.publishedAt!)}.` : "Published. The article is live on the website." });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  const unpublish = async (archive: boolean) => {
    if (!post) return;
    try {
      const r = await api<{ post: Post }>(`/cms/posts/${post.id}/unpublish`, { method: "POST", json: { archive } });
      setPost(r.post);
      setMsg({ kind: "ok", text: archive ? "Archived (removed from the website)." : "Moved back to draft (removed from the website)." });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  const remove = async () => {
    if (!post) return;
    try { await api(`/cms/posts/${post.id}`, { method: "DELETE" }); router.push("/admin/content"); } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  const uploadCover = async (file: File) => {
    try {
      const r = await uploadTo<{ id: string }>("/cms/media?kind=image", file);
      set("coverUploadId", r.id);
    } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  /** Uploads an image and inserts ![alt](media:ID) at the cursor. */
  const insertImage = async (file: File) => {
    try {
      const r = await uploadTo<{ id: string }>("/cms/media?kind=image", file);
      const alt = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
      const el = bodyRef.current;
      const at = el ? el.selectionStart : form.body.length;
      const snippet = `\n\n![${alt}](media:${r.id})\n\n`;
      set("body", form.body.slice(0, at) + snippet + form.body.slice(at));
      setMsg({ kind: "ok", text: "Image inserted. Edit the text inside [ ] to describe it for screen readers." });
    } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  const preview = useMemo(() => renderMarkdown(form.body, { mediaBase: "", mediaUrl: staffMediaUrl }), [form.body]);
  const state = post ? postState(post) : "DRAFT";
  const words = markdownToText(form.body, 1_000_000).split(" ").filter(Boolean).length;

  return (
    <>
      <Link href="/admin/content" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"><ArrowLeft className="h-4 w-4" aria-hidden /> Website content</Link>
      <AdminTitle
        title={isNew ? "New post" : form.title || "Untitled post"}
        sub={post ? `Updated ${dateTime(post.updatedAt)} · ${words} words · by Express Bags Team` : "Drafts stay private until you publish."}
        actions={
          <>
            {post && <StateBadge state={state} />}
            {post?.status === "PUBLISHED" && <a className="btn-ghost !py-2" href={`/blog/${post.slug}`} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" aria-hidden /> View live</a>}
            <button className="btn-ghost !py-2" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
            <button className="btn-primary !py-2" onClick={() => publish()} disabled={saving}><Send className="h-4 w-4" aria-hidden /> {post?.status === "PUBLISHED" ? "Update live post" : "Publish now"}</button>
          </>
        }
      />
      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 text-sm ${msg.kind === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{msg.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Panel>
            <div className="grid gap-4">
              <Field label="Title" htmlFor="p-title"><input id="p-title" className={`${inputCls} text-lg font-semibold`} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="How to time cruise-day luggage at PortMiami" /></Field>
              <Field label="Excerpt" htmlFor="p-excerpt" hint="One or two sentences shown on the blog list and in search results."><textarea id="p-excerpt" rows={2} className={inputCls} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} /></Field>
            </div>
          </Panel>
          <Panel>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div role="tablist" className="flex rounded-full border border-line p-1">
                <button role="tab" aria-selected={view === "write"} className={`rounded-full px-4 py-1.5 text-sm ${view === "write" ? "bg-navy text-white" : "text-slate-ink"}`} onClick={() => setView("write")}><Pencil className="mr-1 inline h-3.5 w-3.5" aria-hidden />Write</button>
                <button role="tab" aria-selected={view === "preview"} className={`rounded-full px-4 py-1.5 text-sm ${view === "preview" ? "bg-navy text-white" : "text-slate-ink"}`} onClick={() => setView("preview")}><Eye className="mr-1 inline h-3.5 w-3.5" aria-hidden />Preview</button>
              </div>
              <label className="btn-ghost ml-auto cursor-pointer !py-1.5 text-sm">
                <ImagePlus className="h-4 w-4" aria-hidden /> Insert image
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])} />
              </label>
            </div>
            <div className={view === "write" ? "grid gap-4 xl:grid-cols-2" : ""}>
              {view === "write" && (
                <div>
                  <label htmlFor="p-body" className="sr-only">Article body (Markdown)</label>
                  <textarea id="p-body" ref={bodyRef} rows={24} className={`${inputCls} font-mono text-sm leading-relaxed`} value={form.body} onChange={(e) => set("body", e.target.value)}
                    placeholder={"## A heading\n\nWrite in plain paragraphs. Use **bold**, *italic*, [links](https://…), lists:\n\n- first point\n- second point\n\n> A highlighted note"} />
                  <p className="mt-2 text-xs text-muted">Markdown: ## heading · **bold** · *italic* · [text](link) · - list · &gt; quote · --- divider</p>
                </div>
              )}
              <div className={`min-w-0 rounded-2xl border border-line bg-white p-5 ${view === "write" ? "hidden xl:block" : ""}`} aria-label="Preview">
                {form.body.trim() ? (
                  <div className="prose-eb [&_blockquote]:border-l-4 [&_blockquote]:border-orange [&_blockquote]:pl-4 [&_img]:rounded-xl [&_ol]:list-decimal [&_ol]:pl-6" dangerouslySetInnerHTML={{ __html: preview }} />
                ) : <p className="text-sm text-muted">The preview appears here as you write.</p>}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Panel title="Publishing">
            <div className="grid gap-3 text-sm">
              <Field label="Schedule for later" htmlFor="p-sched" hint="Your local time. Leave empty to publish now.">
                <input id="p-sched" type="datetime-local" className={inputCls} value={schedule} onChange={(e) => setSchedule(e.target.value)} />
              </Field>
              <button className="btn-navy" onClick={() => schedule && publish(schedule)} disabled={!schedule || saving}><CalendarClock className="h-4 w-4" aria-hidden /> Schedule</button>
              {post?.status === "PUBLISHED" && <button className="btn-ghost" onClick={() => unpublish(false)}>Unpublish (back to draft)</button>}
              {post && post.status !== "ARCHIVED" && <button className="btn-ghost" onClick={() => unpublish(true)}>Archive</button>}
              {post && <ConfirmButton className="btn-ghost text-rose-700" onConfirm={remove} confirmText="Click again to delete permanently"><Trash2 className="h-4 w-4" aria-hidden /> Delete post</ConfirmButton>}
            </div>
          </Panel>
          <Panel title="Cover image">
            {form.coverUploadId ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- private staff preview served with cookies */}
                <img src={staffMediaUrl(form.coverUploadId)} alt="Cover preview" className="mb-3 aspect-[16/9] w-full rounded-xl bg-cloud object-cover" />
                <button className="btn-ghost w-full !py-2" onClick={() => set("coverUploadId", "")}>Remove cover</button>
              </>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted hover:border-navy/40">
                <Upload className="h-6 w-6" aria-hidden /> Upload a cover (JPG, PNG, WEBP)
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
              </label>
            )}
            <p className="mt-2 text-xs text-muted">Original photos only. Identifiable people need their consent.</p>
          </Panel>
          <Panel title="Details">
            <div className="grid gap-4">
              <Field label="Link (slug)" htmlFor="p-slug" hint={`/blog/${form.slug || "generated-from-title"}`}><input id="p-slug" className={inputCls} value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
              <Field label="Category" htmlFor="p-cat"><input id="p-cat" className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Cruise-day planning" /></Field>
              <Field label="Tags" htmlFor="p-tags" hint="Comma separated."><input id="p-tags" className={inputCls} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="PortMiami, cruise, luggage" /></Field>
              <Field label="Language" htmlFor="p-lang">
                <select id="p-lang" className={inputCls} value={form.language} onChange={(e) => set("language", e.target.value as "en" | "es")}><option value="en">English</option><option value="es">Español</option></select>
              </Field>
            </div>
          </Panel>
          <Panel title="Search appearance">
            <div className="grid gap-4 [&>*]:min-w-0">
              <Field label={`SEO title (${form.seoTitle.length}/70)`} htmlFor="p-seot"><input id="p-seot" maxLength={70} className={inputCls} value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></Field>
              <Field label={`SEO description (${form.seoDescription.length}/170)`} htmlFor="p-seod"><textarea id="p-seod" maxLength={170} rows={3} className={inputCls} value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></Field>
              <div className="min-w-0 overflow-hidden rounded-xl bg-cloud p-3 text-xs">
                <p className="truncate font-semibold text-[#1a0dab]">{form.seoTitle || form.title || "Post title"}</p>
                <p className="truncate text-emerald-800">express-bags.com/blog/{form.slug || "…"}</p>
                <p className="line-clamp-2 text-slate-ink">{form.seoDescription || form.excerpt || markdownToText(form.body, 160) || "Description shown in search results."}</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
