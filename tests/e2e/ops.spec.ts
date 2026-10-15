import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { expect, test, type Page } from "@playwright/test";

/**
 * Operations flow, nothing mocked: office creates an order → public tracking (driver hidden) →
 * dispatch assigns a driver → tracking shows only the driver's first name.
 */
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const tag = randomBytes(3).toString("hex");
const date = "2026-12-10";
const email = `e2e-ops-${tag}@example.org`;
const driverFirst = `Rio${tag}`;
let employeeId = "";
let reference = "";

const db = async <T>(fn: (c: pg.Client) => Promise<T>) => {
  const c = new pg.Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  employeeId = `e2eops${tag}`;
  // Literal SQL (values are generated hex tags): the local Prisma dev DB proxy rejects bind parameters
  await db((c) => c.query(`INSERT INTO "Employee" (id, "firstName", "lastName", role, status, "updatedAt") VALUES ('${employeeId}', '${driverFirst}', 'Secretlast', 'DRIVER', 'ACTIVE', now())`));
});

test.afterAll(async () => {
  await db(async (c) => {
    await c.query(`DELETE FROM "Order" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE email = '${email}')`);
    await c.query(`DELETE FROM "Assignment" WHERE "employeeId" = '${employeeId}'`);
    await c.query(`DELETE FROM "Employee" WHERE id = '${employeeId}'`);
    await c.query(`DELETE FROM "Customer" WHERE email = '${email}'`);
  });
});

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(\/)?$/, { timeout: 20_000 });
}

async function track(page: Page) {
  await page.goto("/track");
  await page.locator("#trk-ref").fill(reference);
  await page.locator("#trk-ver").fill(email);
  await page.getByRole("button", { name: "Track delivery" }).click();
  await expect(page.locator("#track-result")).toBeVisible({ timeout: 15_000 });
}

test("office creates an order manually", async ({ page }) => {
  await login(page);
  await page.goto("/admin/orders/new");
  await page.getByRole("radio", { name: "New customer" }).click();
  await page.locator("#nc-name").fill(`E2E Guest ${tag}`);
  await page.locator("#nc-email").fill(email);
  await page.locator("#nc-phone").fill("305 555 0123");
  await page.locator("#pu-addr").fill("Hotel on Ocean Drive, Miami Beach, FL 33139");
  await page.locator("#de-type").selectOption("airport");
  await page.locator("#de-fac").selectOption("MIA");
  await page.locator("#o-date").fill(date);
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: /Create order with 2 pieces/ }).click();
  await page.waitForURL((u) => /\/admin\/orders\/(?!new$)[a-z0-9]+$/.test(u.pathname), { timeout: 20_000 });
  await expect(page.locator("h1")).toHaveText(/^EB-\d{6}-[A-Z0-9]{4}$/, { timeout: 15_000 });
  reference = (await page.locator("h1").textContent())!.trim();
  expect(reference).toMatch(/^EB-\d{6}-[A-Z0-9]{4}$/);
  await expect(page.getByText(`${reference}-02`)).toBeVisible();
});

test("tracking verifies the customer and hides the driver before assignment", async ({ page }) => {
  await page.goto("/track");
  await page.locator("#trk-ref").fill(reference);
  await page.locator("#trk-ver").fill("wrong@example.org");
  await page.getByRole("button", { name: "Track delivery" }).click();
  await expect(page.getByText("We couldn't find a delivery")).toBeVisible();
  await track(page);
  await expect(page.locator("#track-result")).toContainText("Order confirmed");
  await expect(page.getByText(/Your driver/)).toHaveCount(0);
});

test("dispatcher assigns the driver on the board", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/dispatch?date=${date}`);
  const card = page.locator("article", { hasText: reference });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Assign crew" }).click();
  await page.locator("#as-emp").selectOption(employeeId);
  await expect(page.getByRole("status")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /^Assign/ }).click();
  await expect(page.getByRole("region", { name: new RegExp(`Jobs for ${driverFirst}`) }).locator("article", { hasText: reference })).toBeVisible({ timeout: 15_000 });
});

test("tracking now shows only the driver's first name", async ({ page }) => {
  await track(page);
  await expect(page.locator("#track-result")).toContainText(`Your driver: ${driverFirst}`);
  await expect(page.locator("#track-result")).not.toContainText("Secretlast");
  await expect(page.locator("#track-result")).toContainText("Driver assigned");
});
