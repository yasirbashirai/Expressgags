"use client";

/**
 * Portal sign-in screens: login, register, verify email, forgot/reset password, accept company invite.
 * All forms: labeled inputs, inline API field errors, busy states, generic messages that never reveal accounts.
 */
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, ClipboardCheck, FileText, MapPin, PackageSearch, ShieldCheck } from "lucide-react";
import { contact } from "@/content/site";
import { portal, PortalError } from "./api";
import { Alert, aria, Field, input, SubmitButton } from "./ui";

/* --------------------------------- Frame --------------------------------- */
const PERKS = [
  { Icon: PackageSearch, text: "Live order status and proof of delivery" },
  { Icon: FileText, text: "Quotes, invoices and receipts in one place" },
  { Icon: ClipboardCheck, text: "Book again in a few taps" },
  { Icon: MapPin, text: "Saved hotels, ports and pickup locations" },
];

export function AuthFrame({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="bg-cloud">
      <div className="container-eb grid items-stretch gap-8 py-10 md:py-16 lg:grid-cols-2">
        <div className="relative hidden overflow-hidden rounded-[2rem] bg-navy p-10 text-white lg:block">
          <div aria-hidden className="absolute -bottom-28 -right-28 h-96 w-96 rounded-full border-[3px] border-orange/60" />
          <div aria-hidden className="absolute -bottom-10 -right-10 h-60 w-60 rounded-full border border-white/10" />
          <Image src="/brand/express-bags-logo-reversed.png" alt="" width={600} height={244} className="h-14 w-auto" />
          <p className="eyebrow mt-12 !text-orange-100">Client portal</p>
          <p className="mt-4 max-w-sm font-display text-4xl font-extrabold leading-tight">Every bag, every handoff, on record.</p>
          <ul className="mt-10 space-y-4">
            {PERKS.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/85">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><Icon className="h-4 w-4 text-orange" aria-hidden /></span>
                {text}
              </li>
            ))}
          </ul>
          <p className="relative mt-12 flex items-center gap-2 text-xs text-white/60"><ShieldCheck className="h-4 w-4" aria-hidden /> Your information stays private to you and your company.</p>
        </div>
        <div className="flex items-center">
          <div className="w-full rounded-[2rem] border border-line bg-white p-6 shadow-[var(--shadow-lift)] sm:p-10">
            <h1 className="text-3xl font-extrabold">{title}</h1>
            {sub && <p className="mt-2 text-slate-ink">{sub}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

type Errors = Record<string, string>;
const useForm = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Errors>({});
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await fn();
    } catch (e) {
      const pe = e as PortalError;
      setError(pe.message);
      if (pe instanceof PortalError) setFields(pe.fields);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, run, setError };
};

const safeNext = (n: string | null) => (n && n.startsWith("/account") && !n.startsWith("//") ? n : "/account");

/* --------------------------------- Login --------------------------------- */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const f = useForm();
  const [unverified, setUnverified] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    f.run(async () => {
      try {
        await portal("/auth/login", { method: "POST", json: { email, password: fd.get("password") } });
        router.replace(safeNext(params.get("next")));
      } catch (err) {
        if (err instanceof PortalError && err.status === 403) setUnverified(email);
        throw err;
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {params.get("reset") === "1" && <Alert tone="success">Your password was updated. Please sign in.</Alert>}
      {f.error && <Alert>{f.error}</Alert>}
      {unverified && (
        <Alert tone="info">
          {resent ? "A new confirmation link is on its way." : (
            <button type="button" className="font-semibold underline" onClick={async () => { await portal("/auth/resend-verification", { method: "POST", json: { email: unverified } }).catch(() => undefined); setResent(true); }}>
              Send me a new confirmation link
            </button>
          )}
        </Alert>
      )}
      <Field id="email" label="Email"><input {...aria("email")} type="email" autoComplete="email" required className={input} /></Field>
      <Field id="password" label="Password"><input {...aria("password")} type="password" autoComplete="current-password" required className={input} /></Field>
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/account/forgot" className="font-semibold text-orange-700 hover:underline">Forgot password?</Link>
      </div>
      <SubmitButton busy={f.busy} className="btn-primary w-full !py-3.5">Sign in</SubmitButton>
      <p className="text-center text-sm text-slate-ink">New to Express Bags? <Link href="/account/register" className="font-semibold text-orange-700 hover:underline">Create an account</Link></p>
    </form>
  );
}

/* -------------------------------- Register ------------------------------- */
export function RegisterForm() {
  const f = useForm();
  const [done, setDone] = useState<string | null>(null);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm")) {
      f.setError("The two passwords do not match.");
      return;
    }
    f.run(async () => {
      const r = await portal<{ message: string }>("/auth/register", {
        method: "POST",
        json: { name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"), password: fd.get("password"), marketingOptIn: fd.get("marketing") === "on", website: fd.get("website") },
      });
      setDone(r.message);
    });
  };

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{done}</Alert>
        <p className="text-sm text-slate-ink">Open the link in the email and enter the same password to activate your account. The link expires in 24 hours.</p>
        <Link href="/account/login" className="btn-ghost">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {f.error && <Alert>{f.error}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Full name" error={f.fields.name}><input {...aria("name", f.fields.name)} autoComplete="name" required className={input} /></Field>
        <Field id="phone" label="Phone" error={f.fields.phone}><input {...aria("phone", f.fields.phone)} type="tel" autoComplete="tel" required className={input} /></Field>
      </div>
      <Field id="email" label="Email" error={f.fields.email} hint="Use the email you give us on quote requests so your history appears automatically.">
        <input {...aria("email", f.fields.email, "hint")} type="email" autoComplete="email" required className={input} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="password" label="Password" error={f.fields.password} hint="10+ characters, letters plus numbers or symbols">
          <input {...aria("password", f.fields.password, "hint")} type="password" autoComplete="new-password" required minLength={10} className={input} />
        </Field>
        <Field id="confirm" label="Confirm password"><input {...aria("confirm")} type="password" autoComplete="new-password" required className={input} /></Field>
      </div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-3 text-sm text-slate-ink">
        <input type="checkbox" name="marketing" className="mt-1 h-4 w-4 rounded border-line accent-[#E06010]" />
        Send me occasional service updates from Express Bags (optional).
      </label>
      <SubmitButton busy={f.busy} className="btn-primary w-full !py-3.5">Create account</SubmitButton>
      <p className="text-center text-sm text-slate-ink">Already have an account? <Link href="/account/login" className="font-semibold text-orange-700 hover:underline">Sign in</Link></p>
    </form>
  );
}

/* --------------------------------- Verify -------------------------------- */
export function VerifyForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const f = useForm();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [masked, setMasked] = useState("");

  useEffect(() => {
    if (!token) return setState("invalid");
    portal<{ email: string }>(`/auth/verify/${encodeURIComponent(token)}`)
      .then((r) => { setMasked(r.email); setState("ready"); })
      .catch(() => setState("invalid"));
  }, [token]);

  if (state === "checking") return <p className="text-sm text-muted">Checking your link…</p>;
  if (state === "invalid") {
    return (
      <div className="space-y-4">
        <Alert>This confirmation link is invalid or has expired.</Alert>
        <p className="text-sm text-slate-ink">Sign in with your email and password and we will offer to send a new link.</p>
        <Link href="/account/login" className="btn-ghost">Go to sign in</Link>
      </div>
    );
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    f.run(async () => {
      await portal("/auth/verify", { method: "POST", json: { token, password: fd.get("password") } });
      router.replace("/account?welcome=1");
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Alert tone="info">Activating the account for <strong>{masked}</strong>. For your security, enter the password you chose when registering.</Alert>
      {f.error && <Alert>{f.error}</Alert>}
      <Field id="password" label="Password" error={f.fields.password}><input {...aria("password", f.fields.password)} type="password" autoComplete="current-password" required className={input} /></Field>
      <SubmitButton busy={f.busy} className="btn-primary w-full !py-3.5">Activate my account</SubmitButton>
    </form>
  );
}

/* --------------------------------- Forgot -------------------------------- */
export function ForgotForm() {
  const f = useForm();
  const [done, setDone] = useState<string | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    f.run(async () => {
      const r = await portal<{ message: string }>("/auth/forgot", { method: "POST", json: { email: fd.get("email") } });
      setDone(r.message);
    });
  };
  if (done) return <Alert tone="success">{done}</Alert>;
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {f.error && <Alert>{f.error}</Alert>}
      <Field id="email" label="Email"><input {...aria("email")} type="email" autoComplete="email" required className={input} /></Field>
      <SubmitButton busy={f.busy} className="btn-primary w-full !py-3.5">Email me a reset link</SubmitButton>
      <p className="text-center text-sm"><Link href="/account/login" className="font-semibold text-orange-700 hover:underline">Back to sign in</Link></p>
    </form>
  );
}

/* --------------------------------- Reset --------------------------------- */
export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const f = useForm();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm")) return f.setError("The two passwords do not match.");
    f.run(async () => {
      await portal("/auth/reset", { method: "POST", json: { token, password: fd.get("password") } });
      router.replace("/account/login?reset=1");
    });
  };
  if (!token) return <Alert>This reset link is incomplete. Please request a new one.</Alert>;
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {f.error && <Alert>{f.error}</Alert>}
      <Field id="password" label="New password" error={f.fields.password} hint="10+ characters, letters plus numbers or symbols">
        <input {...aria("password", f.fields.password, "hint")} type="password" autoComplete="new-password" required className={input} />
      </Field>
      <Field id="confirm" label="Confirm new password"><input {...aria("confirm")} type="password" autoComplete="new-password" required className={input} /></Field>
      <SubmitButton busy={f.busy} className="btn-primary w-full !py-3.5">Save new password</SubmitButton>
    </form>
  );
}

/* ------------------------------ Accept invite ---------------------------- */
export function SetupForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const f = useForm();
  const [invite, setInvite] = useState<{ name: string; email: string; company: string | null } | null | "invalid">(null);
  useEffect(() => {
    if (!token) return setInvite("invalid");
    portal<{ name: string; email: string; company: string | null }>(`/auth/invite/${encodeURIComponent(token)}`).then(setInvite).catch(() => setInvite("invalid"));
  }, [token]);
  if (invite === null) return <p className="text-sm text-muted">Checking your invitation…</p>;
  if (invite === "invalid") return <Alert>This invitation is invalid or has expired. Ask your administrator to send a new one, or call {contact.phoneDisplay}.</Alert>;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm")) return f.setError("The two passwords do not match.");
    f.run(async () => {
      await portal("/auth/invite", { method: "POST", json: { token, name: fd.get("name"), phone: fd.get("phone"), password: fd.get("password") } });
      router.replace("/account?welcome=1");
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Alert tone="info">
        <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" aria-hidden /> {invite.company ? `Joining ${invite.company} as ${invite.email}` : `Setting up ${invite.email}`}</span>
      </Alert>
      {f.error && <Alert>{f.error}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Full name" error={f.fields.name}><input {...aria("name", f.fields.name)} defaultValue={invite.name} autoComplete="name" required className={input} /></Field>
        <Field id="phone" label="Phone" optional><input {...aria("phone")} type="tel" autoComplete="tel" className={input} /></Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="password" label="Password" error={f.fields.password} hint="10+ characters, letters plus numbers or symbols">
          <input {...aria("password", f.fields.password, "hint")} type="password" autoComplete="new-password" required className={input} />
        </Field>
        <Field id="confirm" label="Confirm password"><input {...aria("confirm")} type="password" autoComplete="new-password" required className={input} /></Field>
      </div>
      <SubmitButton busy={f.busy} className="btn-primary w-full !py-3.5">Create my login</SubmitButton>
    </form>
  );
}
