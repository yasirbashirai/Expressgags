"use client";

/**
 * Post-delivery satisfaction survey (EN/ES by the customer's language).
 * 1–5 stars, optional comment, optional written permission to publish it as a testimonial.
 * Happy customers see the Google review link (when Express Bags has set one); others see a
 * "we'll follow up" message and never a review prompt.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { contact } from "@/content/site";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

type Survey = { reference: string; firstName: string | null; language: "en" | "es"; responded: boolean; rating: number | null; reviewUrl: string | null };

const T = {
  en: {
    eyebrow: "Your feedback", title: (n: string | null) => (n ? `How did we do, ${n}?` : "How did we do?"), lead: (r: string) => `Order ${r}. One quick rating helps our team keep its standard.`,
    rate: "Your rating", stars: (n: number) => `${n} star${n > 1 ? "s" : ""}`, labels: ["Poor", "Fair", "Good", "Very good", "Excellent"],
    comment: "Anything you'd like to tell us? (optional)", consent: "You may publish my comment on the Express Bags website as a testimonial.",
    attribution: "How should we credit you?", attributionHint: "For example: Hotel operations manager, Miami Beach. Please don't include your full name.",
    submit: "Send feedback", sending: "Sending…", pick: "Please choose a rating.",
    thanks: "Thank you for your feedback", happy: "We're glad everything went well. Would you share your experience on Google? It helps other travelers find us.",
    review: "Leave a Google review", followUp: "Thank you for telling us. Our team will review your order and follow up with you.", plain: "Thank you, we've received your rating.",
    done: "This survey was already answered. Thank you!", invalid: "This survey link is not valid or has expired.", call: `Questions? Call ${contact.phoneDisplay}.`, error: "We couldn't save your feedback just now. Please try again.",
  },
  es: {
    eyebrow: "Su opinión", title: (n: string | null) => (n ? `¿Cómo lo hicimos, ${n}?` : "¿Cómo lo hicimos?"), lead: (r: string) => `Orden ${r}. Una calificación rápida ayuda a nuestro equipo a mantener su estándar.`,
    rate: "Su calificación", stars: (n: number) => `${n} estrella${n > 1 ? "s" : ""}`, labels: ["Mala", "Regular", "Buena", "Muy buena", "Excelente"],
    comment: "¿Algo que quiera contarnos? (opcional)", consent: "Pueden publicar mi comentario en el sitio web de Express Bags como testimonio.",
    attribution: "¿Cómo debemos mencionarle?", attributionHint: "Por ejemplo: Gerente de operaciones de hotel, Miami Beach. No incluya su nombre completo.",
    submit: "Enviar opinión", sending: "Enviando…", pick: "Elija una calificación.",
    thanks: "Gracias por su opinión", happy: "Nos alegra que todo saliera bien. ¿Compartiría su experiencia en Google? Ayuda a otros viajeros a encontrarnos.",
    review: "Dejar una reseña en Google", followUp: "Gracias por contarnos. Nuestro equipo revisará su orden y se pondrá en contacto.", plain: "Gracias, recibimos su calificación.",
    done: "Esta encuesta ya fue respondida. ¡Gracias!", invalid: "Este enlace de encuesta no es válido o expiró.", call: `¿Preguntas? Llame al ${contact.phoneDisplay}.`, error: "No pudimos guardar su opinión. Intente de nuevo.",
  },
};

export function SurveyForm({ token }: { token: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "form" | "sending" | "done">("loading");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [attribution, setAttribution] = useState("");
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/survey/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("invalid");
        const j = (await r.json()) as { survey: Survey };
        setSurvey(j.survey);
        if (j.survey.responded) {
          setRating(j.survey.rating ?? 0);
          setReviewUrl(j.survey.reviewUrl);
          setState("done");
        } else setState("form");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const t = T[survey?.language ?? "en"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rating) return setError(t.pick);
    setState("sending");
    try {
      const r = await fetch(`${API}/v1/survey/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, publishConsent: consent && !!comment.trim(), attribution: consent ? attribution : "" }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; reviewUrl?: string | null };
      if (r.status === 409) {
        setState("done");
        return;
      }
      if (!r.ok || !j.ok) throw new Error();
      setReviewUrl(j.reviewUrl ?? null);
      setState("done");
    } catch {
      setError(t.error);
      setState("form");
    }
  }

  function reviewClick() {
    fetch(`${API}/v1/survey/${encodeURIComponent(token)}/review-click`, { method: "POST", keepalive: true }).catch(() => undefined);
  }

  const card = "mx-auto max-w-xl rounded-[1.75rem] bg-white p-6 shadow-[var(--shadow-lift)] sm:p-10";

  if (state === "loading") return <div className={card} aria-busy="true"><p className="text-sm text-muted">…</p></div>;
  if (state === "invalid")
    return (
      <div className={card}>
        <h1 className="text-2xl font-bold">{t.invalid}</h1>
        <p className="mt-3 text-slate-ink">{t.call}</p>
      </div>
    );

  if (state === "done") {
    const happy = rating >= 4;
    return (
      <div className={card} role="status">
        <CheckCircle2 className="h-12 w-12 text-orange" aria-hidden />
        <h1 className="mt-5 text-3xl font-extrabold">{t.thanks}</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-ink">{survey?.responded && !rating ? t.done : happy ? (reviewUrl ? t.happy : t.plain) : rating ? t.followUp : t.done}</p>
        {happy && reviewUrl && (
          <a href={reviewUrl} onClick={reviewClick} target="_blank" rel="noopener noreferrer" className="btn-primary mt-7" data-testid="review-link">
            <Star className="h-4 w-4" aria-hidden /> {t.review}
          </a>
        )}
        <p className="mt-6 text-sm text-muted">{t.call}</p>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className={card} noValidate>
      <p className="eyebrow">{t.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight md:text-4xl">{t.title(survey?.firstName ?? null)}</h1>
      <p className="mt-3 text-slate-ink">{t.lead(survey?.reference ?? "")}</p>

      <fieldset className="mt-8">
        <legend className="text-sm font-semibold text-navy">{t.rate}</legend>
        <div className="mt-3 flex gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" aria-label={`${t.stars(n)}, ${t.labels[n - 1]}`} />
              <Star className={`h-11 w-11 rounded-lg p-1 transition peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-orange ${n <= shown ? "fill-orange text-orange" : "text-line"}`} aria-hidden strokeWidth={1.6} />
            </label>
          ))}
        </div>
        <p className="mt-2 h-5 text-sm font-medium text-orange-700" aria-live="polite">{shown ? t.labels[shown - 1] : ""}</p>
      </fieldset>

      <label htmlFor="sv-comment" className="mt-6 block text-sm font-semibold text-navy">{t.comment}</label>
      <textarea id="sv-comment" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} className="mt-2 w-full rounded-xl border border-line px-3.5 py-3 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />

      {comment.trim() && (
        <div className="mt-4 rounded-2xl bg-cloud p-4">
          <label className="flex items-start gap-3 text-sm text-slate-ink">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#E06010]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            {t.consent}
          </label>
          {consent && (
            <div className="mt-3">
              <label htmlFor="sv-attr" className="block text-sm font-semibold text-navy">{t.attribution}</label>
              <input id="sv-attr" maxLength={120} value={attribution} onChange={(e) => setAttribution(e.target.value)} aria-describedby="sv-attr-hint" className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/15" />
              <p id="sv-attr-hint" className="mt-1 text-xs text-muted">{t.attributionHint}</p>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-700">{error}</p>}
      <button type="submit" className="btn-primary mt-7 w-full sm:w-auto" disabled={state === "sending"}>{state === "sending" ? t.sending : t.submit}</button>
    </form>
  );
}
