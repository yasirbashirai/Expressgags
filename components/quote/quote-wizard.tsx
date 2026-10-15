"use client";

/**
 * Express Bags "Request a Quote" wizard.
 * One entry point, then a service-specific flow. Quote-only: no prices are ever shown.
 * Draft is saved in localStorage so a refresh never loses the customer's work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Phone } from "lucide-react";
import { contact } from "@/content/site";
import type { QuoteSubmitResponse } from "@/lib/quote-schema";
import {
  applyServiceDefaults,
  emptyDraft,
  getSteps,
  isMarket,
  isServiceType,
  parseFinal,
  reviveDraft,
  validateStep,
  type FieldErrors,
  type QuoteDraft,
  type StepId,
} from "./flow";
import { fieldId } from "./fields";
import { ContactStep, GroupStep, ItemsStep, ReviewStep, RouteStep, ServiceStep, StorageStep, TimingStep } from "./sections";
import { InstantPrice, type InstantFlags } from "./instant-price";
import { QuoteLangProvider } from "./i18n";
import { parseProtectionPlans, type ProtectionPlans } from "./wizard-extras";
import { QUOTE_STRINGS, isLang, localizeErrors, type Lang } from "@/content/i18n/quote";

const STORAGE_KEY = "eb-quote-draft-v1";
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string } | { kind: "done"; result: QuoteSubmitResponse };


export function QuoteWizard({ defaultLang }: { defaultLang?: Lang } = {}) {
  const params = useSearchParams();
  const [draft, setDraft] = useState<QuoteDraft>(emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [hydrated, setHydrated] = useState(false);
  // Instant pricing flags (public booleans only). null = quote-only experience.
  const [instantFlags, setInstantFlags] = useState<InstantFlags | null>(null);
  // Protection plans (null = module not live → picker hidden entirely)
  const [protectionPlans, setProtectionPlans] = useState<ProtectionPlans | null>(null);
  // Wizard language: ?lang=, else the page language (/es/solicitar-cotizacion → Spanish), else the saved draft
  const lang: Lang = draft.language;
  const t = QUOTE_STRINGS[lang];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const steps = useMemo(() => getSteps(draft.serviceType), [draft.serviceType]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = step.id === "review";
  const totalSteps = draft.serviceType ? steps.length : 6;

  // Restore saved draft, then apply ?type= & ?market= (query wins for a fresh start).
  useEffect(() => {
    let restored: QuoteDraft | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) restored = reviveDraft(JSON.parse(raw));
    } catch {
      restored = null;
    }
    let next = restored ?? emptyDraft();
    // Language: ?lang= wins, then the page's language (Spanish page → Spanish), then the saved draft
    const qLang = params.get("lang");
    if (isLang(qLang)) next = { ...next, language: qLang };
    else if (defaultLang) next = { ...next, language: defaultLang };
    const type = params.get("type");
    const market = params.get("market");
    if (isMarket(market) && !next.pickup.market) next = { ...next, pickup: { ...next.pickup, market }, delivery: { ...next.delivery, market: next.delivery.market || market }, storageMarket: next.storageMarket || market };
    if (type === "business") next = { ...next, billingType: "company-account" };
    if (isServiceType(type) && next.serviceType !== type) {
      next = applyServiceDefaults(next, type);
      if (isMarket(market)) next = { ...next, pickup: { ...next.pickup, market: next.pickup.market || market } };
    }
    setDraft(next);
    if (next.serviceType && isServiceType(type)) setStepIndex(1);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Book this again" from the customer portal: ?repeat=<orderId> loads a draft built from that order
  // (the portal API checks the signed-in customer owns it). Dates and confirmations stay blank.
  useEffect(() => {
    const repeat = params.get("repeat");
    if (!repeat || !/^[a-z0-9]{10,40}$/i.test(repeat)) return;
    fetch(`${API_URL}/v1/account/orders/${repeat}/repeat-draft`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const revived = body?.draft ? reviveDraft(body.draft) : null;
        if (revived) {
          setDraft((d) => ({ ...revived, language: d.language }));
          setStepIndex(revived.serviceType ? 1 : 0);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quote started in the AI assistant chat: ?draft=<token> loads that draft (dates/confirmations still checked by the wizard)
  useEffect(() => {
    const token = params.get("draft");
    if (!token || !/^[A-Za-z0-9]{16,64}$/.test(token)) return;
    fetch(`${API_URL}/v1/assistant/draft/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const revived = body?.draft ? reviveDraft(body.draft) : null;
        if (revived) {
          setDraft((d) => ({ ...revived, language: revived.language === "es" ? "es" : d.language }));
          setStepIndex(revived.serviceType ? 1 : 0);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Owner-approved instant pricing? (never blocks the wizard; failures keep it quote-only)
  // Public feature flags (booleans only): instant pricing, carrier shipping, and whether optional protection is live.
  // Protection plans are fetched only when live, so the page never logs a 404 while the module is off.
  useEffect(() => {
    fetch(`${API_URL}/v1/public-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c?.instantBookingEnabled || c?.carrierShippingEnabled) setInstantFlags({ instantBookingEnabled: !!c.instantBookingEnabled, carrierShippingEnabled: !!c.carrierShippingEnabled });
        if (!c?.protectionLive) return setProtectionPlans(null);
        return fetch(`${API_URL}/v1/protection/plans`).then(async (r) => setProtectionPlans(parseProtectionPlans(r.status, await r.json().catch(() => null))));
      })
      .catch(() => setProtectionPlans(null));
  }, []);

  // Switching language keeps everything already entered; the wizard container carries the matching lang attribute
  const setLang = (l: Lang) => setDraft((d) => ({ ...d, language: l }));

  // Persist draft
  useEffect(() => {
    if (!hydrated || status.kind === "done") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable: fine */
    }
  }, [draft, hydrated, status.kind]);

  // Move focus to the step heading on step change (not on first load)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [stepIndex, status.kind]);

  const update = useCallback((fn: (d: QuoteDraft) => QuoteDraft) => {
    setDraft((d) => fn(d));
  }, []);

  // Re-validate live once errors are showing, so they clear as the user fixes them
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    setErrors(validateStep(draft, step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function focusFirstError(errs: FieldErrors) {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId(first)) ?? document.getElementById(`q-${first}`);
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function next() {
    const errs = validateStep(draft, step);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(errs);
      return;
    }
    if (isLast) {
      void submit();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    setErrors({});
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function goTo(id: StepId) {
    const i = steps.findIndex((s) => s.id === id);
    if (i >= 0) {
      setErrors({});
      setStepIndex(i);
    }
  }

  function pickService(s: NonNullable<QuoteDraft["serviceType"]>) {
    if (!s) return;
    setErrors({});
    setDraft((d) => applyServiceDefaults(d, s));
  }

  async function submit() {
    const parsed = parseFinal(draft);
    if (!parsed.ok) {
      // Jump to the first step that owns an error
      const firstPath = Object.keys(parsed.errors)[0];
      const owner = steps.findIndex((s) => s.paths.some((p) => firstPath === p || firstPath?.startsWith(p + ".")));
      setErrors(parsed.errors);
      if (owner >= 0 && owner !== stepIndex) setStepIndex(owner);
      focusFirstError(parsed.errors);
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const res = await fetch(`${API_URL}/v1/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = (await res.json().catch(() => null)) as QuoteSubmitResponse | { ok: false; error?: string } | null;
      if (!res.ok || !json || !("ok" in json) || !json.ok) throw new Error(`status ${res.status}`);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setStatus({ kind: "done", result: json });
      // Conversion hook for consented analytics/ads + attribution (components/marketing/consent-and-tags.tsx)
      window.dispatchEvent(new CustomEvent("eb:quote-submitted", { detail: { reference: json.reference, serviceType: parsed.data.serviceType } }));
    } catch {
      setStatus({ kind: "error", message: QUOTE_STRINGS[draft.language].sendError });
    }
  }

  function startOver() {
    setDraft((d) => ({ ...emptyDraft(), language: d.language }));
    setStepIndex(0);
    setErrors({});
    setStatus({ kind: "idle" });
  }

  if (status.kind === "done")
    return (
      <QuoteLangProvider value={lang}>
        <div lang={lang === "es" ? "es-US" : "en"}>
          <SuccessPanel result={status.result} email={draft.contact.email} onStartOver={startOver} headingRef={headingRef} lang={lang} />
        </div>
      </QuoteLangProvider>
    );

  const shown = localizeErrors(errors, lang);
  const errorCount = Object.keys(shown).length;
  const service = draft.serviceType ? t.services[draft.serviceType] : null;
  const stepKey = step.id === "timing" && draft.serviceType === "storage" ? "timingStorage" : step.id;
  const stepText = t.steps[stepKey];
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <QuoteLangProvider value={lang}>
    <div className="card overflow-hidden" lang={lang === "es" ? "es-US" : "en"} data-testid="quote-wizard" data-lang={lang}>
      {/* Progress */}
      <div className="border-b border-line bg-white px-4 pb-4 pt-5 sm:px-8">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>{t.stepOf(stepIndex + 1, totalSteps)}</span>
          <span className="flex min-w-0 items-center gap-3">
            {service && <span className="hidden truncate text-navy sm:inline">{service.title}</span>}
            <LangToggle lang={lang} onChange={setLang} label={t.switchLabel} />
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-50" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={stepIndex + 1} aria-label={t.progressLabel}>
          <div className="h-full rounded-full bg-orange transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        {draft.serviceType && (
          <ol className="mt-4 hidden flex-wrap gap-2 md:flex" aria-label={t.stepsLabel}>
            {steps.map((s, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={i > stepIndex}
                    onClick={() => goTo(s.id)}
                    aria-current={current ? "step" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      current ? "bg-navy text-white" : done ? "bg-navy-50 text-navy hover:bg-navy-100" : "bg-cloud text-muted"
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${current ? "bg-orange" : done ? "bg-navy text-white" : "bg-white"}`}>
                      {done ? <Check className="h-2.5 w-2.5" aria-hidden strokeWidth={3} /> : i + 1}
                    </span>
                    {t.steps[s.id === "timing" && draft.serviceType === "storage" ? "timingStorage" : s.id].short}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="relative"
      >
        <div className="px-4 py-6 sm:px-8 sm:py-8">
          <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-28 text-2xl font-bold outline-none sm:text-3xl">
            {stepText.title}
          </h2>
          {stepText.intro && <p className="mt-2 text-slate-ink">{stepText.intro}</p>}

          {errorCount > 0 && (
            <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {t.attention(errorCount)}
            </div>
          )}

          <div className="mt-6">
            {!hydrated ? (
              <div className="flex h-40 items-center justify-center text-muted">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                <span className="sr-only">{t.loading}</span>
              </div>
            ) : step.id === "service" ? (
              <ServiceStep selected={draft.serviceType} onPick={pickService} error={shown.serviceType} />
            ) : step.id === "route" ? (
              <RouteStep draft={draft} update={update} errors={shown} />
            ) : step.id === "storage" ? (
              <StorageStep draft={draft} update={update} errors={shown} apiUrl={API_URL} />
            ) : step.id === "group" ? (
              <GroupStep draft={draft} update={update} errors={shown} />
            ) : step.id === "timing" ? (
              <TimingStep draft={draft} update={update} errors={shown} step={step} />
            ) : step.id === "items" ? (
              <ItemsStep draft={draft} update={update} errors={shown} />
            ) : step.id === "contact" ? (
              <ContactStep draft={draft} update={update} errors={shown} apiUrl={API_URL} />
            ) : (
              <>
                <ReviewStep draft={draft} update={update} errors={shown} steps={steps} goTo={goTo} protectionPlans={protectionPlans} />
                <InstantPrice draft={draft} apiUrl={API_URL} flags={instantFlags} />
              </>
            )}
          </div>

          {status.kind === "error" && (
            <div role="alert" className="mt-6 rounded-2xl border border-orange/40 bg-orange-50 p-4 text-sm text-charcoal">
              <p className="font-semibold text-navy">{status.message}</p>
              <p className="mt-1">
                {t.sendErrorHelp}{" "}
                <a href={contact.phoneHref} className="font-semibold text-orange-700 underline">
                  {contact.phoneDisplay}
                </a>
                .
              </p>
            </div>
          )}
        </div>

        {/* Action bar: sticky on mobile */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:static sm:px-8 sm:py-5">
          {stepIndex > 0 ? (
            <button type="button" onClick={back} className="btn-ghost !px-4 sm:!px-6">
              <ChevronLeft className="h-4 w-4" aria-hidden /> {t.back}
            </button>
          ) : (
            <span className="text-xs text-muted">{t.noPayment}</span>
          )}
          <button
            type="submit"
            disabled={status.kind === "sending" || !hydrated || (step.id === "service" && !draft.serviceType)}
            className="btn-primary min-h-12 flex-1 sm:flex-none"
          >
            {status.kind === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t.sending}
              </>
            ) : isLast ? (
              status.kind === "error" ? t.tryAgain : t.send
            ) : (
              <>
                {t.continue} <ChevronRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
    </QuoteLangProvider>
  );
}

/** EN / ES switch in the wizard header. Changing language keeps everything already entered. */
function LangToggle({ lang, onChange, label }: { lang: Lang; onChange: (l: Lang) => void; label: string }) {
  return (
    <span role="group" aria-label={label} className="inline-flex shrink-0 overflow-hidden rounded-full border border-line normal-case tracking-normal">
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l === "es" ? "es-US" : "en"}
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          data-testid={`lang-${l}`}
          className={`px-2.5 py-1 text-xs font-semibold transition ${lang === l ? "bg-navy text-white" : "bg-white text-navy hover:bg-navy-50"}`}
        >
          {l === "en" ? "EN" : "ES"}
          <span className="sr-only">{l === "en" ? " English" : " Español"}</span>
        </button>
      ))}
    </span>
  );
}

function SuccessPanel({
  result,
  email,
  onStartOver,
  headingRef,
  lang,
}: {
  result: QuoteSubmitResponse;
  email: string;
  onStartOver: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  lang: Lang;
}) {
  const t = QUOTE_STRINGS[lang].success;
  const custom = result.route === "custom-quote" || result.route === "special-route";
  return (
    <div className="card overflow-hidden">
      <div className="bg-navy px-6 py-10 text-white sm:px-10">
        <CheckCircle2 className="h-12 w-12 text-orange" aria-hidden />
        <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-3xl font-bold text-white outline-none">
          {t.title}
        </h2>
        <p className="mt-2 text-white/80">{result.message || t.defaultMessage}</p>
        <div className="mt-6 inline-flex flex-col rounded-2xl border border-white/15 bg-white/5 px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">{t.reference}</span>
          <span className="font-display text-2xl font-bold tracking-wide" data-testid="quote-reference">
            {result.reference}
          </span>
        </div>
      </div>
      <div className="px-6 py-8 sm:px-10">
        <h3 className="text-lg font-bold">{t.next}</h3>
        <ol className="mt-4 grid gap-4">
          {[t.step1, custom ? t.step2Custom : { t: t.step2.t, d: t.step2.d(email) }, t.step3].map((s, i) => (
            <li key={s.t} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 font-display font-bold text-orange-700">{i + 1}</span>
              <span>
                <span className="block font-semibold text-navy">{s.t}</span>
                <span className="block text-sm text-slate-ink">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={contact.phoneHref} className="btn-ghost">
            <Phone className="h-4 w-4" aria-hidden /> {contact.phoneDisplay}
          </a>
          <button type="button" onClick={onStartOver} className="btn-navy">
            {t.another}
          </button>
        </div>
      </div>
    </div>
  );
}
