import Link from "next/link";
import { Phone } from "lucide-react";
import { contact } from "@/content/site";

/** Orange call-to-action band used near the bottom of content pages. */
export function CtaBand({ title = "Have something to move?", text = "Share the route, date and item count. Our dispatch team confirms vehicle, labor, timing and access, then sends a written quotation." }: { title?: string; text?: string }) {
  return (
    <section className="bg-white py-16">
      <div className="container-eb">
        <div className="relative overflow-hidden rounded-[2rem] bg-orange px-6 py-12 text-white md:px-14">
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[18px] border-white/15" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold text-white">{title}</h2>
              <p className="mt-3 text-white/90">{text}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/request-a-quote" className="btn bg-white text-navy hover:bg-navy-50">Request a Quote</Link>
              <a href={contact.phoneHref} className="btn-ghost-light"><Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
