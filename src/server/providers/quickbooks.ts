/**
 * QuickBooks Online adapter (REST via fetch, OAuth2 refresh-token flow).
 * Active when QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REALM_ID and QBO_REFRESH_TOKEN are set.
 * QBO_ENV=production switches from the sandbox API. The QuickBooks company belongs to Express Bags, Inc.
 * Note: Intuit rotates refresh tokens; the newest one is kept in memory and logged as a reminder
 * to update QBO_REFRESH_TOKEN (a secret store should persist it in production).
 */
import type { AccountingProvider } from "./index";
import { registerProvider } from "./registry";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const apiBase = () =>
  process.env.QBO_ENV === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";

let access: { token: string; expiresAt: number } | null = null;
let refreshToken = process.env.QBO_REFRESH_TOKEN || "";

async function accessToken() {
  if (access && access.expiresAt > Date.now() + 60_000) return access.token;
  const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`QuickBooks auth failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    refreshToken = data.refresh_token;
    console.warn("[quickbooks] refresh token rotated — update QBO_REFRESH_TOKEN in the secret store.");
  }
  access = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return access.token;
}

async function qbo<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${apiBase()}/v3/company/${process.env.QBO_REALM_ID}${path}${path.includes("?") ? "&" : "?"}minorversion=73`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json", "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`QuickBooks ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

const esc = (s: string) => s.replace(/'/g, "\\'");
const dollars = (c: number) => Math.round(c) / 100;

export const quickbooksProvider: AccountingProvider = {
  name: "quickbooks",
  async upsertCustomer(c) {
    const display = (c.companyName ? `${c.companyName} (${c.name})` : c.name).slice(0, 100);
    const found = await qbo<{ QueryResponse: { Customer?: { Id: string }[] } }>(
      `/query?query=${encodeURIComponent(`select Id from Customer where PrimaryEmailAddr = '${esc(c.email)}'`)}`,
    );
    const existing = found.QueryResponse.Customer?.[0];
    if (existing) return { qboId: existing.Id };
    const created = await qbo<{ Customer: { Id: string } }>("/customer", {
      method: "POST",
      body: { DisplayName: display, CompanyName: c.companyName, GivenName: c.name, PrimaryEmailAddr: { Address: c.email } },
    });
    return { qboId: created.Customer.Id };
  },
  async pushInvoice(inv) {
    const created = await qbo<{ Invoice: { Id: string } }>("/invoice", {
      method: "POST",
      body: {
        DocNumber: inv.number.slice(0, 21),
        CustomerRef: { value: inv.qboCustomerId },
        DueDate: inv.dueAt?.slice(0, 10),
        Line: inv.lines.map((l) => ({
          DetailType: "SalesItemLineDetail",
          Amount: dollars(l.amountCents),
          Description: l.description.slice(0, 4000),
          SalesItemLineDetail: { ItemRef: { value: process.env.QBO_SERVICE_ITEM_ID || "1" } },
        })),
      },
    });
    return { qboId: created.Invoice.Id };
  },
  async pushPayment(p) {
    const created = await qbo<{ Payment: { Id: string } }>("/payment", {
      method: "POST",
      body: {
        CustomerRef: { value: p.qboCustomerId },
        TotalAmt: dollars(p.amountCents),
        TxnDate: p.date.slice(0, 10),
        Line: [{ Amount: dollars(p.amountCents), LinkedTxn: [{ TxnId: p.qboInvoiceId, TxnType: "Invoice" }] }],
      },
    });
    return { qboId: created.Payment.Id };
  },
};

if (process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_REALM_ID && process.env.QBO_REFRESH_TOKEN) {
  registerProvider("accounting", () => quickbooksProvider);
}
