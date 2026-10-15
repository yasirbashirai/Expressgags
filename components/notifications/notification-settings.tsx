"use client";

/**
 * Admin: which events notify customers by which channel, staff alert recipients, SMS quiet hours,
 * survey timing + Google review link, and (owner only) analytics/ads tag IDs.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { AdminTitle, Panel, useAdminUser } from "@/components/admin/admin-shell";
import { api, ApiError } from "@/components/admin/api";
import { Field, inputCls } from "@/components/admin/ui";
import { templateLabel } from "./admin-notifications";

type Toggle = { email: boolean; sms: boolean };
type Settings = {
  events: Record<string, Toggle>;
  staffRecipients: string[];
  quietHours: { enabled: boolean; start: string; end: string };
  surveyDelayMinutes: number;
  googleReviewUrl: string;
  lowRatingThreshold: number;
};
type Marketing = { ga4Id: string; googleAdsId: string; googleAdsQuoteLabel: string; googleAdsBookingLabel: string; metaPixelId: string };

export function NotificationSettingsPanel() {
  const user = useAdminUser();
  const [s, setS] = useState<Settings | null>(null);
  const [m, setM] = useState<Marketing | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [recipients, setRecipients] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [mMsg, setMMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ notifications: Settings; marketing: Marketing; customerEvents: string[] }>("/notifications/settings")
      .then((r) => {
        setS(r.notifications);
        setM(r.marketing);
        setKeys(r.customerEvents);
        setRecipients(r.notifications.staffRecipients.join(", "));
      })
      .catch((e: ApiError) => setMsg(e.message));
  }, []);

  if (!s || !m) return <p className="text-sm text-muted">{msg ?? "Loading…"}</p>;

  const toggle = (k: string, ch: keyof Toggle) => setS({ ...s, events: { ...s.events, [k]: { ...(s.events[k] ?? { email: false, sms: false }), [ch]: !s.events[k]?.[ch] } } });

  async function save() {
    setMsg(null);
    try {
      const staffRecipients = recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      const r = await api<{ notifications: Settings }>("/notifications/settings", { method: "PUT", json: { notifications: { ...s, staffRecipients } } });
      setS(r.notifications);
      setMsg("Settings saved.");
    } catch (e) {
      const err = e as ApiError;
      setMsg(err.details?.length ? err.details.map((d) => `${d.path}: ${d.message}`).join(" · ") : err.message);
    }
  }
  async function saveMarketing() {
    setMMsg(null);
    try {
      const r = await api<{ marketing: Marketing }>("/notifications/settings/marketing", { method: "PUT", json: { marketing: m } });
      setM(r.marketing);
      setMMsg("Tag IDs saved. They load only for visitors who accept the matching cookies.");
    } catch (e) {
      const err = e as ApiError;
      setMMsg(err.details?.length ? err.details.map((d) => `${d.path}: ${d.message}`).join(" · ") : err.message);
    }
  }

  return (
    <>
      <AdminTitle title="Notification settings" sub="Changes apply to new messages immediately." actions={<Link href="/admin/notifications" className="btn-ghost !py-2"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Link>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Customer messages">
          <p className="mb-4 text-sm text-slate-ink">Texts only go out when SMS is switched on in Settings &amp; pricing, the customer gave a phone number and didn&apos;t ask for email-only contact. Quotation and invoice emails are sent by their own modules with the secure link.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr><th scope="col" className="py-2">Event</th><th scope="col" className="py-2 text-center">Email</th><th scope="col" className="py-2 text-center">SMS / WhatsApp</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {keys.map((k) => (
                  <tr key={k}>
                    <th scope="row" className="py-2.5 pr-3 text-left font-medium text-navy">{templateLabel(k)}</th>
                    {(["email", "sms"] as const).map((ch) => (
                      <td key={ch} className="py-2.5 text-center">
                        <input type="checkbox" aria-label={`${templateLabel(k)} by ${ch}`} className="h-5 w-5 accent-[#E06010]" checked={!!s.events[k]?.[ch]} onChange={() => toggle(k, ch)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="space-y-6">
          <Panel title="Quiet hours for texts (Miami time)">
            <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#E06010]" checked={s.quietHours.enabled} onChange={(e) => setS({ ...s, quietHours: { ...s.quietHours, enabled: e.target.checked } })} /> Hold texts during quiet hours</label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" htmlFor="qh-s"><input id="qh-s" type="time" className={inputCls} value={s.quietHours.start} onChange={(e) => setS({ ...s, quietHours: { ...s.quietHours, start: e.target.value } })} /></Field>
              <Field label="Until" htmlFor="qh-e"><input id="qh-e" type="time" className={inputCls} value={s.quietHours.end} onChange={(e) => setS({ ...s, quietHours: { ...s.quietHours, end: e.target.value } })} /></Field>
            </div>
            <p className="mt-2 text-xs text-muted">Held texts go out at the end of quiet hours. Emails are never held.</p>
          </Panel>
          <Panel title="Staff alerts">
            <Field label="Extra recipients" htmlFor="st-r" hint="High and critical exceptions, low ratings and claims also go to the notification email in Settings & pricing. Separate addresses with commas.">
              <input id="st-r" className={inputCls} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="dispatch@express-bags.com" />
            </Field>
          </Panel>
          <Panel title="Satisfaction survey & reviews">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Send after delivery (minutes)" htmlFor="sv-d"><input id="sv-d" type="number" min={0} className={inputCls} value={s.surveyDelayMinutes} onChange={(e) => setS({ ...s, surveyDelayMinutes: Number(e.target.value) })} /></Field>
              <Field label="Alert staff at or below" htmlFor="sv-t">
                <select id="sv-t" className={inputCls} value={s.lowRatingThreshold} onChange={(e) => setS({ ...s, lowRatingThreshold: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Google review link" htmlFor="sv-g" hint="Shown only to customers who rate above the alert level. Leave empty to hide.">
                <input id="sv-g" type="url" className={inputCls} value={s.googleReviewUrl} onChange={(e) => setS({ ...s, googleReviewUrl: e.target.value })} placeholder="https://g.page/r/…/review" />
              </Field>
            </div>
          </Panel>
          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={save}><Save className="h-4 w-4" aria-hidden /> Save settings</button>
            {msg && <p role="status" className="text-sm text-navy">{msg}</p>}
          </div>
        </div>
      </div>

      <Panel title="Analytics & advertising tags" className="mt-6">
        <p className="mb-4 text-sm text-slate-ink">Public IDs only. Tags load only after a visitor accepts the matching cookie category (analytics or marketing). {user?.role !== "OWNER" && "Only the owner can change these."}</p>
        <fieldset disabled={user?.role !== "OWNER"} className="grid gap-3 md:grid-cols-3">
          <Field label="Google Analytics 4 ID" htmlFor="mk-ga"><input id="mk-ga" className={inputCls} value={m.ga4Id} onChange={(e) => setM({ ...m, ga4Id: e.target.value.trim() })} placeholder="G-XXXXXXX" /></Field>
          <Field label="Google Ads ID" htmlFor="mk-aw"><input id="mk-aw" className={inputCls} value={m.googleAdsId} onChange={(e) => setM({ ...m, googleAdsId: e.target.value.trim() })} placeholder="AW-123456789" /></Field>
          <Field label="Meta Pixel ID" htmlFor="mk-px"><input id="mk-px" className={inputCls} value={m.metaPixelId} onChange={(e) => setM({ ...m, metaPixelId: e.target.value.trim() })} placeholder="1234567890" /></Field>
          <Field label="Ads conversion label: quote request" htmlFor="mk-q"><input id="mk-q" className={inputCls} value={m.googleAdsQuoteLabel} onChange={(e) => setM({ ...m, googleAdsQuoteLabel: e.target.value.trim() })} /></Field>
          <Field label="Ads conversion label: booking" htmlFor="mk-b"><input id="mk-b" className={inputCls} value={m.googleAdsBookingLabel} onChange={(e) => setM({ ...m, googleAdsBookingLabel: e.target.value.trim() })} /></Field>
          <div className="flex items-end"><button type="button" className="btn-navy w-full" onClick={saveMarketing}><Save className="h-4 w-4" aria-hidden /> Save tag IDs</button></div>
        </fieldset>
        {mMsg && <p role="status" className="mt-3 text-sm text-navy">{mMsg}</p>}
      </Panel>
    </>
  );
}
