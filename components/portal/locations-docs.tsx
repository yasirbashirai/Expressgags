"use client";

/** Saved locations (personal + shared company locations) and the document library. */
import { useEffect, useState, type FormEvent } from "react";
import { Building, Download, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { airports, ports } from "@/content/site";
import { LOCATION_TYPES } from "@/lib/quote-schema";
import { MARKET_LABELS } from "./labels";
import { dateOnly, fileUrl, portal, PortalError } from "./api";
import { useMe } from "./portal-shell";
import { Alert, aria, Card, Empty, Field, input, Loading, PageTitle, SubmitButton } from "./ui";

type Address = { id: string; label: string; type: string; address: string; facility: string | null; market: string; contactName: string | null; contactPhone: string | null; notes: string | null; shared: boolean; editable: boolean };

const TYPE_LABEL: Record<string, string> = { hotel: "Hotel / resort", airport: "Airport", "cruise-port": "Cruise port", residence: "Residence", business: "Business", venue: "Venue", "private-aviation": "Private aviation", storage: "Storage", other: "Other" };

export function AddressesPage() {
  const { me } = useMe();
  const canShare = !!me.company && (me.accountRole === "COMPANY_ADMIN" || me.accountRole === "CONCIERGE");
  const [rows, setRows] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => portal<{ addresses: Address[] }>("/addresses").then((r) => setRows(r.addresses)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const remove = async (a: Address) => {
    if (!window.confirm(`Remove “${a.label}”?`)) return;
    await portal(`/addresses/${a.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    load();
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Saved locations" sub="Hotels, airports, ports and addresses you use often. They speed up every request." actions={<button onClick={() => setEditing("new")} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Add location</button>} />
      {error && <Alert>{error}</Alert>}
      {editing && <AddressForm initial={editing === "new" ? null : editing} canShare={canShare} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
      {!rows && <Loading />}
      {rows && rows.length === 0 && !editing && <Empty title="No saved locations yet" text="Add the hotels, ports and addresses you book most." />}
      {rows && rows.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-[1.25rem] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-navy"><MapPin className="h-4 w-4 shrink-0 text-orange" aria-hidden /> {a.label}</p>
                  <p className="mt-1 text-sm text-charcoal">{a.address}</p>
                  <p className="mt-1 text-xs text-muted">{TYPE_LABEL[a.type] ?? a.type} · {MARKET_LABELS[a.market] ?? a.market}{a.shared ? " · shared with your company" : ""}</p>
                  {a.contactName && <p className="mt-1 text-xs text-muted">Contact: {a.contactName}{a.contactPhone ? `, ${a.contactPhone}` : ""}</p>}
                </div>
                {a.shared ? <Users className="h-4 w-4 shrink-0 text-muted" aria-label="Shared company location" /> : <Building className="h-4 w-4 shrink-0 text-transparent" aria-hidden />}
              </div>
              {a.editable && (
                <div className="mt-4 flex gap-2">
                  <button onClick={() => setEditing(a)} className="btn-ghost !px-3 !py-1.5 !text-xs"><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
                  <button onClick={() => remove(a)} className="btn-ghost !px-3 !py-1.5 !text-xs"><Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddressForm({ initial, canShare, onDone, onCancel }: { initial: Address | null; canShare: boolean; onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [type, setType] = useState(initial?.type ?? "hotel");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const facility = String(fd.get("facility") ?? "");
    let address = String(fd.get("address") ?? "");
    let market = String(fd.get("market") ?? "");
    if (type === "airport" && facility) { const a = airports.find((x) => x.code === facility); address ||= `${a?.name} (${facility})`; market ||= a?.market ?? ""; }
    if (type === "cruise-port" && facility) { const p = ports.find((x) => x.slug === facility); address ||= p?.name ?? ""; market ||= p?.market ?? ""; }
    const body = { label: fd.get("label"), type, address, facility, market, contactName: fd.get("contactName"), contactPhone: fd.get("contactPhone"), notes: fd.get("notes"), ...(initial ? {} : { shared: fd.get("shared") === "on" }) };
    setBusy(true);
    setError(null);
    try {
      await portal(initial ? `/addresses/${initial.id}` : "/addresses", { method: initial ? "PATCH" : "POST", json: body });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof PortalError) setFields(err.fields);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={initial ? "Edit location" : "New location"}>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
        {error && <div className="md:col-span-2"><Alert>{error}</Alert></div>}
        <Field id="label" label="Name" error={fields.label}><input {...aria("label", fields.label)} defaultValue={initial?.label} placeholder="e.g. Main lobby, Brickell office" required className={input} /></Field>
        <Field id="type" label="Type">
          <select {...aria("type")} value={type} onChange={(e) => setType(e.target.value)} className={input}>
            {LOCATION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        {(type === "airport" || type === "cruise-port") && (
          <Field id="facility" label={type === "airport" ? "Airport" : "Cruise port"}>
            <select {...aria("facility")} defaultValue={initial?.facility ?? ""} className={input}>
              <option value="">Choose…</option>
              {type === "airport" ? airports.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>) : ports.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field id="address" label="Address" error={fields.address} optional={type === "airport" || type === "cruise-port"}><input {...aria("address", fields.address)} defaultValue={initial?.address} className={input} /></Field>
        <Field id="market" label="Market" error={fields.market}>
          <select {...aria("market", fields.market)} defaultValue={initial?.market ?? ""} className={input}>
            <option value="">{type === "airport" || type === "cruise-port" ? "Same as the airport/port" : "Choose…"}</option>
            {Object.entries(MARKET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field id="contactName" label="On-site contact" optional><input {...aria("contactName")} defaultValue={initial?.contactName ?? ""} className={input} /></Field>
        <Field id="contactPhone" label="Contact phone" optional><input {...aria("contactPhone")} type="tel" defaultValue={initial?.contactPhone ?? ""} className={input} /></Field>
        <div className="md:col-span-2"><Field id="notes" label="Access notes" optional hint="Loading dock, bell desk, parking, gate codes shared with dispatch"><textarea {...aria("notes", undefined, "hint")} rows={2} defaultValue={initial?.notes ?? ""} className={input} /></Field></div>
        {canShare && !initial && (
          <label className="flex items-center gap-3 text-sm text-slate-ink md:col-span-2"><input type="checkbox" name="shared" className="h-4 w-4 accent-[#E06010]" /> Share with everyone on our company account</label>
        )}
        <div className="flex gap-2 md:col-span-2">
          <SubmitButton busy={busy}>{initial ? "Save changes" : "Save location"}</SubmitButton>
          <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------- Documents ------------------------------- */
type Doc = { id: string; title: string; orderId: string | null; orderReference: string | null; createdAt: string; customer: { name: string } };

export function DocumentsPage() {
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => portal<{ documents: Doc[] }>("/documents").then((r) => setRows(r.documents)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const upload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMsg(null);
    try {
      await portal("/documents", { method: "POST", body: new FormData(form) });
      form.reset();
      setMsg("Document uploaded.");
      load();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageTitle title="Documents" sub="Manifests, rooming lists, certificates and anything our team should have on file. Visible only to you and authorized people on your account." />
      <Card title="Upload a document">
        <form onSubmit={upload} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-semibold text-navy">Title</label>
            <input id="title" name="title" placeholder="e.g. Rooming list, March group" className={input} />
          </div>
          <div>
            <label htmlFor="file" className="mb-1.5 block text-sm font-semibold text-navy">File (PDF, image, Word, Excel, CSV · max 10 MB)</label>
            <input id="file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv" className="block w-full text-sm text-slate-ink file:mr-3 file:rounded-full file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
          </div>
          <SubmitButton busy={busy} className="btn-navy">Upload</SubmitButton>
        </form>
        {msg && <p className="mt-3 text-sm text-slate-ink" role="status">{msg}</p>}
      </Card>
      {error && <Alert>{error}</Alert>}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <Empty title="No documents yet" />}
      {rows && rows.length > 0 && (
        <Card title="Your documents">
          <ul className="divide-y divide-line text-sm">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="font-semibold text-navy">{d.title}</span>
                  <span className="block text-xs text-muted">{dateOnly(d.createdAt)} · {d.customer.name}{d.orderReference ? ` · order ${d.orderReference}` : ""}</span>
                </span>
                <a href={fileUrl(`/documents/${d.id}/file`)} className="inline-flex items-center gap-1 font-semibold text-orange-700 hover:underline"><Download className="h-4 w-4" aria-hidden /> Download</a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
