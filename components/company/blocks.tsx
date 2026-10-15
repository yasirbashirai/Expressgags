import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Clock, MapPin, Phone } from "lucide-react";
import { contact } from "@/content/site";

/** A "coming soon / activates later" card used by placeholder features (tracking, portal, downloads). */
export function ComingSoon({ Icon, title, text, children }: { Icon: LucideIcon; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="card relative overflow-hidden p-8 md:p-10">
      <div aria-hidden className="absolute -right-16 -top-16 h-52 w-52 rounded-full border-[16px] border-orange/15" />
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700"><Icon className="h-6 w-6" aria-hidden /></span>
      <h2 className="mt-6 text-2xl font-bold">{title}</h2>
      <p className="mt-3 max-w-xl leading-relaxed text-slate-ink">{text}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

/** Public contact details card (P.O. Box + office phone + hours only). */
export function ContactCard({ dark = false }: { dark?: boolean }) {
  const muted = dark ? "text-white/70" : "text-slate-ink";
  return (
    <div className={`rounded-[var(--radius-card)] p-7 ${dark ? "bg-navy text-white" : "card"}`}>
      <h2 className={`text-xl font-bold ${dark ? "text-white" : ""}`}>Express Bags, Inc.</h2>
      <ul className="mt-5 space-y-4 text-sm">
        <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
          <span><span className={`block text-xs uppercase tracking-wide ${muted}`}>Office</span><a href={contact.phoneHref} className="font-semibold hover:underline">{contact.phoneDisplay}</a></span></li>
        <li className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
          <span><span className={`block text-xs uppercase tracking-wide ${muted}`}>Mailing address</span>{contact.addressLine}<span className={`block ${muted}`}>{contact.visits}</span></span></li>
        <li className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange" aria-hidden />
          <span><span className={`block text-xs uppercase tracking-wide ${muted}`}>Office hours</span>{contact.hours.map((h) => (<span key={h.days} className="block">{h.days}: {h.time}</span>))}</span></li>
        {contact.emailLive && (
          <li><a href={`mailto:${contact.email}`} className="font-semibold hover:underline">{contact.email}</a></li>
        )}
      </ul>
    </div>
  );
}

/** Wrapper for legal/policy documents with a draft notice and a table of contents. */
export function LegalDoc({ updated, sections }: { updated: string; sections: { id: string; title: string; body: ReactNode }[] }) {
  return (
    <div className="container-eb grid gap-12 py-16 lg:grid-cols-12 md:py-20">
      <aside className="lg:col-span-3">
        <div className="lg:sticky lg:top-32">
          <p className="rounded-xl bg-orange-50 px-4 py-3 text-xs text-orange-700">Draft for owner and legal review. Last updated {updated}.</p>
          <nav aria-label="On this page" className="mt-6 hidden lg:block">
            <ul className="space-y-2 text-sm">
              {sections.map((s) => (<li key={s.id}><a href={`#${s.id}`} className="text-slate-ink hover:text-orange-700">{s.title}</a></li>))}
            </ul>
          </nav>
        </div>
      </aside>
      <article className="prose-eb max-w-3xl lg:col-span-9">
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-32">
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
        <p className="mt-10 text-sm">Questions about this document? Call our office at <a href={contact.phoneHref}>{contact.phoneDisplay}</a> or write to {contact.addressLine}. <Link href="/contact">Contact us</Link>.</p>
      </article>
    </div>
  );
}
