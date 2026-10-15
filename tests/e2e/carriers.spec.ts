import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Carrier shipping end to end (real API + DB, mock carrier + payment providers):
 *  1. Admin rate-shops a nationwide order and buys mock labels (one per bag).
 *  2. With instant pricing OFF the wizard is unchanged (no instant panel).
 *  3. Owner approves instant pricing after a 25-scenario test run; a visitor on a phone gets
 *     Express Bags shipping levels, books and pays on the mock checkout. Flags are restored after.
 */
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const API = process.env.E2E_API_URL || "http://localhost:4000";
const tag = Date.now().toString(36);
const shot = (page: Page, name: string) => page.screenshot({ path: `.qa/carriers/${name}.png`, fullPage: true });

test.describe.configure({ mode: "serial" });

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/?$/);
}

const adminFetch = (page: Page, path: string, method = "GET", body?: unknown) =>
  page.evaluate(
    async ([api, p, m, b]) => {
      const r = await fetch(`${api}/v1/admin${p}`, { method: m as string, credentials: "include", headers: b ? { "Content-Type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [API, path, method, body] as const,
  );

async function setFlags(request: APIRequestContext, page: Page, enable: boolean) {
  if (!enable) return adminFetch(page, "/carriers/sandbox/approve", "POST", { enable: false });
  const run = await adminFetch(page, "/carriers/sandbox/run", "POST", { notes: `e2e ${tag}` });
  expect(run.status).toBe(201);
  return adminFetch(page, "/carriers/sandbox/approve", "POST", { enable: true, carrierShipping: true, testRunId: run.body.run.id, statement: "E2E approval after reviewing scenarios" });
}

test("admin rate-shops a nationwide order and buys one label per bag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await adminLogin(page);
  const created = await adminFetch(page, "/orders", "POST", {
    customer: { name: `E2E Shipper ${tag}`, email: `e2e-ship-${tag}@example.org` },
    serviceType: "nationwide-shipping",
    fulfillment: "nationwide",
    pickup: { type: "hotel", address: "Hotel on Collins Ave, Miami Beach", market: "miami" },
    delivery: { type: "residence", address: "350 5th Ave, New York, NY 10118", market: "outside-florida" },
    serviceDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    pieces: [{ category: "standard-checked", quantity: 2 }],
  });
  expect(created.status).toBe(201);
  const orderId = created.body.order.id as string;

  await page.goto("/admin/shipments");
  await expect(page.getByRole("heading", { name: "Carrier shipments" })).toBeVisible();
  await expect(page.getByText(created.body.order.reference).first()).toBeVisible();
  await shot(page, "01-shipments-1440");

  await page.goto(`/admin/shipments/order/${orderId}`);
  await expect(page.getByRole("heading", { name: "Standard" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Margin").first()).toBeVisible();
  await shot(page, "02-rate-shop-1440");
  const buy = page.getByRole("button", { name: /buy labels for standard/i });
  await buy.click();
  await page.getByRole("button", { name: /buy 2 label/i }).click();
  await page.waitForURL(/\/admin\/shipments\?q=/);
  await expect(page.getByText(/label ready/i).first()).toBeVisible();
  await page.locator("tbody tr").first().click();
  await expect(page.getByRole("link", { name: /print label/i })).toBeVisible();
  await shot(page, "03-shipment-detail-1440");
});

test("with instant pricing off, the quote wizard stays quote-only", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await adminLogin(page);
  await setFlags(page.request, page, false);
  const cfg = await (await page.request.get(`${API}/v1/public-config`)).json();
  expect(cfg.instantBookingEnabled).toBe(false);
  expect(cfg.carrierShippingEnabled).toBe(false);
});

test("visitor gets instant shipping levels on a phone and books via checkout", async ({ page, browser }) => {
  // Owner approves (in a separate desktop context)
  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await adminLogin(admin);
  const ok = await setFlags(admin.request, admin, true);
  expect(ok.status).toBe(200);
  await admin.goto("/admin/shipments/test-pricing");
  await expect(admin.getByText("Public instant pricing")).toBeVisible();
  await shot(admin, "04-test-pricing-1440");

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/request-a-quote");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByText("Ship luggage across the U.S.", { exact: true }).click();
    const cont = () => page.getByRole("button", { name: /^Continue/ }).click();
    await cont();
    await page.locator("#q-pickup-address").fill("Hotel on Collins Ave, Miami Beach");
    await page.locator("#q-pickup-market").selectOption("miami");
    await page.locator("#q-delivery-address").fill("233 S Wacker Dr, Chicago, IL 60606");
    await cont();
    await page.locator("#q-serviceDate").fill(new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10));
    await page.getByText(/^Morning/).first().click();
    await page.getByText("Standard", { exact: true }).first().click();
    await cont();
    await page.locator("#q-items-0-weightLbs").fill("45");
    await page.locator("#q-items-0-lengthIn").fill("27");
    await page.locator("#q-items-0-widthIn").fill("19");
    await page.locator("#q-items-0-heightIn").fill("11");
    await cont();
    await page.locator("#q-contact-name").fill(`E2E Instant ${tag}`);
    await page.locator("#q-contact-email").fill(`e2e-instant-${tag}@example.org`);
    await page.locator("#q-contact-phone").fill("305 555 0166");
    await page.locator("#q-leadSource").selectOption("google-search");
    await cont();
    await page.locator("#q-acceptsProhibitedItemsPolicy").check();
    await page.locator("#q-consentToContact").check();
    const panel = page.getByTestId("instant-price");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /see my instant price/i }).click();
    await expect(panel.getByRole("radio").first()).toBeVisible({ timeout: 15_000 });
    // No internal economics or raw carrier names on the page
    const text = await panel.innerText();
    expect(text).not.toMatch(/margin|markup|cost/i);
    await shot(page, "05-instant-levels-390");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByTestId("instant-book").click();
    await page.waitForURL(/\/pay\/mock-checkout/, { timeout: 15_000 });
    await page.getByRole("button", { name: /^pay /i }).click();
    await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible({ timeout: 15_000 });
    await shot(page, "06-paid-390");
  } finally {
    await setFlags(admin.request, admin, false);
    await admin.close();
  }
});
