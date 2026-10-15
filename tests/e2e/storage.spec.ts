import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Storage + protection flows, nothing mocked:
 *  1. office creates a storage location, books it, and an overlapping booking is refused (capacity)
 *  2. intake (check-in) → release with the authorized person
 *  3. with protection approved + enabled, a customer files a claim with evidence, staff decides it
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
const locName = `E2E hub ${tag}`;
const custEmail = `e2e-claim-${tag}@example.org`;
const bookerEmail = `e2e-storage-${tag}@example.org`;

const db = async <T>(fn: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
};

async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(\/)?$/, { timeout: 20_000 });
}

async function apiAdmin(request: APIRequestContext) {
  const r = await request.post(`${API}/v1/admin/auth/login`, { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  expect(r.status()).toBe(200);
}

test.describe.configure({ mode: "serial" });

let savedFeatures: unknown = null;
let savedPlans: unknown = null;
let bookingUrl = "";

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
    await c.query(`DELETE FROM "Customer" WHERE email = '${bookerEmail}' AND id NOT IN (SELECT "customerId" FROM "Order")`);
    const cust = (await c.query(`SELECT id FROM "Customer" WHERE email = '${custEmail}'`)).rows[0]?.id;
    if (cust) {
      await c.query(`DELETE FROM "ClaimEvidence" WHERE "claimId" IN (SELECT id FROM "Claim" WHERE "customerId" = '${cust}')`);
      await c.query(`DELETE FROM "ClaimEvent" WHERE "claimId" IN (SELECT id FROM "Claim" WHERE "customerId" = '${cust}')`);
      await c.query(`DELETE FROM "Claim" WHERE "customerId" = '${cust}'`);
      await c.query(`DELETE FROM "Order" WHERE "customerId" = '${cust}'`);
      await c.query(`DELETE FROM "Upload" WHERE "ownerId" = '${cust}'`);
      await c.query(`DELETE FROM "Customer" WHERE id = '${cust}'`);
    }
    const locs = (await c.query(`SELECT id FROM "StorageLocation" WHERE name = '${locName}'`)).rows.map((r) => `'${r.id}'`);
    if (locs.length) {
      await c.query(`DELETE FROM "StorageBookingMeta" WHERE "bookingId" IN (SELECT id FROM "StorageBooking" WHERE "locationId" IN (${locs.join(",")}))`);
      await c.query(`DELETE FROM "StorageBooking" WHERE "locationId" IN (${locs.join(",")})`);
      await c.query(`DELETE FROM "StorageLocation" WHERE id IN (${locs.join(",")})`);
    }
  });
});

test("office books storage and an overlapping booking over capacity is refused", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/storage?tab=locations");
  await page.getByRole("button", { name: "Add location" }).click();
  await page.locator("#l-name").fill(locName);
  await page.locator("#l-code").fill(`e2e-${tag}`);
  await page.locator("#l-cap").fill("5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: new RegExp(locName) }).first()).toBeVisible();

  const book = async (pieces: string) => {
    await page.getByRole("button", { name: "New booking" }).click();
    await page.locator("#b-loc").selectOption({ label: `${locName} (5)` });
    await page.locator("#b-start").fill("2026-12-15T10:00");
    await page.locator("#b-end").fill("2026-12-15T16:00");
    await page.locator("#b-pieces").fill(pieces);
    await page.locator("#b-name").fill("E2E Traveler");
    await page.locator("#b-email").fill(bookerEmail);
    await page.getByRole("button", { name: "Create booking" }).click();
  };
  await book("4");
  await page.waitForURL(/\/admin\/storage\/bookings\//);
  bookingUrl = page.url();
  await expect(page.getByText(/Intake: check luggage in/)).toBeVisible();

  await page.goto("/admin/storage?tab=bookings");
  await book("3");
  await expect(page.getByRole("alert").filter({ hasText: /Storage is full/ })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /1 of 5/ })).toBeVisible();
});

test("intake then release records the chain of custody", async ({ page }) => {
  await adminLogin(page);
  await page.goto(bookingUrl);
  await page.locator("#ci-count").fill("4");
  await page.locator("#ci-tags").fill("T1 T2 T3 T4");
  await page.locator("#ci-notes").fill("One bag has a worn wheel");
  await page.getByRole("button", { name: "Confirm intake" }).click();
  await expect(page.getByText("Release / retrieval")).toBeVisible();
  await expect(page.getByText("One bag has a worn wheel")).toBeVisible();

  // A count mismatch without a note is refused
  await page.locator("#rl-count").fill("3");
  await page.getByRole("button", { name: "Confirm release" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Count mismatch/ })).toBeVisible();
  await page.locator("#rl-count").fill("4");
  await page.getByRole("button", { name: "Confirm release" }).click();
  await expect(page.getByText(/Released to/)).toBeVisible();
  await expect(page.getByText("Released", { exact: true }).first()).toBeVisible();
});

test("customer files a protection claim with evidence and staff decides it", async ({ page, request, context }) => {
  // Approve + enable protection through the API (owner)
  await apiAdmin(request);
  const plans = await (await request.get(`${API}/v1/admin/protection/plans`)).json();
  const approved = { ...plans.plans, approval: { approvedBy: "E2E counsel", approvedAt: "2026-10-15", termsUrl: "https://www.express-bags.com/protection-terms", structure: "E2E test" } };
  expect((await request.put(`${API}/v1/admin/protection/plans`, { data: approved })).status()).toBe(200);
  expect((await (await request.post(`${API}/v1/admin/protection/enable`, { data: { enabled: true } })).json()).live).toBe(true);

  // A signed-in customer with a protected (Plus) order
  const hash = bcrypt.hashSync("E2E-Customer-Pass-1!", 10);
  const custId = `e2ecl${tag}`;
  const orderId = `e2eord${tag}`;
  await db(async (c) => {
    await c.query(`INSERT INTO "Customer" (id, name, email, "passwordHash", "emailVerifiedAt", "updatedAt") VALUES ('${custId}', 'Erin Claimant', '${custEmail}', '${hash}', now(), now())`);
    await c.query(
      `INSERT INTO "Order" (id, reference, status, "serviceType", "customerId", pickup, delivery, "serviceDate", market, "protectionTier", "protectionCents", "paymentStatus", "completedAt", "updatedAt")
       VALUES ('${orderId}', 'EB-E2E-${tag.toUpperCase()}', 'DELIVERED', 'luggage-local', '${custId}', '{"type":"hotel","address":"Hotel","market":"miami"}', '{"type":"airport","address":"MIA","market":"miami"}', now(), 'miami', 'plus', 1500, 'PAID', now(), now())`,
    );
  });
  const token = jwt.sign({ sub: custId, typ: "customer" }, `${env.JWT_SECRET}:customer`, { expiresIn: 3600 });
  await context.addCookies([{ name: "eb_customer", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account/claims/new");
  await expect(page.getByRole("heading", { name: "File a protection claim" })).toBeVisible();
  await page.locator("#cl-order").selectOption(orderId);
  await page.locator("#cl-desc").fill("The hard-shell suitcase arrived with a cracked corner and a broken handle.");
  await page.locator("#cl-amt").fill("180");
  await page.locator("#ev-cat").selectOption("damage-photo");
  await page.locator('input[type="file"]').setInputFiles({ name: "crack.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]) });
  await expect(page.getByText("crack.jpg")).toBeVisible();
  const [submitted] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/protection/claims") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Submit claim" }).click(),
  ]);
  expect(submitted.status(), await submitted.text()).toBe(201);
  await page.waitForURL(/\/account\/claims\/[^/]+\?filed=1/);
  await expect(page.getByText(/Your claim was submitted/)).toBeVisible();
  const claimRef = (await page.getByRole("heading", { level: 1 }).textContent())?.replace("Claim ", "").trim();

  // Staff decide it (partial) in the admin
  await page.setViewportSize({ width: 1440, height: 900 });
  await adminLogin(page);
  await page.goto("/admin/claims");
  await page.getByRole("cell", { name: new RegExp(claimRef ?? "EB-CL") }).first().click();
  await expect(page.getByText("Customer evidence")).toBeVisible();
  await page.locator("#dc-status").selectOption("PARTIAL");
  await page.locator("#dc-amt").fill("120");
  await page.locator("#dc-note").fill("Corner crack confirmed; handle wear predates pickup per intake photos.");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Partially approved").first()).toBeVisible();
  await expect(page.getByText("$120.00").first()).toBeVisible();
});
