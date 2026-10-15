/**
 * Best-effort parsing of the free-text addresses customers type in the quote wizard into the
 * structured address carrier platforms need ("street, city, ST 12345" or "City, ST", or a ZIP).
 * Staff confirm the exact address before a label is purchased; this is enough for rating.
 */
import type { Address } from "../../providers";

const STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" "));

/** Common non-US destinations travelers type (country → ISO code). Extend as needed. */
const COUNTRIES: [RegExp, string][] = [
  [/\b(canada)\b/i, "CA"], [/\b(mexico|méxico)\b/i, "MX"], [/\b(united kingdom|uk|england|london)\b/i, "GB"],
  [/\b(spain|españa|madrid|barcelona)\b/i, "ES"], [/\b(france|paris)\b/i, "FR"], [/\b(germany|deutschland)\b/i, "DE"],
  [/\b(italy|italia|rome|milan)\b/i, "IT"], [/\b(brazil|brasil)\b/i, "BR"], [/\b(colombia|bogot[aá])\b/i, "CO"],
  [/\b(argentina)\b/i, "AR"], [/\b(bahamas|nassau)\b/i, "BS"], [/\b(jamaica)\b/i, "JM"], [/\b(dominican republic)\b/i, "DO"],
];

export type ParsedAddress = Address & { confident: boolean };

export function parseAddress(text: string, fallback?: Partial<Address>): ParsedAddress {
  const raw = text.trim().replace(/\s+/g, " ");
  for (const [re, iso] of COUNTRIES) {
    if (re.test(raw)) {
      const parts = raw.split(",").map((s) => s.trim());
      return { street1: parts[0] || raw, city: parts.length > 1 ? parts[parts.length - 2] : parts[0], state: "", zip: (raw.match(/\b[A-Z0-9]{3,4}\s?[A-Z0-9]{3}\b/i)?.[0] ?? "").toUpperCase(), country: iso, confident: false };
    }
  }
  const zip = raw.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? "";
  const stateMatch = raw.match(/,?\s*\b([A-Z]{2})\b\s*(\d{5})?\s*$/) ?? raw.match(/,\s*([A-Za-z]{2})\b/);
  const state = stateMatch && STATES.has(stateMatch[1].toUpperCase()) ? stateMatch[1].toUpperCase() : (fallback?.state ?? "");
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  let street1 = parts[0] ?? raw;
  let city = fallback?.city ?? "";
  if (parts.length >= 3) city = parts[parts.length - 2];
  else if (parts.length === 2) {
    // "Street, City ST ZIP" or "City, ST ZIP"
    const tail = parts[1].replace(/\b[A-Z]{2}\b\s*\d{5}(-\d{4})?$/, "").trim();
    if (/^\d/.test(parts[0])) city = tail || city;
    else {
      city = parts[0];
      street1 = parts[0];
    }
  }
  return {
    street1,
    city,
    state,
    zip: zip || (fallback?.zip ?? ""),
    country: "US",
    confident: Boolean(zip && state),
  };
}

export const isInternational = (a: Address) => (a.country ?? "US") !== "US";
