"use client";

/**
 * Website content manager (/admin/content): blog posts, testimonials, gallery, downloads and the
 * company-history content model with naming permissions. Every publish action revalidates the site.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, FileText, Image as ImageIcon, Landmark, MessageSquareQuote, Plus, RefreshCw, ShieldAlert, Trash2, Upload } from "lucide-react";
import { AdminTitle, Panel } from "@/components/admin/admin-shell";
import { api, dateTime } from "@/components/admin/api";
import { ConfirmButton, DataTable, EmptyState, Field, Modal, StatCard, Tabs, Toolbar, inputCls } from "@/components/admin/ui";
import {
  EVIDENCE_LABEL, GALLERY_CATEGORIES, StateBadge, errorText, postState, staffMediaUrl, uploadTo,
  type GalleryItem, type HistoryRow, type Post, type ResourceRow, type Testimonial,
} from "./shared";

type Tab = "posts" | "testimonials" | "gallery" | "resources" | "history";
type Counts = { posts: number; drafts: number; testimonials: number; pendingTestimonials: number; gallery: number; resources: number; history: number };

/** Small inline status line for each section. */
function Notice({ msg }: { msg: { kind: "ok" | "error"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.kind === "error" ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 text-sm ${msg.kind === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>
      {msg.text}
    </p>
  );
}

export function ContentAdmin() {
  const [tab, setTab] = useState<Tab>("posts");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [revalidation, setRevalidation] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const loadCounts = useCallback(() => {
    api<{ counts: Counts; revalidation: string }>("/cms/overview").then((r) => { setCounts(r.counts); setRevalidation(r.revalidation); }).catch(() => undefined);
  }, []);
  useEffect(loadCounts, [loadCounts]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && ["posts", "testimonials", "gallery", "resources", "history"].includes(t)) setTab(t);
  }, []);

  const refreshSite = async () => {
    try {
      const r = await api<{ result: { ok: boolean; skipped?: string }; paths: number }>("/cms/revalidate", { method: "POST", json: {} });
      setMsg(r.result.ok ? { kind: "ok", text: `Website refreshed (${r.paths} pages).` } : { kind: "ok", text: `Pages refresh automatically within 5 minutes (${r.result.skipped ?? "on-demand refresh unavailable"}).` });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  return (
    <>
      <AdminTitle
        title="Website content"
        sub={`Blog, testimonials, gallery, downloads and company history. Published changes appear on the website ${revalidation === "on-demand" ? "immediately" : "within 5 minutes"}.`}
        actions={<button className="btn-ghost !py-2" onClick={refreshSite}><RefreshCw className="h-4 w-4" aria-hidden /> Refresh website now</button>}
      />
      <Notice msg={msg} />
      {counts && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Live articles" value={counts.posts} hint={`${counts.drafts} draft${counts.drafts === 1 ? "" : "s"}`} Icon={BookOpen} />
          <StatCard label="Testimonials" value={counts.testimonials} hint={`${counts.pendingTestimonials} awaiting permission`} Icon={MessageSquareQuote} />
          <StatCard label="Gallery photos" value={counts.gallery} hint="published" Icon={ImageIcon} />
          <StatCard label="Downloads" value={counts.resources} hint="published" Icon={FileText} />
          <StatCard label="History entries" value={counts.history} hint="content model" Icon={Landmark} />
        </div>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "posts", label: "Blog posts" },
          { value: "testimonials", label: "Testimonials", count: counts?.pendingTestimonials || undefined },
          { value: "gallery", label: "Gallery" },
          { value: "resources", label: "Downloads" },
          { value: "history", label: "History & names" },
        ]}
      />
      {tab === "posts" && <PostsTab />}
      {tab === "testimonials" && <TestimonialsTab onChange={loadCounts} />}
      {tab === "gallery" && <GalleryTab onChange={loadCounts} />}
      {tab === "resources" && <ResourcesTab onChange={loadCounts} />}
      {tab === "history" && <HistoryTab onChange={loadCounts} />}
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Posts                                                                      */
/* ------------------------------------------------------------------------- */

function PostsTab() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (search.trim()) q.set("search", search.trim());
    const t = setTimeout(() => {
      api<{ posts: Post[] }>(`/cms/posts?${q}`).then((r) => setPosts(r.posts)).catch((e) => setError(errorText(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [status, search]);

  return (
    <Panel>
      <Toolbar>
        <input aria-label="Search posts" placeholder="Search title or link…" className={`${inputCls} max-w-xs`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by status" className={`${inputCls} max-w-[12rem]`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Drafts</option>
          <option value="PUBLISHED">Published</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <Link href="/admin/content/posts/new" className="btn-primary ml-auto !py-2"><Plus className="h-4 w-4" aria-hidden /> New post</Link>
      </Toolbar>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      {!posts ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <DataTable
          rows={posts}
          rowKey={(p) => p.id}
          onRowClick={(p) => (window.location.href = `/admin/content/posts/${p.id}`)}
          empty={<EmptyState title="No posts yet" text="Write your first article. Posts stay private until you publish them." action={<Link href="/admin/content/posts/new" className="btn-primary">Write a post</Link>} />}
          columns={[
            { key: "title", header: "Title", cell: (p) => <span className="font-semibold text-navy">{p.title}</span> },
            { key: "status", header: "Status", cell: (p) => <StateBadge state={postState(p)} /> },
            { key: "category", header: "Category", cell: (p) => p.category ?? "—" },
            { key: "lang", header: "Lang", cell: (p) => p.language.toUpperCase() },
            { key: "date", header: "Publish date", cell: (p) => (p.publishedAt ? dateTime(p.publishedAt) : "—") },
            { key: "updated", header: "Updated", cell: (p) => dateTime(p.updatedAt), mobile: false },
          ]}
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */
/* Testimonials                                                               */
/* ------------------------------------------------------------------------- */

const emptyTestimonial = { quote: "", attribution: "", rating: "" as string | number, permissionGranted: false, permissionNote: "" };

function TestimonialsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Testimonial[] | null>(null);
  const [editing, setEditing] = useState<Testimonial | "new" | null>(null);
  const [form, setForm] = useState(emptyTestimonial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api<{ testimonials: Testimonial[] }>("/cms/testimonials").then((r) => setRows(r.testimonials)).catch((e) => setMsg({ kind: "error", text: errorText(e) })), []);
  useEffect(() => { load(); }, [load]);

  const open = (t: Testimonial | "new") => {
    setEditing(t);
    setForm(t === "new" ? emptyTestimonial : { quote: t.quote, attribution: t.attribution, rating: t.rating ?? "", permissionGranted: t.permissionGranted, permissionNote: t.permissionNote ?? "" });
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { quote: form.quote, attribution: form.attribution, rating: form.rating === "" ? null : Number(form.rating), permissionGranted: form.permissionGranted, permissionNote: form.permissionNote };
      if (editing === "new") await api("/cms/testimonials", { method: "POST", json: body });
      else if (editing) await api(`/cms/testimonials/${editing.id}`, { method: "PATCH", json: body });
      setEditing(null);
      setMsg({ kind: "ok", text: "Testimonial saved." });
      load(); onChange();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const setPublished = async (t: Testimonial, published: boolean) => {
    try {
      await api(`/cms/testimonials/${t.id}`, { method: "PATCH", json: { published } });
      setMsg({ kind: "ok", text: published ? "Published to the website." : "Removed from the website." });
      load(); onChange();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  };

  const remove = async (t: Testimonial) => {
    try { await api(`/cms/testimonials/${t.id}`, { method: "DELETE" }); load(); onChange(); } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  return (
    <Panel>
      <div className="mb-4 flex gap-3 rounded-xl bg-orange-50 p-4 text-sm text-orange-700">
        <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
        <p>Publish a testimonial only after the client approves the exact wording in writing. Use a generic attribution such as &ldquo;Hotel operations manager, Miami Beach&rdquo;, never a person&apos;s name, unless that is also approved.</p>
      </div>
      <Notice msg={msg} />
      <Toolbar>
        <button className="btn-primary ml-auto !py-2" onClick={() => open("new")}><Plus className="h-4 w-4" aria-hidden /> Add testimonial</button>
      </Toolbar>
      {!rows ? <p className="text-sm text-muted">Loading…</p> : (
        <DataTable
          rows={rows}
          rowKey={(t) => t.id}
          empty={<EmptyState title="No testimonials yet" text="Survey responses that customers allow us to share arrive here as drafts." />}
          columns={[
            { key: "quote", header: "Quote", cell: (t) => <span className="line-clamp-2 max-w-md">&ldquo;{t.quote}&rdquo;</span> },
            { key: "attr", header: "Attribution", cell: (t) => t.attribution },
            { key: "perm", header: "Permission", cell: (t) => (t.permissionGranted ? <StateBadge state="PUBLISHED" label="Recorded" /> : <StateBadge state="ARCHIVED" label="Missing" />) },
            { key: "state", header: "Website", cell: (t) => (t.published ? <StateBadge state="PUBLISHED" label="Live" /> : <StateBadge state="DRAFT" label={t.sourceSurveyId ? "Draft (survey)" : "Draft"} />) },
            {
              key: "actions", header: "", cell: (t) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="btn-ghost !px-3 !py-1.5" onClick={() => open(t)}>Edit</button>
                  {t.published
                    ? <button className="btn-ghost !px-3 !py-1.5" onClick={() => setPublished(t, false)}>Unpublish</button>
                    : <button className="btn-navy !px-3 !py-1.5" onClick={() => setPublished(t, true)} disabled={!t.permissionGranted} title={t.permissionGranted ? "" : "Record written permission first"}>Publish</button>}
                  <ConfirmButton className="btn-ghost !px-3 !py-1.5" onConfirm={() => remove(t)}><Trash2 className="h-4 w-4" aria-label="Delete" /></ConfirmButton>
                </div>
              ),
            },
          ]}
        />
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add testimonial" : "Edit testimonial"}
        footer={<><button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
        <div className="grid gap-4">
          <Field label="Quote (exact approved wording)" htmlFor="t-quote"><textarea id="t-quote" rows={5} className={inputCls} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} /></Field>
          <Field label="Generic attribution" htmlFor="t-attr" hint="E.g. “Group program director, destination management company”."><input id="t-attr" className={inputCls} value={form.attribution} onChange={(e) => setForm({ ...form, attribution: e.target.value })} /></Field>
          <Field label="Rating (optional)" htmlFor="t-rating">
            <select id="t-rating" className={inputCls} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
              <option value="">No rating</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}
            </select>
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#E06010]" checked={form.permissionGranted} onChange={(e) => setForm({ ...form, permissionGranted: e.target.checked })} />
            <span><span className="font-semibold text-navy">Written permission recorded.</span> The client approved this exact wording and attribution for publication.</span>
          </label>
          <Field label="Permission note" htmlFor="t-note" hint="Who approved, when and how (e.g. “Approved by email from the client's GM, 2026-10-02”).">
            <textarea id="t-note" rows={2} className={inputCls} value={form.permissionNote} onChange={(e) => setForm({ ...form, permissionNote: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Panel>
  );
}

/* ------------------------------------------------------------------------- */
/* Gallery                                                                    */
/* ------------------------------------------------------------------------- */

function GalleryTab({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<string>("fleet");
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => api<{ items: GalleryItem[] }>("/cms/gallery").then((r) => setItems(r.items)).catch((e) => setMsg({ kind: "error", text: errorText(e) })), []);
  useEffect(() => { load(); }, [load]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setMsg({ kind: "error", text: "Choose an image (JPG, PNG or WEBP)." });
    if (alt.trim().length < 5) return setMsg({ kind: "error", text: "Add alt text: a short description for screen readers." });
    setBusy(true);
    try {
      await uploadTo("/cms/gallery", file, { alt, caption: caption || alt, category });
      setFile(null); setAlt(""); setCaption("");
      setInputKey((k) => k + 1);
      setMsg({ kind: "ok", text: "Uploaded. Review it, then publish." });
      load(); onChange();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const patch = async (it: GalleryItem, data: Partial<GalleryItem>) => {
    try { await api(`/cms/gallery/${it.id}`, { method: "PATCH", json: data }); load(); onChange(); } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };
  const move = async (index: number, dir: -1 | 1) => {
    if (!items) return;
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    try { await api("/cms/gallery/reorder", { method: "POST", json: { ids: next.map((i) => i.id) } }); } catch (e) { setMsg({ kind: "error", text: errorText(e) }); load(); }
  };
  const remove = async (it: GalleryItem) => {
    try { await api(`/cms/gallery/${it.id}`, { method: "DELETE" }); load(); onChange(); } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Panel title="Add a photo">
        <div className="mb-4 flex gap-3 rounded-xl bg-orange-50 p-3 text-xs text-orange-700">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
          <p>Original Express Bags photos only (never stock). Identifiable people, guests, clients, venues or team members need their consent, and team members are never named.</p>
        </div>
        <form onSubmit={upload} className="grid gap-4">
          <Field label="Image" htmlFor="g-file" hint="JPG, PNG or WEBP, up to 10 MB."><input key={inputKey} id="g-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></Field>
          <Field label="Alt text (required)" htmlFor="g-alt" hint="Describe what is in the photo."><input id="g-alt" className={inputCls} value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
          <Field label="Caption" htmlFor="g-caption"><input id="g-caption" className={inputCls} value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
          <Field label="Category" htmlFor="g-cat">
            <select id="g-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>{GALLERY_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/-/g, " ")}</option>)}</select>
          </Field>
          <button className="btn-primary" disabled={busy}><Upload className="h-4 w-4" aria-hidden /> {busy ? "Uploading…" : "Upload"}</button>
        </form>
      </Panel>
      <Panel title="Gallery">
        <Notice msg={msg} />
        {!items ? <p className="text-sm text-muted">Loading…</p> : items.length === 0 ? <EmptyState title="No photos yet" text="The public gallery shows designed placeholders until the first photo is published." /> : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it, i) => (
              <li key={it.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- private staff preview served with cookies */}
                <img src={staffMediaUrl(it.uploadId)} alt={it.alt || "Gallery image (alt text missing)"} className="aspect-[4/3] w-full bg-cloud object-cover" />
                <div className="grid gap-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    {it.published ? <StateBadge state="PUBLISHED" label="Live" /> : <StateBadge state="DRAFT" />}
                    <span className="text-xs text-muted">{it.category?.replace(/-/g, " ")}</span>
                  </div>
                  <input aria-label="Alt text" className={`${inputCls} !py-1.5 text-xs`} defaultValue={it.alt} placeholder="Alt text (required to publish)" onBlur={(e) => e.target.value !== it.alt && patch(it, { alt: e.target.value })} />
                  <input aria-label="Caption" className={`${inputCls} !py-1.5 text-xs`} defaultValue={it.caption} onBlur={(e) => e.target.value !== it.caption && e.target.value.trim().length >= 3 && patch(it, { caption: e.target.value })} />
                  <div className="flex flex-wrap gap-1.5">
                    <button className={it.published ? "btn-ghost !px-3 !py-1.5" : "btn-navy !px-3 !py-1.5"} onClick={() => patch(it, { published: !it.published })}>{it.published ? "Unpublish" : "Publish"}</button>
                    <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier"><ArrowUp className="h-4 w-4" /></button>
                    <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move later"><ArrowDown className="h-4 w-4" /></button>
                    <ConfirmButton className="btn-ghost ml-auto !px-2.5 !py-1.5" onConfirm={() => remove(it)}><Trash2 className="h-4 w-4" aria-label="Delete" /></ConfirmButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Resources / downloads                                                      */
/* ------------------------------------------------------------------------- */

function ResourcesTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<ResourceRow[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => api<{ resources: ResourceRow[] }>("/cms/resources").then((r) => setRows(r.resources)).catch((e) => setMsg({ kind: "error", text: errorText(e) })), []);
  useEffect(() => { load(); }, [load]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || title.trim().length < 3) return setMsg({ kind: "error", text: "Choose a file and add a title." });
    setBusy(true);
    try {
      await uploadTo("/cms/resources", file, { title, description });
      setFile(null); setTitle(""); setDescription(""); setFileKey((k) => k + 1);
      setMsg({ kind: "ok", text: "Uploaded as unpublished. Publish it when it is approved." });
      load(); onChange();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  const patch = async (r: ResourceRow, data: Partial<ResourceRow>) => {
    try { await api(`/cms/resources/${r.id}`, { method: "PATCH", json: data }); load(); onChange(); } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };
  const remove = async (r: ResourceRow) => {
    try { await api(`/cms/resources/${r.id}`, { method: "DELETE" }); load(); onChange(); } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Panel title="Add a download">
        <form onSubmit={upload} className="grid gap-4">
          <Field label="File" htmlFor="r-file" hint="PDF preferred (also DOC/DOCX, XLS/XLSX, CSV, images)."><input key={fileKey} id="r-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></Field>
          <Field label="Title" htmlFor="r-title"><input id="r-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group luggage manifest template" /></Field>
          <Field label="Short description" htmlFor="r-desc"><textarea id="r-desc" rows={3} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <button className="btn-primary" disabled={busy}><Upload className="h-4 w-4" aria-hidden /> {busy ? "Uploading…" : "Upload"}</button>
        </form>
      </Panel>
      <Panel title="Downloads">
        <Notice msg={msg} />
        {!rows ? <p className="text-sm text-muted">Loading…</p> : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No downloads yet" text="The Resources page lists the planned documents as “coming soon” until files are published." />}
            columns={[
              { key: "title", header: "Title", cell: (r) => <span className="font-semibold text-navy">{r.title}</span> },
              { key: "file", header: "File", cell: (r) => (r.file ? <a className="text-orange-700 underline" href={`${staffMediaUrl(r.file.id)}?download=1`}>{r.file.originalName}</a> : "—") },
              { key: "state", header: "Website", cell: (r) => (r.published ? <StateBadge state="PUBLISHED" label="Live" /> : <StateBadge state="DRAFT" />) },
              {
                key: "actions", header: "", cell: (r) => (
                  <div className="flex justify-end gap-2">
                    <button className={r.published ? "btn-ghost !px-3 !py-1.5" : "btn-navy !px-3 !py-1.5"} onClick={() => patch(r, { published: !r.published })}>{r.published ? "Unpublish" : "Publish"}</button>
                    <ConfirmButton className="btn-ghost !px-3 !py-1.5" onConfirm={() => remove(r)}><Trash2 className="h-4 w-4" aria-label="Delete" /></ConfirmButton>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* History & naming permission                                                */
/* ------------------------------------------------------------------------- */

const emptyEntry = {
  year: "", title: "", genericTitle: "", contractingCustomer: "", endClient: "", projectType: "", locations: "",
  operationalNotes: "", evidenceLevel: "end-client-project" as HistoryRow["evidenceLevel"], genericSummary: "",
};

function HistoryTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [editing, setEditing] = useState<HistoryRow | "new" | null>(null);
  const [form, setForm] = useState(emptyEntry);
  const [naming, setNaming] = useState<HistoryRow | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => api<{ entries: HistoryRow[] }>("/cms/history").then((r) => setRows(r.entries)).catch((e) => setMsg({ kind: "error", text: errorText(e) })), []);
  useEffect(() => { load(); }, [load]);

  const importBrief = async () => {
    try {
      const r = await api<{ created: number; total: number }>("/cms/history/import", { method: "POST", json: {} });
      setMsg({ kind: "ok", text: r.created ? `Imported ${r.created} entries from the History & Roadmap brief (shown with generic wording).` : "All brief entries are already imported." });
      load(); onChange();
    } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  const openEdit = (r: HistoryRow | "new") => {
    setEditing(r);
    setForm(r === "new" ? emptyEntry : {
      year: r.year, title: r.title, genericTitle: r.genericTitle, contractingCustomer: r.contractingCustomer ?? "", endClient: r.endClient ?? "",
      projectType: r.projectType ?? "", locations: r.locations.join(", "), operationalNotes: r.operationalNotes ?? "", evidenceLevel: r.evidenceLevel, genericSummary: r.genericSummary ?? "",
    });
  };

  const save = async () => {
    const body = { ...form, locations: form.locations.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      if (editing === "new") await api("/cms/history", { method: "POST", json: body });
      else if (editing) await api(`/cms/history/${editing.id}`, { method: "PATCH", json: body });
      setEditing(null); setMsg({ kind: "ok", text: "Entry saved." }); load(); onChange();
    } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  const setVisibility = async (r: HistoryRow, visibility: HistoryRow["visibility"], permissionNote?: string) => {
    try {
      await api(`/cms/history/${r.id}/visibility`, { method: "PUT", json: { visibility, permissionNote } });
      setNaming(null); setNote("");
      setMsg({ kind: "ok", text: visibility === "NAMED" ? "Names will now appear on the website (permission recorded)." : visibility === "GENERIC" ? "Shown with generic wording, no names." : "Hidden from the website." });
      load();
    } catch (e) { setMsg({ kind: "error", text: errorText(e) }); }
  };

  const sorted = useMemo(() => rows ?? [], [rows]);

  return (
    <Panel>
      <div className="mb-4 flex gap-3 rounded-xl bg-navy-50 p-4 text-sm text-navy">
        <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
        <p>
          Many projects were billed through partners. Show names only with written permission: <strong>Generic</strong> uses the no-names title and summary, <strong>Named</strong> shows the
          client and partner and requires a permission note. Contracting customers, end clients, locations and operational notes stay private otherwise.
        </p>
      </div>
      <Notice msg={msg} />
      <Toolbar>
        <button className="btn-ghost !py-2" onClick={importBrief}>Import from History brief</button>
        <button className="btn-primary ml-auto !py-2" onClick={() => openEdit("new")}><Plus className="h-4 w-4" aria-hidden /> Add entry</button>
      </Toolbar>
      {!rows ? <p className="text-sm text-muted">Loading…</p> : (
        <DataTable
          rows={sorted}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No history entries" text="Import the notable projects from the History & Roadmap brief to start." action={<button className="btn-primary" onClick={importBrief}>Import from brief</button>} />}
          columns={[
            { key: "year", header: "Year", cell: (r) => <span className="font-display font-bold text-orange-700">{r.year}</span> },
            { key: "title", header: "Record (private)", cell: (r) => (<div><p className="font-semibold text-navy">{r.title}</p><p className="text-xs text-muted">Public generic: {r.genericTitle || "—"}</p></div>) },
            { key: "evidence", header: "Evidence", cell: (r) => <span className="text-xs">{EVIDENCE_LABEL[r.evidenceLevel]}</span>, mobile: false },
            { key: "vis", header: "Website", cell: (r) => <StateBadge state={r.visibility} label={r.visibility === "NAMED" ? "Named" : r.visibility === "GENERIC" ? "Generic" : "Hidden"} /> },
            {
              key: "actions", header: "", cell: (r) => (
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button className="btn-ghost !px-3 !py-1.5" onClick={() => openEdit(r)}>Edit</button>
                  {r.visibility !== "HIDDEN" && <button className="btn-ghost !px-3 !py-1.5" onClick={() => setVisibility(r, "HIDDEN")}>Hide</button>}
                  {r.visibility !== "GENERIC" && <button className="btn-ghost !px-3 !py-1.5" onClick={() => setVisibility(r, "GENERIC")}>Generic</button>}
                  {r.visibility !== "NAMED" && <button className="btn-navy !px-3 !py-1.5" onClick={() => { setNaming(r); setNote(r.permissionNote); }}>Name…</button>}
                </div>
              ),
            },
          ]}
        />
      )}

      <Modal open={!!naming} onClose={() => setNaming(null)} title="Record naming permission"
        footer={<><button className="btn-ghost" onClick={() => setNaming(null)}>Cancel</button><button className="btn-primary" onClick={() => naming && setVisibility(naming, "NAMED", note)}>Show names on website</button></>}>
        <p className="text-sm text-slate-ink">
          <strong>{naming?.title}</strong> will appear by name{naming?.contractingCustomer ? `, supported through ${naming.contractingCustomer}` : ""}. Confirm you hold written permission from the client (and the partner where relevant).
        </p>
        <Field label="Permission note (required)" htmlFor="h-note" hint="Who approved, when and how, e.g. “Email approval from the client's communications director, 2026-10-12”.">
          <textarea id="h-note" rows={3} className={`${inputCls} mt-3`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>

      <Modal wide open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add history entry" : "Edit history entry"}
        footer={<><button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Year or period" htmlFor="h-year"><input id="h-year" className={inputCls} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="2019–2020" /></Field>
          <Field label="Evidence level" htmlFor="h-ev">
            <select id="h-ev" className={inputCls} value={form.evidenceLevel} onChange={(e) => setForm({ ...form, evidenceLevel: e.target.value as HistoryRow["evidenceLevel"] })}>
              {Object.entries(EVIDENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Named title (private until permission)" htmlFor="h-title"><input id="h-title" className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Generic public title (no names)" htmlFor="h-gen"><input id="h-gen" className={inputCls} value={form.genericTitle} onChange={(e) => setForm({ ...form, genericTitle: e.target.value })} placeholder="Touring-artist operations" /></Field>
          <Field label="Contracting customer (payer)" htmlFor="h-cc"><input id="h-cc" className={inputCls} value={form.contractingCustomer} onChange={(e) => setForm({ ...form, contractingCustomer: e.target.value })} /></Field>
          <Field label="End client / project" htmlFor="h-ec"><input id="h-ec" className={inputCls} value={form.endClient} onChange={(e) => setForm({ ...form, endClient: e.target.value })} /></Field>
          <Field label="Project type" htmlFor="h-type"><input id="h-type" className={inputCls} value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })} placeholder="Entertainment" /></Field>
          <Field label="Locations (comma separated, shown only when named)" htmlFor="h-loc"><input id="h-loc" className={inputCls} value={form.locations} onChange={(e) => setForm({ ...form, locations: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Public-safe summary (no names)" htmlFor="h-sum"><textarea id="h-sum" rows={3} className={inputCls} value={form.genericSummary} onChange={(e) => setForm({ ...form, genericSummary: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Operational notes (private)" htmlFor="h-notes"><textarea id="h-notes" rows={3} className={inputCls} value={form.operationalNotes} onChange={(e) => setForm({ ...form, operationalNotes: e.target.value })} /></Field></div>
        </div>
        {editing === "new" && <p className="mt-3 text-xs text-muted">New entries start hidden. Choose Generic or Named afterwards.</p>}
      </Modal>
    </Panel>
  );
}
