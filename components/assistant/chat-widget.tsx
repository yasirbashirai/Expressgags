"use client";

/**
 * Website assistant launcher (mounted once in the public layout via SiteExtras).
 * Lightweight on purpose: the chat panel itself is code-split and only loaded on first open,
 * and the config check waits for browser idle time so it never competes with page rendering.
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ASSISTANT_API } from "./client";

const ChatPanel = dynamic(() => import("./chat-panel").then((m) => m.ChatPanel), { ssr: false });

export function ChatWidget() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetch(`${ASSISTANT_API}/config`)
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => !cancelled && setEnabled(!!c?.enabled))
        .catch(() => undefined);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(check, { timeout: 4000 });
    else setTimeout(check, 1500);
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link: any element with href="#assistant" (or ?assistant=open) opens the chat
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href="#assistant"]');
      if (a) {
        e.preventDefault();
        setLoaded(true);
        setOpen(true);
      }
    };
    document.addEventListener("click", onClick);
    if (new URLSearchParams(window.location.search).get("assistant") === "open") {
      setLoaded(true);
      setOpen(true);
    }
    return () => document.removeEventListener("click", onClick);
  }, []);

  // While the cookie-consent banner is open, step aside (it sits in the same corner on phones)
  const [consentOpen, setConsentOpen] = useState(false);
  useEffect(() => {
    const check = () => setConsentOpen(!!document.querySelector('[data-testid="consent-banner"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }, []);

  if (!enabled) return null;
  // The quote wizard has a sticky action bar on phones: lift the launcher above it there
  const onQuote = pathname?.startsWith("/request-a-quote");

  return (
    <>
      {!open && !consentOpen && (
        <button
          ref={launcher}
          type="button"
          onMouseEnter={() => setLoaded(true)}
          onFocus={() => setLoaded(true)}
          onClick={() => {
            setLoaded(true);
            setOpen(true);
          }}
          aria-haspopup="dialog"
          aria-label="Open the Express Bags assistant chat"
          data-testid="assistant-launcher"
          className={`fixed right-4 z-[60] inline-flex items-center gap-2 rounded-full bg-navy py-3 pl-3.5 pr-4 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgb(0_20_45/0.65)] ring-1 ring-white/10 transition hover:bg-navy-700 motion-safe:hover:-translate-y-0.5 sm:right-6 ${onQuote ? "bottom-24 sm:bottom-6" : "bottom-4 sm:bottom-6"}`}
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange">
            <MessageCircle className="h-4 w-4" aria-hidden />
            <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-navy bg-emerald-400" />
          </span>
          <span className="hidden sm:inline">Ask Express Bags</span>
          <span className="sm:hidden">Chat</span>
        </button>
      )}
      {loaded && <ChatPanel open={open} onClose={close} />}
    </>
  );
}
