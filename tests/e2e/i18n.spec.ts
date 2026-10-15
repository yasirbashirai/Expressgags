import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { expect, test, type Page } from "@playwright/test";

/**
 * Spanish experience end to end (nothing mocked except where noted):
 *  - <html lang> is es-US on /es pages and en elsewhere (multiple root layouts, still static)
 *  - Spanish wizard from the /es CTA at 390px → Spanish success screen; the stored quote has language es
 *  - language toggle keeps entered data
 *  - protection picker hidden while the module is off; shown + stored when approved and enabled via API
 *  - storage availability hint on storage requests
 * Settings changed here (features.protectionEnabled, protectionPlans) are restored afterwards.
 */
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const API = process.env.E2E_API_URL || "http://localhost:4000";
const tag = randomBytes(3).toString("hex");

const db = async <T>(fn: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
};
const cont = (page: Page, label = /^Continuar/) => page.getByRole("button", { name: label }).click();

test.describe.configure({ mode: "serial" });

// Pre-answer the cookie banner ("necessary only") on any origin so it never covers the buttons under test
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem("eb-consent-v1")) localStorage.setItem("eb-consent-v1", JSON.stringify({ analytics: false, marketing: false, at: "2026-10-15T00:00:00.000Z", v: 1 }));
    } catch {
      /* storage unavailable */
    }
  });
});

let savedFeatures: unknown = null;
let savedPlans: unknown = null;
test.beforeAll(async () => {
  await db(async (c) => {
    savedFeatures = (await c.query(`SELECT value FROM "Setting" WHERE key = 'features'`)).rows[0]?.value ?? null;
    savedPlans = (await c.query(`SELECT value FROM "Setting" WHERE key = 'protectionPlans'`)).rows[0]?.value ?? null;
  });
});
test.afterAll(async () => {
  await db(async (c) => {
    const lit = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    if (savedFeatures) await c.query(`UPDATE "Setting" SET value = ${lit(savedFeatures)} WHERE key = 'features'`);
    else await c.query(`UPDATE "Setting" SET value = jsonb_set(value, '{protectionEnabled}', 'false') WHERE key = 'features'`);
    if (savedPlans) await c.query(`UPDATE "Setting" SET value = ${lit(savedPlans)} WHERE key = 'protectionPlans'`);
    else await c.query(`DELETE FROM "Setting" WHERE key = 'protectionPlans'`);
  });
});

test("html lang is es-US on Spanish pages and en elsewhere", async ({ request }) => {
  for (const [path, lang] of [
    ["/es", "es-US"], ["/es/servicios", "es-US"], ["/es/servicios/airport-luggage", "es-US"], ["/es/areas/miami", "es-US"], ["/es/solicitar-cotizacion", "es-US"],
    ["/", "en"], ["/services/airport-luggage", "en"], ["/request-a-quote", "en"], ["/admin/login", "en"], ["/driver/login", "en"],
  ] as const) {
    const html = await (await request.get(path)).text();
    expect(html, path).toContain(`<html lang="${lang}"`);
  }
  const notFound = await request.get(`/no-such-page-${tag}`);
  expect(notFound.status()).toBe(404);
  expect(await notFound.text()).toContain('<html lang="en"');
});

test("Spanish service pages pair with English via hreflang", async ({ request }) => {
  const es = await (await request.get("/es/servicios/cruise-port-luggage")).text();
  expect(es).toMatch(/hrefLang="en-US"[^>]*href="[^"]*\/services\/cruise-port-luggage"|href="[^"]*\/services\/cruise-port-luggage"[^>]*hrefLang="en-US"/);
  const en = await (await request.get("/services/cruise-port-luggage")).text();
  expect(en).toMatch(/\/es\/servicios\/cruise-port-luggage/);
});

async function fillAirportFlow(page: Page, email: string) {
  await page.getByText("Equipaje en aeropuertos", { exact: true }).click();
  await cont(page);
  await page.locator("#q-pickup-facility").selectOption("MIA");
  await page.locator("#q-delivery-address").fill("Hotel en Brickell, Miami");
  await page.locator("#q-delivery-market").selectOption("miami");
  await cont(page);
  await page.locator("#q-serviceDate").fill("2026-11-20");
  await page.getByText("Mañana (8 AM – 12 PM)").click();
  await cont(page);
  await page.getByRole("button", { name: "Aumentar cantidad" }).first().click();
  await cont(page);
  await page.locator("#q-contact-name").fill(`Viajera E2E ${tag}`);
  await page.locator("#q-contact-email").fill(email);
  await page.locator("#q-contact-phone").fill("305 555 0123");
  await page.locator("#q-leadSource").selectOption("google-search");
  await cont(page);
}

test("Spanish wizard from the /es CTA at phone size stores a Spanish quote", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es");
  await page.evaluate(() => localStorage.removeItem("eb-quote-draft-v1"));
  await page.getByRole("link", { name: /Solicitar cotización/ }).first().click();
  await page.waitForURL(/\/es\/solicitar-cotizacion/);
  await expect(page.getByTestId("quote-wizard")).toHaveAttribute("data-lang", "es");
  await expect(page.getByRole("heading", { name: "¿Qué necesita?" })).toBeVisible();

  // Validation in Spanish
  await page.getByText("Equipaje en aeropuertos", { exact: true }).click();
  await cont(page);
  await cont(page);
  await expect(page.getByText(/campos? necesita/).first()).toBeVisible();
  await expect(page.getByText("Elija el aeropuerto")).toBeVisible();
  await page.getByRole("button", { name: /^Atrás/ }).click();

  const email = `es-${tag}@example.org`;
  await page.getByRole("button", { name: /^Continuar/ }).click();
  await page.locator("#q-pickup-facility").selectOption("MIA");
  await page.locator("#q-delivery-address").fill("Hotel en Brickell, Miami");
  await page.locator("#q-delivery-market").selectOption("miami");
  await cont(page);
  await page.locator("#q-serviceDate").fill("2026-11-20");
  await page.getByText("Mañana (8 AM – 12 PM)").click();
  await cont(page);
  await page.getByRole("button", { name: "Aumentar cantidad" }).first().click();
  await cont(page);
  await page.locator("#q-contact-name").fill(`Viajera E2E ${tag}`);
  await page.locator("#q-contact-email").fill(email);
  await page.locator("#q-contact-phone").fill("305 555 0123");
  await page.locator("#q-leadSource").selectOption("google-search");
  await cont(page);
  await expect(page.getByRole("heading", { name: "Revisar y enviar" })).toBeVisible();
  await expect(page.getByTestId("protection-picker")).toHaveCount(0); // module off by default
  await page.locator("#q-acceptsProhibitedItemsPolicy").check();
  await page.locator("#q-consentToContact").check();
  await page.getByRole("button", { name: "Enviar solicitud de cotización" }).click();
  await expect(page.getByRole("heading", { name: "Solicitud recibida" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Gracias\./).first()).toBeVisible();
  const ref = (await page.getByTestId("quote-reference").textContent())?.trim() ?? "";
  expect(ref).toMatch(/^EB-Q-\d{6}-[A-Z0-9]{4}$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const row = await db((c) => c.query(`SELECT q.payload->>'language' AS lang, c.language AS clang FROM "QuoteRequest" q JOIN "Customer" c ON c.id = q."customerId" WHERE q.reference = '${ref}'`));
  expect(row.rows[0]).toEqual({ lang: "es", clang: "es" });
});

test("switching language keeps what was entered", async ({ page }) => {
  await page.goto("/request-a-quote");
  await page.evaluate(() => localStorage.removeItem("eb-quote-draft-v1"));
  await page.reload();
  await page.getByText("Airport luggage", { exact: true }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.locator("#q-delivery-address").fill("Kept address 123");
  await page.getByTestId("lang-es").click();
  await expect(page.getByRole("heading", { name: "Recogida y entrega" })).toBeVisible();
  await expect(page.locator("#q-delivery-address")).toHaveValue("Kept address 123");
  await page.getByTestId("lang-en").click();
  await expect(page.getByRole("heading", { name: "Pickup and delivery" })).toBeVisible();
});

test("protection appears when approved + enabled and the choice is stored", async ({ page, request }) => {
  const login = await request.post(`${API}/v1/admin/auth/login`, { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  expect(login.status()).toBe(200);
  const plans = await (await request.get(`${API}/v1/admin/protection/plans`)).json();
  const approved = { ...plans.plans, approval: { approvedBy: "E2E counsel", approvedAt: "2026-10-15", termsUrl: "https://www.express-bags.com/protection-terms", structure: "E2E test" } };
  expect((await request.put(`${API}/v1/admin/protection/plans`, { data: approved })).status()).toBe(200);
  expect((await (await request.post(`${API}/v1/admin/protection/enable`, { data: { enabled: true } })).json()).live).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/es/solicitar-cotizacion");
  await page.evaluate(() => localStorage.removeItem("eb-quote-draft-v1"));
  await page.reload();
  await fillAirportFlow(page, `es-prot-${tag}@example.org`);
  const picker = page.getByTestId("protection-picker");
  await expect(picker).toBeVisible();
  await expect(picker).not.toContainText(/insur|seguro/i);
  await picker.locator("label").filter({ hasText: "Plus" }).click();
  await page.locator("#q-acceptsProhibitedItemsPolicy").check();
  await page.locator("#q-consentToContact").check();
  await page.getByRole("button", { name: "Enviar solicitud de cotización" }).click();
  const ref = (await page.getByTestId("quote-reference").textContent({ timeout: 15_000 }))?.trim() ?? "";
  const row = await db((c) => c.query(`SELECT payload->>'protectionTier' AS tier FROM "QuoteRequest" WHERE reference = '${ref}'`));
  expect(row.rows[0].tier).toBe("plus");
});

test("storage requests show an availability hint and never block", async ({ page }) => {
  await page.goto("/request-a-quote?type=storage&market=miami");
  await page.evaluate(() => localStorage.removeItem("eb-quote-draft-v1"));
  await page.reload();
  await page.locator("#q-storageStart").fill("2026-12-01T10:00");
  await page.locator("#q-storageEnd").fill("2026-12-02T15:00");
  const hint = page.getByTestId("storage-availability");
  await expect(hint).toBeVisible({ timeout: 10_000 });
  await expect(hint).toHaveAttribute("data-state", /ok|limited/);
  await expect(hint).not.toContainText(/\d+ (spaces|pieces|bags)/i);
  await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Drop-off timing" })).toBeVisible();
});
