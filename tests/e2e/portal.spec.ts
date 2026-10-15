import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { expect, test } from "@playwright/test";

/**
 * Customer portal, end to end against the real API + database:
 * an earlier quote request → register → verify (token issued in DB) → the quote shows up →
 * saved location → hotel concierge desk creates a guest request. Nothing is mocked.
 */
const API = process.env.E2E_API_URL || "http://localhost:4000";
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const DEMO_PASSWORD = process.env.DEMO_PORTAL_PASSWORD || "Demo-Portal-2026!";
const tag = randomBytes(3).toString("hex");
const email = `e2e-portal-${tag}@example.com`;
const PASSWORD = "Portal-E2E-Pass-1";
let quoteRef = "";

async function db<T>(fn: (c: pg.Client) => Promise<T>) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL || env.DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

test.describe.configure({ mode: "serial" });

test("a quote request sent before registering appears after the account is verified", async ({ page, request }) => {
  const q = await request.post(`${API}/v1/quotes`, {
    data: {
      serviceType: "cruise",
      pickup: { type: "hotel", address: "Hotel in Miami Beach", market: "miami" },
      delivery: { type: "cruise-port", address: "PortMiami", facility: "portmiami", market: "miami" },
      serviceDate: "2026-12-12",
      timeWindow: "morning",
      items: [{ category: "large", quantity: 2 }],
      contact: { name: "Portal E2E", email, phone: "305-555-0177" },
      leadSource: "google-search",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    },
  });
  expect(q.status()).toBe(201);
  quoteRef = (await q.json()).reference;

  await page.goto("/account/register");
  await page.locator("#name").fill("Portal E2E");
  await page.locator("#phone").fill("305-555-0177");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirm").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/If that email can be used/)).toBeVisible();

  // The real link is emailed (only its hash is stored); issue a fresh one the same way the API does.
  const raw = randomBytes(32).toString("base64url");
  await db(async (c) => {
    const { rows } = await c.query(`select id from "Customer" where email = $1`, [email]);
    await c.query(`update "AuthToken" set "usedAt" = now() where "subjectId" = $1 and purpose = 'email-verify' and "usedAt" is null`, [rows[0].id]);
    await c.query(
      `insert into "AuthToken" (id, purpose, "subjectType", "subjectId", "tokenHash", "expiresAt") values ($1, 'email-verify', 'customer', $2, $3, now() + interval '1 hour')`,
      [`e2e${tag}${Date.now()}`, rows[0].id, createHash("sha256").update(raw).digest("hex")],
    );
  });

  await page.goto(`/account/verify?token=${raw}`);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Activate my account" }).click();
  await page.waitForURL(/\/account\?welcome=1/);
  await expect(page.getByText(/Your account is active/)).toBeVisible();
  await expect(page.getByText(quoteRef)).toBeVisible();
});

test("customer saves a location and sees it", async ({ page }) => {
  await page.goto("/account/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account$/);
  await page.goto("/account/addresses");
  await page.getByRole("button", { name: "Add location" }).click();
  await page.locator("#label").fill("Brickell apartment");
  await page.locator("#type").selectOption("residence");
  await page.locator("#address").fill("Example tower, Brickell Ave, Miami");
  await page.locator("#market").selectOption("miami");
  await page.getByRole("button", { name: "Save location" }).click();
  await expect(page.getByText("Brickell apartment")).toBeVisible();
  await page.goto("/account/quotes");
  await expect(page.getByText(quoteRef)).toBeVisible();
});

test("signed-out visitors are sent to sign in; /client-login goes to the portal", async ({ page }) => {
  await page.goto("/account/orders");
  await page.waitForURL(/\/account\/login\?next=/);
  await page.goto("/client-login");
  await page.waitForURL(/\/account\/login/);
});

test("hotel concierge desk sends a guest request to dispatch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account/login");
  await page.locator("#email").fill("belldesk@demo-hotel.example");
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account$/);
  await page.goto("/account/concierge");
  const guest = `E2E Guest ${tag}`;
  await page.locator("#guestName").fill(guest);
  await page.locator("#guestRoom").fill("812");
  await page.locator("#pickupTime").fill("10:15");
  await page.getByRole("button", { name: "More Large luggage" }).click();
  await page.locator("#flightOrShip").fill("AA 1234 at 1:05 PM");
  await page.locator('input[name="policy"]').check();
  await page.getByRole("button", { name: "Send to dispatch" }).click();
  await expect(page.getByText(/sent to dispatch/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(guest)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test.afterAll(async () => {
  await db(async (c) => {
    const { rows } = await c.query(`select id from "Customer" where email = $1`, [email]);
    if (!rows[0]) return;
    const id = rows[0].id;
    await c.query(`delete from "QuoteRequest" where "customerId" = $1`, [id]);
    await c.query(`delete from "AuthToken" where "subjectId" = $1`, [id]);
    await c.query(`delete from "CustomerAccess" where "customerId" = $1`, [id]);
    await c.query(`delete from "AuditLog" where detail->>'customerId' = $1`, [id]);
    await c.query(`delete from "Customer" where id = $1`, [id]);
    await c.query(`delete from "QuoteRequest" where "leadSource" = 'hotel-concierge' and payload->'concierge'->>'guestName' = $1`, [`E2E Guest ${tag}`]);
  });
});
