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
import { SERVICE_CARDS } from "./options";

const STORAGE_KEY = "eb-quote-draft-v1";
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string } | { kind: "done"; result: QuoteSubmitResponse };

const STEP_INTRO: Partial<Record<StepId, string>> = {
  service: "Choose the option that fits best. You can change it at any time.",
  route: "Where should we collect, and where should everything go?",
  storage: "Tell us when the bags arrive and when they need to leave storage.",
  group: "A few details about the program so we can plan vehicles, labor and timing.",
  timing: "When do you need us?",
  items: "Count and size help us assign the right vehicle and team.",
  contact: "Where should we send your written quotation?",
  review: "Check the details, confirm, and send. No payment is taken.",
};

export function QuoteWizard() {
  const params = useSearchParams();
  const [draft, setDraft] = useState<QuoteDraft>(emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [hydrated, setHydrated] = useState(false);
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
          setDraft(revived);
          setStepIndex(revived.serviceType ? 1 : 0);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    } catch {
      setStatus({ kind: "error", message: "We couldn't send your request just now. Your details are saved on this device." });
    }
  }

  function startOver() {
    setDraft(emptyDraft());
    setStepIndex(0);
    setErrors({});
    setStatus({ kind: "idle" });
  }

  if (status.kind === "done") return <SuccessPanel result={status.result} email={draft.contact.email} onStartOver={startOver} headingRef={headingRef} />;

  const errorCount = Object.keys(errors).length;
  const service = SERVICE_CARDS.find((c) => c.type === draft.serviceType);
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="card overflow-hidden">
      {/* Progress */}
      <div className="border-b border-line bg-white px-4 pb-4 pt-5 sm:px-8">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>
            Step {stepIndex + 1} of {totalSteps}
          </span>
          {service && <span className="truncate text-navy">{service.title}</span>}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-50" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={stepIndex + 1} aria-label="Quote progress">
          <div className="h-full rounded-full bg-orange transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        {draft.serviceType && (
          <ol className="mt-4 hidden flex-wrap gap-2 md:flex" aria-label="Steps">
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
                    {s.short}
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
            {step.title}
          </h2>
          {STEP_INTRO[step.id] && <p className="mt-2 text-slate-ink">{STEP_INTRO[step.id]}</p>}

          {errorCount > 0 && (
            <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {errorCount === 1 ? "One field needs your attention." : `${errorCount} fields need your attention.`}
            </div>
          )}

          <div className="mt-6">
            {!hydrated ? (
              <div className="flex h-40 items-center justify-center text-muted">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                <span className="sr-only">Loading</span>
              </div>
            ) : step.id === "service" ? (
              <ServiceStep selected={draft.serviceType} onPick={pickService} error={errors.serviceType} />
            ) : step.id === "route" ? (
              <RouteStep draft={draft} update={update} errors={errors} />
            ) : step.id === "storage" ? (
              <StorageStep draft={draft} update={update} errors={errors} />
            ) : step.id === "group" ? (
              <GroupStep draft={draft} update={update} errors={errors} />
            ) : step.id === "timing" ? (
              <TimingStep draft={draft} update={update} errors={errors} step={step} />
            ) : step.id === "items" ? (
              <ItemsStep draft={draft} update={update} errors={errors} />
            ) : step.id === "contact" ? (
              <ContactStep draft={draft} update={update} errors={errors} apiUrl={API_URL} />
            ) : (
              <ReviewStep draft={draft} update={update} errors={errors} steps={steps} goTo={goTo} />
            )}
          </div>

          {status.kind === "error" && (
            <div role="alert" className="mt-6 rounded-2xl border border-orange/40 bg-orange-50 p-4 text-sm text-charcoal">
              <p className="font-semibold text-navy">{status.message}</p>
              <p className="mt-1">
                Please try again, or call our office at{" "}
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
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back
            </button>
          ) : (
            <span className="text-xs text-muted">No payment needed to request a quote</span>
          )}
          <button
            type="submit"
            disabled={status.kind === "sending" || !hydrated || (step.id === "service" && !draft.serviceType)}
            className="btn-primary min-h-12 flex-1 sm:flex-none"
          >
            {status.kind === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…
              </>
            ) : isLast ? (
              status.kind === "error" ? "Try again" : "Send quote request"
            ) : (
              <>
                Continue <ChevronRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function SuccessPanel({
  result,
  email,
  onStartOver,
  headingRef,
}: {
  result: QuoteSubmitResponse;
  email: string;
  onStartOver: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const custom = result.route === "custom-quote" || result.route === "special-route";
  return (
    <div className="card overflow-hidden">
      <div className="bg-navy px-6 py-10 text-white sm:px-10">
        <CheckCircle2 className="h-12 w-12 text-orange" aria-hidden />
        <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-3xl font-bold text-white outline-none">
          Request received
        </h2>
        <p className="mt-2 text-white/80">{result.message || "Thank you. Our dispatch team is reviewing your request."}</p>
        <div className="mt-6 inline-flex flex-col rounded-2xl border border-white/15 bg-white/5 px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Your reference</span>
          <span className="font-display text-2xl font-bold tracking-wide" data-testid="quote-reference">
            {result.reference}
          </span>
        </div>
      </div>
      <div className="px-6 py-8 sm:px-10">
        <h3 className="text-lg font-bold">What happens next</h3>
        <ol className="mt-4 grid gap-4">
          {[
            { t: "Dispatch reviews your request", d: "We check the route, vehicle, labor, timing and any airport, port or venue access requirements." },
            {
              t: custom ? "We plan your program" : "You receive a written quotation",
              d: custom
                ? "A coordinator may contact you to confirm manifests, locations and timings, then sends a written quotation."
                : `Your quote, with the included scope and assumptions, is sent${email ? ` to ${email}` : ""}.`,
            },
            { t: "Approve and book", d: "Once you approve, we confirm the booking and assign your team. Same-day service is subject to capacity and dispatch confirmation." },
          ].map((s, i) => (
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
            Start another request
          </button>
        </div>
      </div>
    </div>
  );
}
