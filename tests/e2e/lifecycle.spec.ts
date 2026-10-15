/**
 * Cross-module "day in the life" regression (real API + Postgres, mock payments, notifications in log mode).
 *
 * Traveler: quote request → staff quotation → customer accepts on a phone + deposit → dispatcher assigns
 * driver + vehicle → driver app pickup/scan/photo/signature/delivery → tracking shows Delivered with the
 * driver's first name only → 5★ survey → staff invoices the remainder → customer pays → dashboard/reports
 * → notification log has the order's messages.
 * B2B: hotel concierge request → quotation on account (no deposit) → order → invoice with PO + terms.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const API = process.env.E2E_API_URL || "http://localhost:4000";
const fx = (...args: string[]) => JSON.parse(execFileSync("npx", ["tsx", "tests/e2e/lifecycle-fixture.ts", ...args], { encoding: "utf8" }).trim().split("\n").pop()!);
const tag = Date.now().toString(36);
const SHOTS = ".qa/qa/lifecycle";
mkdirSync(SHOTS, { recursive: true });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const travelerEmail = `lifecycle-${tag}@example.org`;
/** Tomorrow in Miami time (driver app lists today + the next few days). */
const SERVICE_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 24 * 3600 * 1000));

test.describe.configure({ mode: "serial" });

async function staffLogin(request: APIRequestContext) {
  const r = await request.post(`${API}/v1/admin/auth/login`, { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  expect(r.ok()).toBeTruthy();
}
async function adminUiLogin(page: Page) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/?$/);
}

let crew: { email: string; password: string; userId: string; employeeId: string; vehicleId: string };
let quoteRef = "";
let quoteId = "";
let customerLink = "";
let orderRef = "";
let order: { id: string; pieces: string[]; surveyToken: string | null; status: string; notifications: number; templates: string[] };

test.beforeAll(() => {
  crew = fx("crew");
});
test.afterAll(() => {
  if (crew) fx("cleanup", JSON.stringify(crew));
});

test("1 · traveler requests a quote", async ({ request }) => {
  const r = await request.post(`${API}/v1/quotes`, {
    data: {
      serviceType: "cruise",
      pickup: { type: "hotel", address: "Hotel on Collins Avenue, Miami Beach", market: "miami" },
      delivery: { type: "cruise-port", address: "PortMiami", facility: "portmiami", market: "miami" },
      serviceDate: SERVICE_DATE,
      timeWindow: "morning",
      items: [{ category: "standard-checked", quantity: 3 }],
      travelers: 2,
      cruiseLine: "Example Cruise Line",
      contact: { name: `Lifecycle Traveler ${tag}`, email: travelerEmail, phone: "305 555 0177" },
      leadSource: "google-search",
      acceptsProhibitedItemsPolicy: true,
      consentToContact: true,
    },
  });
  expect(r.status()).toBe(201);
  quoteRef = (await r.json()).reference;
  expect(quoteRef).toMatch(/^EB-Q-/);
});

test("2 · staff builds and sends the quotation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await adminUiLogin(page);
  const list = await page.evaluate(async ([api, ref]) => (await (await fetch(`${api}/v1/admin/quotes?q=${ref}`, { credentials: "include" })).json()), [API, quoteRef]);
  quoteId = (list.quotes ?? list.items ?? []).find((x: { reference: string }) => x.reference === quoteRef)?.id;
  expect(quoteId).toBeTruthy();
  await page.goto(`/admin/quotations/new?quoteRequestId=${quoteId}`);
  await page.getByRole("button", { name: /suggest from engine/i }).click();
  await expect(page.locator("#d-0")).not.toHaveValue("");
  await page.locator("#qt-dep").selectOption("percent");
  await page.locator("#qt-depv").fill("30");
  await page.getByRole("button", { name: /save and send/i }).click();
  await page.waitForURL(/\/admin\/quotations\/[a-z0-9]+$/);
  customerLink = (await page.getByText(/Customer link:/).first().textContent())!.replace(/^.*Customer link:\s*/, "").trim();
  expect(customerLink).toContain("/q/");
  await page.screenshot({ path: `${SHOTS}/02-quotation.png`, fullPage: true });
});

test("3 · customer accepts on a phone and pays the deposit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL(customerLink).pathname);
  await expect(page.getByText(/margin|markup|internal cost/i)).toHaveCount(0);
  await page.locator("#acc-name").fill(`Lifecycle Traveler ${tag}`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /accept and pay/i }).click();
  await page.waitForURL(/\/pay\/mock-checkout/);
  await page.getByRole("button", { name: /^pay /i }).click();
  await page.waitForURL(/\/pay\/success/);
  await page.goto(new URL(customerLink).pathname);
  orderRef = (await page.getByText(/order reference is/).textContent())!.match(/EB-\d{6}-[A-Z0-9]{4}/)![0];
  order = fx("order", orderRef);
  expect(order.pieces).toHaveLength(3);
  expect(fx("order", orderRef).paymentStatus).toBe("DEPOSIT_PAID");
});

test("4 · dispatcher assigns driver and vehicle", async ({ request }) => {
  await staffLogin(request);
  const r = await request.post(`${API}/v1/admin/dispatch/assign`, { data: { orderId: order.id, employeeId: crew.employeeId, role: "DRIVER", vehicleId: crew.vehicleId } });
  expect(r.ok(), await r.text()).toBeTruthy();
  expect(fx("order", orderRef).status).toBe("DRIVER_ASSIGNED");
});

test("5 · driver completes pickup and delivery with proof", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ["geolocation"], geolocation: { latitude: 25.79, longitude: -80.13 }, storageState: "tests/e2e/consent-state.json" });
  const page = await ctx.newPage();
  await page.goto("/driver/login");
  await page.locator("#d-email").fill(crew.email);
  await page.locator("#d-password").fill(crew.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/driver$/);
  // Future-dated job lives under Upcoming
  const upcoming = page.getByRole("tab", { name: /Upcoming/ });
  if (await upcoming.count()) await upcoming.click();
  await page.locator("a", { hasText: orderRef }).first().click();
  await page.waitForURL(/\/driver\/jobs\//);
  await page.getByRole("button", { name: "Accept job" }).click();
  await page.getByRole("button", { name: "Start driving to pickup" }).click();
  for (const label of ["Checked in with the authorized contact", "Read and confirmed the job instructions", /Bag count matches/]) await page.getByLabel(label).check();
  const type = async (id: string) => {
    await page.locator("#manual-code").fill(id);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  };
  for (const p of order.pieces) await type(p);
  await page.locator("#photo-Addconditionphotos").setInputFiles({ name: "bag.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: /Confirm pickup/ }).click();
  await page.getByRole("button", { name: "Out for delivery" }).click();
  for (const p of order.pieces) await type(p);
  await page.locator("#recipient").fill("Terminal porter");
  const canvas = page.getByTestId("signature-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 90);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 30 + i * 24, box.y + 90 + Math.sin(i) * 35);
  await page.mouse.up();
  await page.getByRole("button", { name: "Confirm delivery" }).click();
  await expect(page.getByText("Job complete")).toBeVisible({ timeout: 15_000 });
  await ctx.close();
  order = fx("order", orderRef);
  expect(order.status).toBe("DELIVERED");
});

test("6 · tracking shows Delivered with the driver's first name only", async ({ page }) => {
  await page.goto("/track");
  await page.locator("#trk-ref").fill(orderRef);
  await page.locator("#trk-ver").fill(travelerEmail);
  await page.getByRole("button", { name: "Track delivery" }).click();
  const result = page.locator("#track-result");
  await expect(result).toContainText(/Delivered/);
  await expect(result).toContainText("Jordan");
  await expect(result).not.toContainText("Test-");
  await page.screenshot({ path: `${SHOTS}/06-tracking.png`, fullPage: true });
});

test("7 · customer rates the delivery 5 stars", async ({ page }) => {
  expect(order.surveyToken).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/survey/${order.surveyToken}`);
  await page.getByLabel(/5 stars/).check({ force: true });
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText(/Thank you/).first()).toBeVisible();
});

test("8 · staff invoices the remainder and the customer pays online", async ({ page, request }) => {
  await staffLogin(request);
  const r = await request.post(`${API}/v1/admin/billing/invoices`, { data: { orderIds: [order.id], send: true } });
  expect(r.status(), await r.text()).toBe(201);
  const inv = (await r.json()).invoice as { publicToken: string; totalCents: number };
  expect(inv.totalCents).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/invoice/${inv.publicToken}`);
  await expect(page.getByText("Less deposit received").first()).toBeVisible();
  await page.getByRole("button", { name: /pay online/i }).click();
  await page.waitForURL(/\/pay\/mock-checkout/);
  await page.getByRole("button", { name: /^pay /i }).click();
  await page.waitForURL(/\/pay\/success/);
  expect(fx("order", orderRef).paymentStatus).toBe("PAID");
});

test("9 · dashboard, reports and notification log reflect the job", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await adminUiLogin(page);
  await expect(page.getByRole("heading", { name: "Revenue" })).toBeVisible();
  await page.goto("/admin/reports");
  await expect(page.getByText("Booked revenue")).toBeVisible();
  order = fx("order", orderRef);
  // Booking confirmation, driver assigned, status updates, delivered, survey request…
  expect(order.notifications).toBeGreaterThanOrEqual(4);
  expect(order.templates).toEqual(expect.arrayContaining(["order.confirmed", "order.delivered"]));
  await page.goto(`/admin/orders/${order.id}`);
  await expect(page.getByText(orderRef).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-order-detail.png`, fullPage: true });
});

test("B2B · hotel concierge request → quotation on account → invoice with PO", async ({ playwright, request }) => {
  const hotel = fx("hotel");
  const portal = await playwright.request.newContext();
  const login = await portal.post(`${API}/v1/account/auth/login`, { data: { email: hotel.email, password: hotel.password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  const req = await portal.post(`${API}/v1/account/concierge/requests`, {
    data: {
      guestName: `Guest ${tag}`, guestRoom: "1204", pickupDate: "2026-12-20", timeWindow: "morning",
      hotelAddress: "Resort lobby, Miami Beach", hotelMarket: "miami", destinationType: "airport", destinationFacility: "MIA",
      pieces: [{ category: "large", quantity: 2 }], poNumber: `PO-${tag}`, acceptsProhibitedItemsPolicy: true,
    },
  });
  expect(req.status(), await req.text()).toBe(201);
  const created = await req.json();
  const reference: string = created.reference ?? created.quote?.reference;
  expect(reference).toMatch(/^EB-Q-/);

  await staffLogin(request);
  const quotes = await (await request.get(`${API}/v1/admin/quotes?q=${reference}`)).json();
  const qr = (quotes.quotes ?? quotes.items).find((x: { reference: string }) => x.reference === reference);
  const qt = await request.post(`${API}/v1/admin/quotations`, {
    data: {
      customerId: hotel.customerId, quoteRequestId: qr.id, title: "Guest luggage transfer, resort to MIA", depositType: "none",
      lines: [{ kind: "transport", description: "Resort to MIA luggage transfer", quantity: 1, unitCents: 9500, unitCostCents: 5200 }],
      details: { serviceType: "airport", pickup: { type: "hotel", address: "Resort lobby, Miami Beach", market: "miami" }, delivery: { type: "airport", address: "MIA", facility: "MIA", market: "miami" }, serviceDate: "2026-12-20", market: "miami", items: [{ category: "large", quantity: 2 }], poNumber: `PO-${tag}` },
    },
  });
  expect(qt.status(), await qt.text()).toBe(201);
  const quotation = (await qt.json()).quotation;
  const sent = await (await request.post(`${API}/v1/admin/quotations/${quotation.id}/send`)).json();
  const token = new URL(sent.link).pathname.split("/").pop()!;
  const acc = await request.post(`${API}/v1/q/${token}/accept`, { data: { name: "Front Office Manager", title: "Front office", agree: true } });
  expect(acc.ok(), await acc.text()).toBeTruthy();
  const accepted = await acc.json();
  expect(accepted.depositDue).toBe(false);
  const o = fx("order", accepted.orderReference);
  const inv = await request.post(`${API}/v1/admin/billing/invoices`, { data: { orderIds: [o.id], poNumber: `PO-${tag}`, send: true } });
  expect(inv.status(), await inv.text()).toBe(201);
  const invoice = (await inv.json()).invoice as { poNumber: string; dueAt: string; totalCents: number; status: string };
  expect(invoice.poNumber).toBe(`PO-${tag}`);
  expect(invoice.totalCents).toBe(9500);
  // Company terms: net 30
  expect(new Date(invoice.dueAt).getTime() - Date.now()).toBeGreaterThan(28 * 24 * 3600 * 1000);
  await portal.dispose();
});
