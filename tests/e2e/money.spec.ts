import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Money flow, end to end (real API + DB, mock payment provider):
 * quote request → admin builds quotation → customer accepts (e-signature) → deposit on checkout →
 * admin invoices the order → customer pays the invoice → dashboard shows revenue.
 */
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const API = process.env.E2E_API_URL || "http://localhost:4000";
const tag = Date.now().toString(36);
const shot = (page: Page, name: string) => page.screenshot({ path: `.qa/money/${name}.png`, fullPage: true });

test.describe.configure({ mode: "serial" });

let quoteId = "";
let customerLink = "";
let orderRef = "";

test("admin builds and sends a quotation from a quote request", async ({ page, request }) => {
  const q = await request.post(`${API}/v1/quotes`, {
    data: {
      serviceType: "luggage-local",
      pickup: { type: "hotel", address: "Hotel on Brickell Avenue, Miami", market: "miami" },
      delivery: { type: "cruise-port", address: "PortMiami Terminal B", facility: "portmiami", market: "miami" },
      serviceDate: "2026-12-12",
      timeWindow: "morning",
      items: [{ category: "standard-checked", quantity: 6 }],
      contact: { name: `E2E Money ${tag}`, email: `e2e-money-${tag}@example.org`, phone: "305 555 0199" },
      leadSource: "hotel-concierge",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    },
  });
  expect(q.status()).toBe(201);
  const reference = (await q.json()).reference as string;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/?$/);
  await shot(page, "01-dashboard");

  // Find the quote request id via the admin API (same session cookie)
  const list = await page.evaluate(async ([api, ref]) => (await (await fetch(`${api}/v1/admin/quotes?q=${ref}`, { credentials: "include" })).json()), [API, reference]);
  quoteId = (list.quotes ?? list.items ?? []).find((x: { reference: string }) => x.reference === reference)?.id;
  expect(quoteId).toBeTruthy();

  await page.goto(`/admin/quotations/new?quoteRequestId=${quoteId}`);
  await expect(page.getByText(`From quote request ${reference}`)).toBeVisible();
  await page.getByRole("button", { name: /suggest from engine/i }).click();
  await expect(page.locator("#d-0")).not.toHaveValue("");
  await page.locator("#qt-dep").selectOption("percent");
  await page.locator("#qt-depv").fill("25");
  await shot(page, "02-builder");
  await page.getByRole("button", { name: /save and send/i }).click();
  await page.waitForURL(/\/admin\/quotations\/[a-z0-9]+$/);
  const linkText = await page.getByText(/Customer link:/).first().textContent();
  customerLink = linkText!.replace(/^.*Customer link:\s*/, "").trim();
  expect(customerLink).toMatch(/\/q\/[2-9A-HJ-NP-Z]{32}$/);
  await shot(page, "03-quotation-sent");
});

test("customer accepts on a phone and pays the deposit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL(customerLink).pathname);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Awaiting your approval")).toBeVisible();
  // No internal economics on the customer page
  await expect(page.getByText(/margin|markup|internal cost/i)).toHaveCount(0);
  await shot(page, "04-customer-quotation-390");
  await page.locator("#acc-name").fill(`E2E Money ${tag}`);
  await page.locator("#acc-title").fill("Travel coordinator");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /accept and pay/i }).click();
  await page.waitForURL(/\/pay\/mock-checkout/);
  await shot(page, "05-mock-checkout-390");
  await page.getByRole("button", { name: /^pay /i }).click();
  await page.waitForURL(/\/pay\/success/);
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await shot(page, "06-paid-390");

  await page.goto(new URL(customerLink).pathname);
  await expect(page.getByText(/Accepted, thank you/)).toBeVisible();
  const order = await page.getByText(/order reference is/).textContent();
  orderRef = order!.match(/EB-\d{6}-[A-Z0-9]{4}/)![0];
  await expect(page.getByText(/Deposit received/)).toBeVisible();
});

test("admin invoices the order and the customer pays online", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/?$/);

  await page.goto("/admin/billing?tab=new");
  await page.getByLabel("Filter orders").fill(orderRef);
  await page.getByRole("checkbox").first().check();
  await page.locator("#ni-po").fill(`PO-${tag}`);
  await shot(page, "07-new-invoice");
  await page.getByRole("button", { name: "Create and send" }).click();
  await page.waitForURL(/\/admin\/billing\/invoices\//);
  await expect(page.getByText("Less deposit received")).toBeVisible();
  await shot(page, "08-invoice-detail");
  const link = (await page.getByText(/Customer link:/).textContent())!.replace(/^.*Customer link:\s*/, "").trim();

  await page.goto(new URL(link).pathname);
  await expect(page.getByText("Balance due").first()).toBeVisible();
  await shot(page, "09-customer-invoice");
  await page.getByRole("button", { name: /pay online/i }).click();
  await page.waitForURL(/\/pay\/mock-checkout/);
  await page.getByRole("button", { name: /^pay /i }).click();
  await page.waitForURL(/\/pay\/success/);
  await page.goto(new URL(link).pathname);
  await expect(page.getByText("Paid in full").first()).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Revenue" })).toBeVisible();
  await expect(page.getByText("Collected").first()).toBeVisible();
  await shot(page, "10-dashboard-after");
  await page.goto("/admin/reports");
  await expect(page.getByText("Booked revenue")).toBeVisible();
  await shot(page, "11-reports");
});
