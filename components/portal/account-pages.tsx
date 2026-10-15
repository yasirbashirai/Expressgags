"use client";

/** Profile & security (profile, password, business account application) and the company administration page. */
import { useEffect, useState, type FormEvent } from "react";
import { Building2, KeyRound, Mail, UserPlus, UserRound } from "lucide-react";
import { dateTime, portal, PortalError } from "./api";
import { useMe } from "./portal-shell";
import { Alert, aria, Card, Field, input, Loading, PageTitle, StatusPill, SubmitButton } from "./ui";

const useSubmit = () => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    setFields({});
    try {
      setMsg({ tone: "success", text: await fn() });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
      if (e instanceof PortalError) setFields(e.fields);
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, fields, run };
};

const ACCOUNT_TYPES: [string, string][] = [
  ["hotel", "Hotel"], ["resort", "Resort"], ["dmc", "Destination management (DMC)"], ["cruise", "Cruise or shore operations"], ["corporate", "Corporate / travel program"],
  ["sports", "Sports organization"], ["entertainment", "Entertainment / touring"], ["event", "Events & conventions"], ["university", "University"], ["commercial", "Commercial business"],
];

export function ProfilePage() {
  const { me, refresh } = useMe();
  const profile = useSubmit();
  const password = useSubmit();
  const business = useSubmit();

  const saveProfile = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    profile.run(async () => {
      await portal("/me", { method: "PATCH", json: { name: fd.get("name"), phone: fd.get("phone"), language: fd.get("language"), marketingOptIn: fd.get("marketing") === "on", defaultCostCenter: fd.get("costCenter") ?? undefined } });
      await refresh();
      return "Profile saved.";
    });
  };
  const changePassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    password.run(async () => {
      if (fd.get("newPassword") !== fd.get("confirm")) throw new Error("The two new passwords do not match.");
      await portal("/auth/change-password", { method: "POST", json: { currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword") } });
      form.reset();
      return "Password changed.";
    });
  };
  const apply = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    business.run(async () => {
      const r = await portal<{ message: string }>("/business-application", {
        method: "POST",
        json: { companyName: fd.get("companyName"), accountType: fd.get("accountType"), billingEmail: fd.get("billingEmail"), poRequired: fd.get("poRequired") === "on", expectedVolume: fd.get("volume"), notes: fd.get("notes") },
      });
      await refresh();
      return r.message;
    });
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Profile & security" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Your details">
          <form onSubmit={saveProfile} className="space-y-4" noValidate>
            {profile.msg && <Alert tone={profile.msg.tone}>{profile.msg.text}</Alert>}
            <Field id="name" label="Full name" error={profile.fields.name}><input {...aria("name", profile.fields.name)} defaultValue={me.name} autoComplete="name" className={input} /></Field>
            <Field id="email" label="Email" hint="To change your sign-in email, please call our office."><input {...aria("email", undefined, "hint")} value={me.email} readOnly disabled className={input} /></Field>
            <Field id="phone" label="Phone" error={profile.fields.phone}><input {...aria("phone", profile.fields.phone)} type="tel" defaultValue={me.phone ?? ""} autoComplete="tel" className={input} /></Field>
            <Field id="language" label="Preferred language">
              <select {...aria("language")} defaultValue={me.language} className={input}><option value="en">English</option><option value="es">Español</option></select>
            </Field>
            {me.company && <Field id="costCenter" label="Default cost center" optional><input {...aria("costCenter")} defaultValue={me.defaultCostCenter ?? ""} className={input} /></Field>}
            <label className="flex items-start gap-3 text-sm text-slate-ink"><input type="checkbox" name="marketing" defaultChecked={me.marketingOptIn} className="mt-1 h-4 w-4 accent-[#E06010]" /> Occasional service updates by email</label>
            <SubmitButton busy={profile.busy}>Save profile</SubmitButton>
          </form>
        </Card>

        <Card title="Password" action={<KeyRound className="h-5 w-5 text-orange" aria-hidden />}>
          <form onSubmit={changePassword} className="space-y-4" noValidate>
            {password.msg && <Alert tone={password.msg.tone}>{password.msg.text}</Alert>}
            <Field id="currentPassword" label="Current password" error={password.fields.currentPassword}><input {...aria("currentPassword", password.fields.currentPassword)} type="password" autoComplete="current-password" className={input} /></Field>
            <Field id="newPassword" label="New password" error={password.fields.newPassword} hint="10+ characters, letters plus numbers or symbols"><input {...aria("newPassword", password.fields.newPassword, "hint")} type="password" autoComplete="new-password" className={input} /></Field>
            <Field id="confirm" label="Confirm new password"><input {...aria("confirm")} type="password" autoComplete="new-password" className={input} /></Field>
            <SubmitButton busy={password.busy} className="btn-navy">Change password</SubmitButton>
          </form>
        </Card>
      </div>

      {(!me.company || me.company.accountStatus === "PROSPECT") && me.accountRole === "INDIVIDUAL" && (
        <Card title="Open a business account" action={<Building2 className="h-5 w-5 text-orange" aria-hidden />}>
          <p className="mb-5 max-w-2xl text-sm text-slate-ink">For hotels, resorts, DMCs, corporate travel programs, teams, event organizers and commercial clients: centralized invoicing, PO and cost-center support, authorized users, shared locations and a concierge desk for hotels.</p>
          <form onSubmit={apply} className="grid gap-4 md:grid-cols-2" noValidate>
            {business.msg && <div className="md:col-span-2"><Alert tone={business.msg.tone}>{business.msg.text}</Alert></div>}
            <Field id="companyName" label="Company name" error={business.fields.companyName}><input {...aria("companyName", business.fields.companyName)} defaultValue={me.company?.name ?? ""} className={input} /></Field>
            <Field id="accountType" label="Type of business" error={business.fields.accountType}>
              <select {...aria("accountType", business.fields.accountType)} defaultValue="" className={input}><option value="" disabled>Choose…</option>{ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
            <Field id="billingEmail" label="Billing email" error={business.fields.billingEmail}><input {...aria("billingEmail", business.fields.billingEmail)} type="email" className={input} /></Field>
            <Field id="volume" label="Expected volume" optional><input {...aria("volume")} placeholder="e.g. 40 guest transfers a month" className={input} /></Field>
            <div className="md:col-span-2"><Field id="notes" label="Anything we should know?" optional><textarea {...aria("notes")} rows={3} className={input} /></Field></div>
            <label className="flex items-center gap-3 text-sm text-slate-ink md:col-span-2"><input type="checkbox" name="poRequired" className="h-4 w-4 accent-[#E06010]" /> We require a PO number on every booking</label>
            <div className="md:col-span-2"><SubmitButton busy={business.busy}>Submit application</SubmitButton></div>
          </form>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------- Company -------------------------------- */
type CompanyUser = { id: string; name: string; email: string; accountRole: string; lastLoginAt: string | null; status: string; isYou: boolean };
const ROLE_LABEL: Record<string, string> = { COMPANY_ADMIN: "Administrator", COMPANY_USER: "Team member", CONCIERGE: "Concierge desk" };

export function CompanyPage() {
  const { me, refresh } = useMe();
  const [users, setUsers] = useState<CompanyUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settings = useSubmit();
  const invite = useSubmit();
  const load = () => portal<{ users: CompanyUser[] }>("/company/users").then((r) => setUsers(r.users)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (!me.company || me.accountRole !== "COMPANY_ADMIN") return <Alert>Only company administrators can manage the company account.</Alert>;
  const company = me.company;

  const saveSettings = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    settings.run(async () => {
      await portal("/company", { method: "PATCH", json: { billingEmail: fd.get("billingEmail"), poRequired: fd.get("poRequired") === "on" } });
      await refresh();
      return "Company settings saved.";
    });
  };
  const sendInvite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    invite.run(async () => {
      await portal("/company/users", { method: "POST", json: { name: fd.get("inviteName"), email: fd.get("inviteEmail"), role: fd.get("inviteRole") } });
      form.reset();
      load();
      return "Invitation sent.";
    });
  };
  const update = async (u: CompanyUser, body: object) => {
    try {
      await portal(`/company/users/${u.id}`, { method: "PATCH", json: body });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageTitle title={company.name} sub={`Business account · ${company.accountStatus === "ACTIVE" ? "active" : company.accountStatus.toLowerCase()}${company.paymentTermsDays ? ` · net ${company.paymentTermsDays} terms` : ""}`} />
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Account settings" action={<Building2 className="h-5 w-5 text-orange" aria-hidden />}>
          <form onSubmit={saveSettings} className="space-y-4" noValidate>
            {settings.msg && <Alert tone={settings.msg.tone}>{settings.msg.text}</Alert>}
            <Field id="billingEmail" label="Billing email" error={settings.fields.billingEmail} hint="Invoices are sent here."><input {...aria("billingEmail", settings.fields.billingEmail, "hint")} type="email" defaultValue={company.billingEmail ?? ""} className={input} /></Field>
            <label className="flex items-center gap-3 text-sm text-slate-ink"><input type="checkbox" name="poRequired" defaultChecked={company.poRequired} className="h-4 w-4 accent-[#E06010]" /> Require a PO number on every booking request</label>
            <p className="text-xs text-muted">Payment terms, credit limits and negotiated rates are set with our office.</p>
            <SubmitButton busy={settings.busy}>Save settings</SubmitButton>
          </form>
        </Card>
        <Card title="Invite a colleague" action={<UserPlus className="h-5 w-5 text-orange" aria-hidden />}>
          <form onSubmit={sendInvite} className="space-y-4" noValidate>
            {invite.msg && <Alert tone={invite.msg.tone}>{invite.msg.text}</Alert>}
            <Field id="inviteName" label="Name" error={invite.fields.name}><input {...aria("inviteName", invite.fields.name)} className={input} /></Field>
            <Field id="inviteEmail" label="Email" error={invite.fields.email}><input {...aria("inviteEmail", invite.fields.email)} type="email" className={input} /></Field>
            <Field id="inviteRole" label="Role" hint="Team members see their own bookings. Administrators and concierge desks see all company bookings.">
              <select {...aria("inviteRole", undefined, "hint")} defaultValue="COMPANY_USER" className={input}>
                <option value="COMPANY_USER">Team member</option>
                {["hotel", "resort", "dmc"].includes(company.accountType ?? "") && <option value="CONCIERGE">Concierge desk</option>}
                <option value="COMPANY_ADMIN">Administrator</option>
              </select>
            </Field>
            <SubmitButton busy={invite.busy} className="btn-navy"><Mail className="h-4 w-4" aria-hidden /> Send invitation</SubmitButton>
          </form>
        </Card>
      </div>
      <Card title="Authorized users">
        {!users ? <Loading /> : (
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="grid grid-cols-1 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-50 text-navy"><UserRound className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy">{u.name}{u.isYou && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}</p>
                    <p className="truncate text-sm text-slate-ink">{u.email} · last sign-in {u.lastLoginAt ? dateTime(u.lastLoginAt) : "never"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={u.status} />
                  <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.name}</label>
                  <select id={`role-${u.id}`} value={u.accountRole} disabled={u.isYou} onChange={(e) => update(u, { role: e.target.value })} className={`${input} !w-auto !py-1.5 !text-sm`}>
                    {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {!u.isYou && (u.status === "DEACTIVATED"
                    ? <button onClick={() => update(u, { active: true })} className="btn-ghost !py-1.5 !text-xs">Reactivate</button>
                    : <button onClick={() => window.confirm(`Deactivate ${u.name}? They will lose access immediately.`) && update(u, { active: false })} className="btn-ghost !py-1.5 !text-xs">Deactivate</button>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
