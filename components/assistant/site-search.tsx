"use client";

/**
 * Site search box (AI search over approved public content via /v1/assistant/search).
 * Exported for the header (CREATIVE agent places it). Accessible combobox-style list, debounced,
 * keyboard navigable, and offers "Ask the assistant" as the last option.
 *
 * Usage: <SiteSearch /> (default compact) or <SiteSearch variant="hero" />
 */
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { searchSite, type SearchResult } from "./client";

export function SiteSearch({ variant = "compact", placeholder = "Search services, airports, ports…" }: { variant?: "compact" | "hero"; placeholder?: string }) {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => searchSite(q, ctrl.signal).then((r) => setResults(r.slice(0, 6))).catch(() => undefined), 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (url: string) => {
    setOpen(false);
    setQ("");
    router.push(url);
  };
  const askAssistant = () => {
    setOpen(false);
    const a = document.createElement("a");
    a.href = "#assistant";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const options = [...results.map((r) => ({ key: r.url + r.title, label: r.title, sub: r.snippet, run: () => go(r.url) })), ...(q.trim().length >= 2 ? [{ key: "ask", label: `Ask the assistant: “${q.trim()}”`, sub: "", run: askAssistant }] : [])];

  return (
    <div ref={box} className={`relative ${variant === "hero" ? "w-full max-w-xl" : "w-full max-w-xs"}`}>
      <label htmlFor={`${id}-q`} className="sr-only">Search Express Bags</label>
      <div className={`flex items-center gap-2 rounded-full border border-line bg-white px-3.5 ${variant === "hero" ? "py-3 shadow-[var(--shadow-card)]" : "py-2"}`}>
        <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          id={`${id}-q`}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && options.length) {
              e.preventDefault();
              options[Math.max(active, 0)].run();
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="w-full bg-transparent text-sm text-charcoal outline-none placeholder:text-muted"
        />
      </div>
      {open && options.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
          {options.map((o, i) => (
            <li key={o.key} id={`${id}-opt-${i}`} role="option" aria-selected={active === i}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={o.run} className={`w-full rounded-xl px-3 py-2 text-left ${active === i ? "bg-navy-50" : ""}`}>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-navy">
                  {o.key === "ask" && <Sparkles className="h-3.5 w-3.5 text-orange" aria-hidden />}
                  {o.label}
                </span>
                {o.sub && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-ink">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
