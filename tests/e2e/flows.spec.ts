import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** Real end-to-end flows: website → Express API → Postgres → admin panel. Nothing is mocked. */

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const stamp = Date.now().toString(36);
const cont = (page: Page) => page.getByRole("button", { name: /^Continue/ }).click();

test.describe.configure({ mode: "serial" });
let quoteRef = "";

test("traveler books an airport luggage quote on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/request-a-quote");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText("Airport luggage", { exact: true }).click();
  await cont(page);
  await page.locator("#q-pickup-facility").selectOption("MIA");
  await page.locator("#q-delivery-address").fill("Hotel on Brickell Avenue, Miami");
  await page.locator("#q-delivery-market").selectOption("miami");
  await cont(page);
  await page.locator("#q-serviceDate").fill("2026-11-20");
  await page.getByText("Morning (8 AM – 12 PM)").click();
  await cont(page);
  await page.getByRole("button", { name: "Increase quantity" }).first().click();
  await page.locator("#q-flightDetails").fill("AA 1234 arriving 10:15 AM");
  await cont(page);
  await page.locator("#q-contact-name").fill(`E2E Traveler ${stamp}`);
  await page.locator("#q-contact-email").fill(`e2e-${stamp}@example.com`);
  await page.locator("#q-contact-phone").fill("305 555 0100");
  await page.locator("#q-leadSource").selectOption("google-search");
  await cont(page);
  await page.locator("#q-acceptsProhibitedItemsPolicy").check();
  await page.locator("#q-consentToContact").check();
  await page.getByRole("button", { name: "Send quote request" }).click();
  const ref = page.getByTestId("quote-reference");
  await expect(ref).toHaveText(/^EB-Q-\d{6}-[A-Z0-9]{4}$/, { timeout: 15_000 });
  quoteRef = (await ref.textContent()) ?? "";
});

test("contact form reaches the API", async ({ page }) => {
  await page.goto("/contact");
  await page.locator("#c-name").fill(`E2E Contact ${stamp}`);
  await page.locator("#c-phone").fill("305 555 0101");
  await page.locator("#c-email").fill(`contact-${stamp}@example.com`);
  await page.locator("#c-topic").selectOption({ index: 1 });
  await page.locator("#c-message").fill("Checking that the contact form saves correctly.");
  await page.locator('form input[name="consent"]').first().check();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/contact")),
    page.getByRole("button", { name: /send/i }).click(),
  ]);
  expect(res.status()).toBe(201);
});

test("careers application with resume reaches the API", async ({ page }) => {
  await page.goto("/careers");
  await page.locator("#a-name").fill(`E2E Applicant ${stamp}`);
  await page.locator("#a-phone").fill("305 555 0102");
  await page.locator("#a-email").fill(`apply-${stamp}@example.com`);
  await page.locator("#a-role").selectOption({ index: 1 });
  await page.locator("#a-market").selectOption({ index: 1 });
  await page.locator("#a-resume").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%e2e test resume\n") });
  await page.locator('form input[name="consent"]').last().check();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/careers")),
    page.getByRole("button", { name: /submit|apply|send/i }).click(),
  ]);
  expect(res.status()).toBe(201);
});

test("owner signs in and finds the new quote in the admin inbox", async ({ page }) => {
  expect(quoteRef).not.toBe("");
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(\/)?$/, { timeout: 15_000 });
  await page.goto("/admin/quotes");
  await expect(page.getByText(quoteRef).first()).toBeVisible({ timeout: 15_000 });
});

test("public API never exposes prices while pricing is off", async ({ request }) => {
  const cfg = await (await request.get(`${process.env.E2E_API_URL || "http://localhost:4000"}/v1/public-config`)).json();
  expect(JSON.stringify(cfg)).not.toMatch(/price|markup|margin/i);
});
