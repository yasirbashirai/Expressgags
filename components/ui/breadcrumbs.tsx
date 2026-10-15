import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "./json-ld";
import { breadcrumbSchema } from "@/lib/seo";

/** Visible breadcrumb trail + BreadcrumbList schema. First item should be Home. */
export function Breadcrumbs({ items, light = false }: { items: { name: string; path: string }[]; light?: boolean }) {
  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className={`flex flex-wrap items-center gap-1 text-xs ${light ? "text-white/70" : "text-muted"}`}>
          {items.map((it, i) => (
            <li key={it.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />}
              {i === items.length - 1 ? (
                <span aria-current="page" className={light ? "text-white" : "text-navy"}>{it.name}</span>
              ) : (
                <Link href={it.path} className="hover:underline">{it.name}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={breadcrumbSchema(items)} />
    </>
  );
}
