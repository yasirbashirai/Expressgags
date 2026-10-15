"use client";

/**
 * Cookie consent + analytics/advertising tags + campaign attribution.
 *
 *  - Granular consent: necessary (always), analytics, marketing. Stored in localStorage + a first-party cookie.
 *  - Google Consent Mode v2 defaults are set to "denied" in-page (no network). GA4, Google Ads and the
 *    Meta Pixel scripts are requested ONLY after the visitor grants the matching category.
 *  - Campaign attribution (UTM, referrer, landing page) is kept for the session; it is stored across
 *    visits only with analytics or marketing consent. Ad click IDs (gclid/fbclid) need marketing consent.
 *  - Conversions: listens for `eb:quote-submitted` and `eb:booking-completed` window events, fires the
 *    consented tags, then POSTs attribution to /v1/attribution (server stores it with the quote).
 *  - Reopen: link to `#cookie-settings` or call `window.ebOpenConsent()`.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cookie } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
const CONSENT_KEY = "eb-consent-v1";
const ATTR_KEY = "eb-attr-v1";
const CLICK_KEY = "eb-clicks-v1";

export type Consent = { analytics: boolean; marketing: boolean; at: string; v: 1 };
type Touch = { source?: string; medium?: string; campaign?: string; term?: string; content?: string; landingPage?: string; referrer?: string; gclid?: string; fbclid?: string; at?: string };
type TagConfig = { ga4Id: string | null; googleAdsId: string | null; googleAdsQuoteLabel: string | null; googleAdsBookingLabel: string | null; metaPixelId: string | null };

type GtagFn = (...args: unknown[]) => void;
type FbqFn = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
    fbq?: FbqFn;
    _fbq?: FbqFn;
    ebOpenConsent?: () => void;
  }
}

/* ---------------- storage helpers (never throw) ---------------- */
const read = <T,>(store: "local" | "session", key: string): T | null => {
  try {
    const raw = (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (store: "local" | "session", key: string, value: unknown) => {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / blocked storage: degrade silently */
  }
};
const remove = (store: "local" | "session", key: string) => {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).removeItem(key);
  } catch {
    /* ignore */
  }
};
const cookie = (name: string) => document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=")[1];

export function readConsent(): Consent | null {
  const c = read<Consent>("local", CONSENT_KEY);
  return c && c.v === 1 ? c : null;
}

function saveConsent(analytics: boolean, marketing: boolean): Consent {
  const c: Consent = { analytics, marketing, at: new Date().toISOString(), v: 1 };
  write("local", CONSENT_KEY, c);
  document.cookie = `eb_consent=a${analytics ? 1 : 0}m${marketing ? 1 : 0}; Max-Age=${60 * 60 * 24 * 180}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return c;
}

/* ---------------- attribution capture ---------------- */
function captureTouch(): { touch: Touch | null; clicks: { gclid?: string; fbclid?: string } } {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  const get = (k: string) => p.get(k)?.slice(0, 200) || undefined;
  const ref = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer.slice(0, 500) : undefined;
  const touch: Touch = { source: get("utm_source"), medium: get("utm_medium"), campaign: get("utm_campaign"), term: get("utm_term"), content: get("utm_content") };
  const clicks = { gclid: get("gclid"), fbclid: get("fbclid") };
  const hasCampaign = Object.values(touch).some(Boolean) || clicks.gclid || clicks.fbclid || ref;
  if (!hasCampaign) return { touch: null, clicks };
  if (!touch.source && clicks.gclid) Object.assign(touch, { source: "google", medium: "cpc" });
  if (!touch.source && clicks.fbclid) Object.assign(touch, { source: "facebook", medium: "paid-social" });
  if (!touch.source && ref) Object.assign(touch, { source: new URL(ref).hostname.replace(/^www\./, ""), medium: "referral" });
  return { touch: { ...touch, landingPage: url.pathname.slice(0, 200), referrer: ref, at: new Date().toISOString() }, clicks };
}

/** First/last touch: session always; persistent only with consent. */
function storeTouch(touch: Touch, consent: Consent | null) {
  const persist = !!consent && (consent.analytics || consent.marketing);
  const cur = read<{ first?: Touch; last?: Touch }>("session", ATTR_KEY) ?? (persist ? read<{ first?: Touch; last?: Touch }>("local", ATTR_KEY) : null) ?? {};
  const next = { first: cur.first ?? touch, last: touch };
  write("session", ATTR_KEY, next);
  if (persist) write("local", ATTR_KEY, next);
}

function currentAttribution(consent: Consent | null) {
  const a = read<{ first?: Touch; last?: Touch }>("session", ATTR_KEY) ?? read<{ first?: Touch; last?: Touch }>("local", ATTR_KEY) ?? {};
  const clicks = consent?.marketing ? read<{ gclid?: string; fbclid?: string }>("session", CLICK_KEY) ?? read<{ gclid?: string; fbclid?: string }>("local", CLICK_KEY) ?? {} : {};
  const withClicks = (t?: Touch) => (t ? { ...t, ...(consent?.marketing ? clicks : { gclid: undefined, fbclid: undefined }) } : undefined);
  const strip = (t?: Touch) => (t ? Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== "")) : undefined);
  return { first: strip(withClicks(a.first)), last: strip(withClicks(a.last)) };
}

/* ---------------- tag loading ---------------- */
function loadScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", wait_for_update: 500 });
  }
}

function applyTags(consent: Consent, cfg: TagConfig, loaded: Set<string>) {
  ensureGtagStub();
  window.gtag!("consent", "update", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
  });
  const gaOn = consent.analytics && cfg.ga4Id;
  const adsOn = consent.marketing && cfg.googleAdsId;
  if ((gaOn || adsOn) && !loaded.has("gtag")) {
    loaded.add("gtag");
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent((gaOn ? cfg.ga4Id : cfg.googleAdsId)!)}`, "eb-gtag");
    window.gtag!("js", new Date());
  }
  if (gaOn && !loaded.has("ga4")) {
    loaded.add("ga4");
    window.gtag!("config", cfg.ga4Id, { anonymize_ip: true });
  }
  if (adsOn && !loaded.has("ads")) {
    loaded.add("ads");
    window.gtag!("config", cfg.googleAdsId);
  }
  if (consent.marketing && cfg.metaPixelId && !loaded.has("meta")) {
    loaded.add("meta");
    if (!window.fbq) {
      const n: FbqFn = function fbq(...args: unknown[]) {
        if (n.callMethod) n.callMethod(...args);
        else n.queue!.push(args);
      } as FbqFn;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      window.fbq = n;
      window._fbq = n;
      loadScript("https://connect.facebook.net/en_US/fbevents.js", "eb-fbq");
    }
    window.fbq("init", cfg.metaPixelId);
    window.fbq("track", "PageView");
  }
}

/* ---------------- component ---------------- */
export function ConsentAndTags() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [choice, setChoice] = useState({ analytics: false, marketing: false });
  const [cfg, setCfg] = useState<TagConfig | null>(null);
  const loaded = useRef(new Set<string>());
  const firstPath = useRef<string | null>(null);

  // Init: consent state, attribution capture, tag config
  useEffect(() => {
    const c = readConsent();
    setConsent(c);
    if (!c) setOpen(true);
    const { touch, clicks } = captureTouch();
    if (touch) storeTouch(touch, c);
    if (clicks.gclid || clicks.fbclid) {
      write("session", CLICK_KEY, clicks);
      if (c?.marketing) write("local", CLICK_KEY, clicks);
    }
    fetch(`${API}/v1/marketing/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: (TagConfig & { ok: boolean }) | null) => j && setCfg(j))
      .catch(() => undefined);
    window.ebOpenConsent = () => {
      const cur = readConsent();
      setChoice({ analytics: !!cur?.analytics, marketing: !!cur?.marketing });
      setCustom(true);
      setOpen(true);
    };
    const onHash = () => window.location.hash === "#cookie-settings" && window.ebOpenConsent?.();
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load tags once consent + config are known
  useEffect(() => {
    if (consent && cfg && (consent.analytics || consent.marketing)) applyTags(consent, cfg, loaded.current);
  }, [consent, cfg]);

  // SPA page views after the first load
  useEffect(() => {
    if (firstPath.current === null) {
      firstPath.current = pathname;
      return;
    }
    if (!consent || !cfg) return;
    if (consent.analytics && cfg.ga4Id && window.gtag) window.gtag("event", "page_view", { page_path: pathname });
    if (consent.marketing && cfg.metaPixelId && window.fbq) window.fbq("track", "PageView");
  }, [pathname, consent, cfg]);

  // Conversions
  const onQuote = useCallback(
    (e: Event) => {
      const d = (e as CustomEvent<{ reference: string; serviceType?: string }>).detail;
      if (!d?.reference) return;
      const c = readConsent();
      if (c?.analytics && cfg?.ga4Id && window.gtag) window.gtag("event", "generate_lead", { lead_id: d.reference, service_type: d.serviceType });
      if (c?.marketing && cfg?.googleAdsId && cfg.googleAdsQuoteLabel && window.gtag) window.gtag("event", "conversion", { send_to: `${cfg.googleAdsId}/${cfg.googleAdsQuoteLabel}`, transaction_id: d.reference });
      if (c?.marketing && cfg?.metaPixelId && window.fbq) window.fbq("track", "Lead", { content_category: d.serviceType }, { eventID: d.reference });
      const body = {
        reference: d.reference,
        attribution: currentAttribution(c),
        consent: { analytics: !!c?.analytics, marketing: !!c?.marketing },
        ...(c?.marketing ? { fbp: cookie("_fbp"), fbc: cookie("_fbc") } : {}),
        pageUrl: window.location.href.split("?")[0].slice(0, 500),
      };
      fetch(`${API}/v1/attribution`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
    },
    [cfg],
  );
  const onBooking = useCallback(
    (e: Event) => {
      const d = (e as CustomEvent<{ reference?: string; valueCents?: number }>).detail ?? {};
      const c = readConsent();
      const value = typeof d.valueCents === "number" ? d.valueCents / 100 : undefined;
      if (c?.analytics && cfg?.ga4Id && window.gtag) window.gtag("event", "purchase", { transaction_id: d.reference, value, currency: "USD" });
      if (c?.marketing && cfg?.googleAdsId && cfg.googleAdsBookingLabel && window.gtag) window.gtag("event", "conversion", { send_to: `${cfg.googleAdsId}/${cfg.googleAdsBookingLabel}`, transaction_id: d.reference, value, currency: "USD" });
      if (c?.marketing && cfg?.metaPixelId && window.fbq) window.fbq("track", "Purchase", { value, currency: "USD" }, d.reference ? { eventID: d.reference } : undefined);
    },
    [cfg],
  );
  useEffect(() => {
    window.addEventListener("eb:quote-submitted", onQuote);
    window.addEventListener("eb:booking-completed", onBooking);
    return () => {
      window.removeEventListener("eb:quote-submitted", onQuote);
      window.removeEventListener("eb:booking-completed", onBooking);
    };
  }, [onQuote, onBooking]);

  function decide(analytics: boolean, marketing: boolean) {
    const c = saveConsent(analytics, marketing);
    // Withdrawals: forget persisted attribution / click IDs and stop sending
    if (!analytics && !marketing) remove("local", ATTR_KEY);
    if (!marketing) remove("local", CLICK_KEY);
    else {
      const clicks = read("session", CLICK_KEY);
      if (clicks) write("local", CLICK_KEY, clicks);
    }
    if (analytics || marketing) {
      const a = read("session", ATTR_KEY);
      if (a) write("local", ATTR_KEY, a);
    }
    if (window.gtag) {
      window.gtag("consent", "update", { analytics_storage: analytics ? "granted" : "denied", ad_storage: marketing ? "granted" : "denied", ad_user_data: marketing ? "granted" : "denied", ad_personalization: marketing ? "granted" : "denied" });
    }
    setConsent(c);
    setOpen(false);
    setCustom(false);
    if (window.location.hash === "#cookie-settings") history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="false" aria-labelledby="eb-consent-title" aria-describedby="eb-consent-text" data-testid="consent-banner"
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-h-[85vh] max-w-3xl overflow-y-auto rounded-[1.5rem] border border-white/10 bg-navy-950 p-5 text-white shadow-[var(--shadow-lift)] sm:inset-x-6 sm:bottom-6 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 sm:inline-flex"><Cookie className="h-5 w-5 text-orange" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 id="eb-consent-title" className="font-display text-lg font-bold text-white">Your privacy choices</h2>
          <p id="eb-consent-text" className="mt-1.5 text-sm leading-relaxed text-white/75">
            We use necessary cookies to run this site. With your permission we also use analytics to improve it and marketing cookies to measure our ads. You can change this anytime from <a href="/privacy-policy" className="underline hover:text-white">our privacy policy</a>.
          </p>
          {custom && (
            <fieldset className="mt-4 grid gap-2.5 text-sm">
              <legend className="sr-only">Cookie categories</legend>
              <label className="flex items-start gap-3 rounded-xl bg-white/5 p-3"><input type="checkbox" checked disabled className="mt-0.5 h-5 w-5 accent-[#E06010]" /><span><strong className="text-white">Necessary</strong><span className="block text-white/65">Security, your quote draft and these choices. Always on.</span></span></label>
              <label className="flex items-start gap-3 rounded-xl bg-white/5 p-3"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#E06010]" checked={choice.analytics} onChange={(e) => setChoice({ ...choice, analytics: e.target.checked })} /><span><strong className="text-white">Analytics</strong><span className="block text-white/65">Google Analytics, to understand which pages help travelers and businesses.</span></span></label>
              <label className="flex items-start gap-3 rounded-xl bg-white/5 p-3"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#E06010]" checked={choice.marketing} onChange={(e) => setChoice({ ...choice, marketing: e.target.checked })} /><span><strong className="text-white">Marketing</strong><span className="block text-white/65">Google Ads and Meta, to measure which ads bring quote requests.</span></span></label>
            </fieldset>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            {custom ? (
              <button type="button" className="btn-primary !py-2.5" onClick={() => decide(choice.analytics, choice.marketing)}>Save choices</button>
            ) : (
              <button type="button" className="btn-primary !py-2.5" onClick={() => decide(true, true)}>Accept all</button>
            )}
            <button type="button" className="btn-ghost-light !py-2.5" onClick={() => decide(false, false)}>Necessary only</button>
            {!custom && <button type="button" className="btn-ghost-light !py-2.5" onClick={() => { const cur = readConsent(); setChoice({ analytics: !!cur?.analytics, marketing: !!cur?.marketing }); setCustom(true); }}>Customize</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
