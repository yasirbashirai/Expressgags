import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import pg from "pg";

/**
 * Engagement e2e: cookie consent gates every tag request, the post-delivery survey shows the review link
 * to happy customers, and the admin template preview renders. Real API + DB, nothing mocked except
 * third-party tag hosts (requests are recorded and aborted).
 */

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const API = process.env.E2E_API_URL || "http://localhost:4000";
const tag = randomBytes(3).toString("hex");
const ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const token = Array.from(randomBytes(32), (b) => ALPHA[b % ALPHA.length]).join("");
const ids = { customer: `cust_e2e_${tag}`, order: `ord_e2e_${tag}`, survey: `srv_e2e_${tag}` };

async function ownerLogin(request: APIRequestContext) {
  const r = await request.post(`${API}/v1/admin/auth/login`, { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  expect(r.status(), await r.text()).toBe(200);
}

async function sql(text: string) {
  const c = new pg.Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    return await c.query(text);
  } finally {
    await c.end();
  }
}

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await ownerLogin(request);
  await request.put(`${API}/v1/admin/notifications/settings/marketing`, { data: { marketing: { ga4Id: "", googleAdsId: "", googleAdsQuoteLabel: "", googleAdsBookingLabel: "", metaPixelId: "" } } });
  await sql(`DELETE FROM "Testimonial" WHERE "sourceSurveyId" = '${ids.survey}'`);
  await sql(`DELETE FROM "SurveyResponse" WHERE id = '${ids.survey}'`);
  await sql(`DELETE FROM "Order" WHERE id = '${ids.order}'`);
  await sql(`DELETE FROM "Customer" WHERE id = '${ids.customer}'`);
});

test.describe("cookie consent", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("no analytics or ad tags load until the visitor accepts", async ({ page, request }) => {
    await ownerLogin(request);
    const set = await request.put(`${API}/v1/admin/notifications/settings/marketing`, {
      data: { marketing: { ga4Id: "G-E2ETEST01", googleAdsId: "AW-123456789", googleAdsQuoteLabel: "quote", googleAdsBookingLabel: "book", metaPixelId: "1234567890123" } },
    });
    expect(set.status()).toBe(200);

    const tagRequests: string[] = [];
    await page.route(/googletagmanager\.com|connect\.facebook\.net|google-analytics\.com|facebook\.com\/tr/, (route) => {
      tagRequests.push(route.request().url());
      return route.abort();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const banner = page.getByTestId("consent-banner");
    await expect(banner).toBeVisible();
    await page.waitForTimeout(1500);
    expect(tagRequests, "tags requested before consent").toEqual([]);
    expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");

    // "Necessary only" keeps everything off
    await page.getByRole("button", { name: "Necessary only" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await page.waitForTimeout(1000);
    expect(tagRequests).toEqual([]);

    // Reopen via #cookie-settings and accept analytics + marketing
    await page.goto("/#cookie-settings");
    await expect(banner).toBeVisible();
    await page.getByLabel(/Analytics/).check();
    await page.getByLabel(/Marketing/).check();
    await page.screenshot({ path: ".qa/engagement/consent-customize-390.png" });
    await Promise.all([page.waitForRequest(/googletagmanager\.com\/gtag\/js/), page.getByRole("button", { name: "Save choices" }).click()]);
    await expect.poll(() => tagRequests.some((u) => u.includes("connect.facebook.net"))).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem("eb-consent-v1"));
    expect(JSON.parse(stored!)).toMatchObject({ analytics: true, marketing: true });
  });

  test("banner screenshot on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("consent-banner")).toBeVisible();
    await page.screenshot({ path: ".qa/engagement/consent-1440.png" });
  });
});

test("happy customer rates 5 stars and sees the Google review link", async ({ page, request }) => {
  await ownerLogin(request);
  const cur = await (await request.get(`${API}/v1/admin/notifications/settings`)).json();
  const upd = await request.put(`${API}/v1/admin/notifications/settings`, { data: { notifications: { ...cur.notifications, googleReviewUrl: "https://g.page/r/express-bags-demo/review" } } });
  expect(upd.status()).toBe(200);
  await sql(`INSERT INTO "Customer" (id, name, email, language, "updatedAt") VALUES ('${ids.customer}', 'Jordan E2E', 'survey-${tag}@example.org', 'en', now())`);
  await sql(`INSERT INTO "Order" (id, reference, status, "serviceType", "customerId", pickup, delivery, "serviceDate", market, "updatedAt")
    VALUES ('${ids.order}', 'EB-261015-${tag.slice(0, 4).toUpperCase().replace(/[01]/g, "Z")}', 'DELIVERED', 'luggage-local', '${ids.customer}', '{"type":"hotel","address":"Hotel, Miami Beach","market":"miami"}', '{"type":"airport","address":"MIA","market":"miami"}', now(), 'miami', now())`);
  await sql(`INSERT INTO "SurveyResponse" (id, "orderId", token) VALUES ('${ids.survey}', '${ids.order}', '${token}')`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/survey/${token}`);
  await expect(page.getByRole("heading", { name: /How did we do, Jordan/ })).toBeVisible();
  await page.screenshot({ path: ".qa/engagement/survey-form-390.png", fullPage: true });
  await page.getByLabel(/5 stars/).check({ force: true });
  await page.getByLabel(/Anything you'd like to tell us/).fill(`Smooth handoff at the hotel ${tag}`);
  await page.getByLabel(/You may publish my comment/).check();
  await page.getByLabel(/How should we credit you/).fill("Frequent cruise traveler, Miami");
  await page.getByRole("button", { name: "Send feedback" }).click();
  const link = page.getByTestId("review-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://g.page/r/express-bags-demo/review");
  await page.screenshot({ path: ".qa/engagement/survey-thanks-390.png", fullPage: true });
  const t = await sql(`SELECT published, "permissionGranted" FROM "Testimonial" WHERE "sourceSurveyId" = '${ids.survey}'`);
  expect(t.rows[0]).toMatchObject({ published: false, permissionGranted: true });
  await request.put(`${API}/v1/admin/notifications/settings`, { data: { notifications: { ...cur.notifications } } });
});

test("admin previews templates in English and Spanish", async ({ page }) => {
  await ownerLogin(page.request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/notifications/templates");
  await expect(page.getByTestId("tpl-subject")).toContainText("Booking confirmed");
  await page.getByRole("tab", { name: "Español" }).click();
  await expect(page.getByTestId("tpl-subject")).toContainText("Reserva confirmada");
  await expect(page.frameLocator('iframe[title="Email preview"]').getByText("P.O. Box 667538", { exact: false })).toBeVisible();
  await page.screenshot({ path: ".qa/engagement/admin-templates-1440.png", fullPage: true });
  await page.goto("/admin/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await page.screenshot({ path: ".qa/engagement/admin-log-1440.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".qa/engagement/admin-log-390.png", fullPage: true });
  await page.goto("/admin/notifications/settings");
  await expect(page.getByRole("heading", { name: "Notification settings" })).toBeVisible();
  await page.screenshot({ path: ".qa/engagement/admin-settings-390.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".qa/engagement/admin-settings-1440.png", fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
