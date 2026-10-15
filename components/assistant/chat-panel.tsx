"use client";

/**
 * Website assistant chat panel (code-split; loaded on first open).
 * Accessible dialog: focus moves in on open and is contained, Esc closes, replies are announced politely
 * (aria-live), every control has a label. Desktop: floating card. Phones: full-screen sheet.
 * English + Spanish with a manual toggle (auto-detected from the customer's messages otherwise).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Headset, Phone, RotateCcw, X } from "lucide-react";
import { airports, contact, markets, ports, services } from "@/content/site";
import { resetSession, sendChat, sendHandoff, type Lang } from "./client";

type Msg = { id: string; role: "user" | "assistant"; text: string; links?: string[]; pending?: boolean; error?: boolean };

const COPY = {
  en: {
    title: "Express Bags assistant",
    sub: "Automated help. Pricing and timing are confirmed by our dispatch team.",
    hello: "Hi, I can explain our services and Florida service areas, start a quote, or help you track a delivery. What do you need moved?",
    placeholder: "Type your question…",
    send: "Send",
    human: "Talk to a person",
    restart: "Start over",
    suggestions: ["Get a quote for hotel to cruise port", "Do you cover Key West?", "Track my delivery"],
    handoffTitle: "Talk to a person",
    handoffIntro: `Call our office at ${contact.phoneDisplay}, or leave your details and a coordinator will contact you.`,
    name: "Your name",
    phone: "Phone",
    email: "Email",
    need: "What do you need?",
    submit: "Send to the team",
    sent: "Thanks. A coordinator will contact you soon. For anything urgent, call",
    cancel: "Back to chat",
    error: "Sorry, something went wrong. Please try again or call",
    linkLabels: { "/request-a-quote": "Open the quote form", "/track": "Track a delivery" } as Record<string, string>,
  },
  es: {
    title: "Asistente de Express Bags",
    sub: "Ayuda automatizada. Precios y horarios los confirma nuestro equipo de despacho.",
    hello: "Hola, puedo explicarle nuestros servicios y zonas de Florida, iniciar una cotización o ayudarle a rastrear una entrega. ¿Qué necesita trasladar?",
    placeholder: "Escriba su pregunta…",
    send: "Enviar",
    human: "Hablar con una persona",
    restart: "Empezar de nuevo",
    suggestions: ["¿Llevan maletas al aeropuerto?", "Cotizar del hotel al crucero", "Rastrear mi entrega"],
    handoffTitle: "Hablar con una persona",
    handoffIntro: `Llame a nuestra oficina al ${contact.phoneDisplay} o deje sus datos y un coordinador le contactará.`,
    name: "Su nombre",
    phone: "Teléfono",
    email: "Correo",
    need: "¿Qué necesita?",
    submit: "Enviar al equipo",
    sent: "Gracias. Un coordinador le contactará pronto. Para algo urgente, llame al",
    cancel: "Volver al chat",
    error: "Lo sentimos, algo salió mal. Intente de nuevo o llame al",
    linkLabels: { "/request-a-quote": "Abrir el formulario de cotización", "/track": "Rastrear una entrega" } as Record<string, string>,
  },
};

const STORE = "eb-assistant-transcript-v1";
const uid = () => Math.random().toString(36).slice(2, 10);

/** Friendly button text for an internal path, using the site's own page names. */
function linkLabel(href: string, lang: Lang) {
  if (href.startsWith("/request-a-quote?draft=")) return lang === "es" ? "Abrir mi cotización preparada" : "Open my prefilled quote";
  if (COPY[lang].linkLabels[href]) return COPY[lang].linkLabels[href];
  const [, section, slug] = href.split(/[/#?]/);
  const name =
    (section === "services" && services.find((s) => s.slug === slug)?.name) ||
    (section === "service-areas" && markets.find((m) => m.slug === slug)?.name) ||
    (section === "airports" && airports.find((a) => a.slug === slug)?.name) ||
    (section === "ports" && ports.find((p) => p.slug === slug)?.name) ||
    ({ "service-areas": lang === "es" ? "Zonas de servicio" : "Service areas", services: lang === "es" ? "Servicios" : "Services", faq: lang === "es" ? "Preguntas frecuentes" : "FAQ", "business-accounts": lang === "es" ? "Cuentas empresariales" : "Business accounts", contact: lang === "es" ? "Contacto" : "Contact", terms: lang === "es" ? "Artículos prohibidos" : "Prohibited items", fleet: lang === "es" ? "Flota" : "Fleet", about: lang === "es" ? "Sobre nosotros" : "About us", account: lang === "es" ? "Portal de clientes" : "Client portal" } as Record<string, string>)[section];
  return name ? `${lang === "es" ? "Ver" : "View"} ${name}` : href;
}

/** Renders text, turning internal paths (/request-a-quote, /track, …) into links. Never renders HTML. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/((?<![\w.])\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)(?:\?draft=[A-Za-z0-9]+)?(?:#[a-z-]+)?)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\/[a-z0-9]/.test(p) ? (
          <Link key={i} href={p} className="font-semibold text-orange-700 underline underline-offset-2">
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lang, setLang] = useState<Lang>("en");
  const [langLocked, setLangLocked] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chat" | "handoff" | "handoff-sent">("chat");
  const dialog = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const t = COPY[lang];

  // Restore this tab's transcript (sessionStorage; harmless if unavailable)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) {
        const saved = JSON.parse(raw) as { lang: Lang; messages: Msg[] };
        setMessages(saved.messages.filter((m) => !m.pending));
        setLang(saved.lang);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ lang, messages: messages.filter((m) => !m.pending).slice(-40) }));
    } catch {
      /* ignore */
    }
  }, [messages, lang]);

  // Focus management + Esc
  useEffect(() => {
    if (!open) return;
    const t0 = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const f = dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea, input, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // Lock page scroll behind the full-screen sheet on phones
    const prev = document.body.style.overflow;
    if (window.matchMedia("(max-width: 639px)").matches) document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t0);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages, view]);

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      setBusy(true);
      const replyId = uid();
      setMessages((m) => [...m, { id: uid(), role: "user", text: q }, { id: replyId, role: "assistant", text: "", pending: true }]);
      abort.current = new AbortController();
      try {
        const r = await sendChat(
          q,
          langLocked ? lang : "auto",
          (delta) => setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text: x.text + delta } : x))),
          abort.current.signal,
        );
        if (!langLocked) setLang(r.lang);
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text: r.reply, links: r.links, pending: false } : x)));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text: `${(e as Error).message || t.error} ${contact.phoneDisplay}`, pending: false, error: true } : x)));
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, lang, langLocked, t.error],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  const restart = () => {
    abort.current?.abort();
    resetSession();
    setMessages([]);
    setView("chat");
    setBusy(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] sm:inset-auto sm:bottom-6 sm:right-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eb-assistant-title"
        lang={lang}
        data-testid="assistant-panel"
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-[0_30px_80px_-20px_rgb(0_20_45/0.55)] ring-1 ring-navy/10 motion-safe:animate-[ebFadeUp_.18s_ease-out] sm:h-[min(640px,calc(100dvh-3rem))] sm:w-[400px] sm:rounded-[1.75rem]"
      >
        <style>{`@keyframes ebFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>
        {/* Header */}
        <div className="relative overflow-hidden bg-navy px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
          <div aria-hidden className="absolute -right-16 -top-16 h-44 w-44 rounded-full border-[3px] border-orange/60" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h2 id="eb-assistant-title" className="font-display text-lg font-bold text-white">{t.title}</h2>
              <p className="mt-0.5 text-xs leading-snug text-white/70">{t.sub}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div role="group" aria-label="Language / Idioma" className="flex rounded-full bg-white/10 p-0.5 text-xs font-semibold">
                {(["en", "es"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    onClick={() => {
                      setLang(l);
                      setLangLocked(true);
                    }}
                    className={`rounded-full px-2.5 py-1 transition ${lang === l ? "bg-white text-navy" : "text-white/80 hover:text-white"}`}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <button type="button" onClick={onClose} aria-label={lang === "es" ? "Cerrar chat" : "Close chat"} className="rounded-full p-2 text-white/85 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-cloud px-4 py-4" aria-live="polite" aria-relevant="additions text" aria-busy={busy}>
          <Bubble role="assistant">{t.hello}</Bubble>
          {messages.map((m) => (
            <div key={m.id}>
              <Bubble role={m.role} error={m.error}>
                {m.pending && !m.text ? <TypingDots label={lang === "es" ? "Escribiendo" : "Typing"} /> : <RichText text={m.text} />}
              </Bubble>
              {!!m.links?.length && (
                <div className="mt-2 flex flex-wrap gap-2 pl-1">
                  {m.links.map((href) => (
                    <Link key={href} href={href} onClick={onClose} className="rounded-full border border-orange/40 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50">
                      {linkLabel(href, lang)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {messages.length === 0 && view === "chat" && (
            <div className="flex flex-wrap gap-2 pt-1">
              {t.suggestions.map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)} className="rounded-full border border-navy/15 bg-white px-3 py-1.5 text-left text-xs font-medium text-navy hover:border-navy/40">
                  {s}
                </button>
              ))}
            </div>
          )}

          {view !== "chat" && <HandoffForm lang={lang} sent={view === "handoff-sent"} onSent={() => setView("handoff-sent")} onCancel={() => setView("chat")} />}
        </div>

        {/* Composer */}
        <div className="border-t border-line bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <button type="button" onClick={() => setView("handoff")} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-navy hover:bg-navy-50">
              <Headset className="h-3.5 w-3.5" aria-hidden /> {t.human}
            </button>
            <div className="flex items-center gap-1">
              <a href={contact.phoneHref} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-ink hover:bg-cloud">
                <Phone className="h-3.5 w-3.5" aria-hidden /> {contact.phoneDisplay}
              </a>
              {messages.length > 0 && (
                <button type="button" onClick={restart} aria-label={t.restart} title={t.restart} className="rounded-full p-1.5 text-muted hover:bg-cloud">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <label htmlFor="eb-assistant-input" className="sr-only">{t.placeholder}</label>
            <textarea
              id="eb-assistant-input"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={1500}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t.placeholder}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-cloud px-4 py-3 text-[15px] text-charcoal outline-none placeholder:text-muted focus:border-navy focus:bg-white focus:ring-2 focus:ring-navy/15"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label={t.send} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange text-white transition hover:bg-orange-600 disabled:opacity-40">
              <ArrowUp className="h-5 w-5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children, error }: { role: "user" | "assistant"; children: React.ReactNode; error?: boolean }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed ${
          mine ? "rounded-br-md bg-navy text-white" : error ? "rounded-bl-md border border-rose-200 bg-rose-50 text-rose-900" : "rounded-bl-md bg-white text-charcoal shadow-[0_1px_2px_rgb(0_40_88/0.08)]"
        }`}
      >
        <span className="sr-only">{mine ? "You: " : "Assistant: "}</span>
        {children}
      </div>
    </div>
  );
}

function TypingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 py-1" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-navy/40 motion-safe:animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

function HandoffForm({ lang, sent, onSent, onCancel }: { lang: Lang; sent: boolean; onSent: () => void; onCancel: () => void }) {
  const t = COPY[lang];
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        {t.sent} <a className="font-semibold underline" href={contact.phoneHref}>{contact.phoneDisplay}</a>.
        <button type="button" onClick={onCancel} className="mt-3 block text-xs font-semibold text-navy underline">{t.cancel}</button>
      </div>
    );
  }
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSending(true);
    setError(null);
    try {
      await sendHandoff({ name: String(f.get("name") || ""), phone: String(f.get("phone") || ""), email: String(f.get("email") || ""), message: String(f.get("message") || ""), website: String(f.get("website") || "") });
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15";
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-2xl border border-line bg-white p-4" aria-labelledby="eb-handoff-title" data-testid="assistant-handoff">
      <p id="eb-handoff-title" className="font-display text-sm font-bold text-navy">{t.handoffTitle}</p>
      <p className="text-xs text-slate-ink">{t.handoffIntro}</p>
      <label className="block text-xs font-medium text-navy">{t.name}<input name="name" required maxLength={120} autoComplete="name" className={`${field} mt-1`} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-navy">{t.phone}<input name="phone" type="tel" maxLength={40} autoComplete="tel" className={`${field} mt-1`} /></label>
        <label className="block text-xs font-medium text-navy">{t.email}<input name="email" type="email" maxLength={200} autoComplete="email" className={`${field} mt-1`} /></label>
      </div>
      <label className="block text-xs font-medium text-navy">{t.need}<textarea name="message" required maxLength={2000} rows={3} className={`${field} mt-1`} /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {error && <p className="text-xs font-medium text-rose-700" role="alert">{error}</p>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-ink underline">{t.cancel}</button>
        <button type="submit" disabled={sending} className="btn-primary !px-4 !py-2 text-xs">{t.submit}</button>
      </div>
    </form>
  );
}
