import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { ComingSoon } from "@/components/company/blocks";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Client Login | Express Bags, Inc.",
  description: "The Express Bags client portal for quote and booking history, repeat bookings, invoices, receipts and proof of delivery is coming soon.",
  path: "/client-login",
  noindex: true,
});

const FEATURES = ["Quote and booking history", "Repeat a previous booking", "Upload documents and manifests", "Download invoices and receipts", "Download proof of delivery", "Live delivery tracking", "Saved locations and authorized users", "Profile and account management"];

export default function ClientLoginPage() {
  return (
    <>
      <PageHero
        eyebrow="Client portal"
        title="Your account, in one secure place."
        lead="Our client portal for hotels, DMCs, corporate accounts and repeat customers is being built and will open to existing clients first."
        crumbs={[{ name: "Home", path: "/" }, { name: "Client Login", path: "/client-login" }]}
        primaryCta={null}
      />
      <Section>
        <ComingSoon Icon={LockKeyhole} title="The client portal is coming soon" text="When it opens, approved account holders will be able to:">
          <ul className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (<li key={f} className="flex gap-2 text-sm text-slate-ink"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />{f}</li>))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/request-a-quote?type=business" className="btn-primary">Request a business account</Link>
            <Link href="/business-accounts" className="btn-ghost">About business accounts</Link>
          </div>
        </ComingSoon>
      </Section>
    </>
  );
}
