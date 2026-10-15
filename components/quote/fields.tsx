"use client";

/**
 * Accessible form primitives for the quote wizard.
 * Every input uses its schema path as id (e.g. "pickup.address") so errors map 1:1 and
 * the wizard can focus the first invalid field.
 */
import type { ReactNode } from "react";
import { AlertCircle, Check } from "lucide-react";
import { useQuoteT } from "./i18n";

export const fieldId = (path: string) => `q-${path.replace(/\./g, "-")}`;
const errId = (path: string) => `${fieldId(path)}-error`;

const inputBase =
  "block w-full rounded-xl border bg-white px-4 py-3 text-base text-charcoal shadow-sm transition placeholder:text-muted/70 focus:border-navy focus:outline-none focus:ring-4 focus:ring-navy/10";

function cls(error?: string) {
  return `${inputBase} ${error ? "border-red-500 ring-2 ring-red-100" : "border-line hover:border-navy/30"}`;
}

export function FieldShell({
  path,
  label,
  hint,
  error,
  optional,
  children,
  className = "",
}: {
  path: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useQuoteT();
  return (
    <div className={className}>
      <label htmlFor={fieldId(path)} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-navy">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted">{t.optional}</span>}
      </label>
      {children}
      {hint && !error && <p id={`${fieldId(path)}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={errId(path)} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (path: string, error?: string, hint?: string) =>
  [error ? errId(path) : null, hint && !error ? `${fieldId(path)}-hint` : null].filter(Boolean).join(" ") || undefined;

export function TextField({
  path,
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  className,
  min,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel";
  className?: string;
  min?: string;
}) {
  return (
    <FieldShell path={path} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input
        id={fieldId(path)}
        name={path}
        type={type}
        value={value}
        min={min}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(path, error, hint)}
        className={cls(error)}
      />
    </FieldShell>
  );
}

export function TextArea({
  path,
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  placeholder,
  rows = 3,
  className,
}: {
  path: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <FieldShell path={path} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea
        id={fieldId(path)}
        name={path}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(path, error, hint)}
        className={cls(error)}
      />
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  path,
  label,
  value,
  onChange,
  options,
  error,
  hint,
  optional,
  placeholder,
  className,
}: {
  path: string;
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  error?: string;
  hint?: string;
  optional?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useQuoteT();
  return (
    <FieldShell path={path} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select
        id={fieldId(path)}
        name={path}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(path, error, hint)}
        className={`${cls(error)} appearance-none bg-[length:1.1rem] bg-[right_1rem_center] bg-no-repeat pr-10`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23002858' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        <option value="" disabled>
          {placeholder ?? t.select}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckField({
  path,
  label,
  checked,
  onChange,
  error,
  children,
}: {
  path: string;
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={fieldId(path)}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
          checked ? "border-navy bg-navy-50" : error ? "border-red-500 bg-red-50/40" : "border-line bg-white hover:border-navy/30"
        }`}
      >
        <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
          <input
            id={fieldId(path)}
            name={path}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId(path) : undefined}
            className="peer h-5 w-5 appearance-none rounded-md border-2 border-navy/40 bg-white checked:border-navy checked:bg-navy"
          />
          <Check className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" aria-hidden strokeWidth={3} />
        </span>
        <span className="text-sm leading-relaxed text-charcoal">
          {label}
          {children}
        </span>
      </label>
      {error && (
        <p id={errId(path)} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

/** Segmented single-choice (radio group) rendered as large tap-friendly pills. */
export function ChoicePills<T extends string>({
  path,
  legend,
  value,
  onChange,
  options,
  error,
  hint,
}: {
  path: string;
  legend: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  error?: string;
  hint?: string;
}) {
  return (
    <fieldset aria-describedby={error ? errId(path) : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-navy">{legend}</legend>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div id={fieldId(path)} tabIndex={-1} className="grid grid-cols-1 gap-2 outline-none sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-orange/40 ${
                active ? "border-navy bg-navy text-white" : error ? "border-red-400 bg-white" : "border-line bg-white hover:border-navy/30"
              }`}
            >
              <input type="radio" name={path} value={o.value} checked={active} onChange={() => onChange(o.value)} className="sr-only" />
              <span
                aria-hidden
                className={`h-4 w-4 shrink-0 rounded-full border-2 ${active ? "border-white bg-orange shadow-[inset_0_0_0_3px_var(--color-navy)]" : "border-navy/30"}`}
              />
              <span>
                <span className="block font-semibold">{o.label}</span>
                {o.hint && <span className={`block text-xs ${active ? "text-white/75" : "text-muted"}`}>{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errId(path)} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </fieldset>
  );
}

export function Group({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-cloud/60 p-4 sm:p-6">
      <h3 className="text-base font-bold">{title}</h3>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}
