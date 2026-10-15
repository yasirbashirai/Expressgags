/**
 * Driver app end to end on a phone viewport (real API + Postgres, nothing mocked):
 * sign in → open job → accept → en route → checklist → type piece IDs → condition photo → confirm pickup
 * → out for delivery → re-scan (one scan while OFFLINE, synced after reconnect) → recipient + signature
 * → delivered. Verifies the order is DELIVERED with signed proof in the database.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  channel: "chrome",
  permissions: ["geolocation"],
  geolocation: { latitude: 25.7907, longitude: -80.1300 },
});

type Fixture = { email: string; password: string; orderId: string; reference: string; pieces: string[]; ids: unknown };
const tsx = (...args: string[]) => execFileSync("npx", ["tsx", "tests/e2e/driver-fixture.ts", ...args], { encoding: "utf8" }).trim().split("\n").pop()!;
const SHOTS = ".qa/driver";
mkdirSync(SHOTS, { recursive: true });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let fx: Fixture;
test.beforeAll(() => {
  fx = JSON.parse(tsx("create"));
});
test.afterAll(() => {
  if (fx) tsx("cleanup", JSON.stringify(fx));
});

async function typePiece(page: Page, id: string) {
  await page.locator("#manual-code").fill(id.toLowerCase());
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test("driver completes a pickup and delivery with proof", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(m.text()) && consoleErrors.push(m.text()));

  // Sign in
  await page.goto("/driver/login");
  await page.screenshot({ path: `${SHOTS}/01-login-390.png`, fullPage: true });
  await page.locator("#d-email").fill(fx.email);
  await page.locator("#d-password").fill(fx.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/driver$/);

  // Job list
  await expect(page.getByText(fx.reference)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-jobs-390.png`, fullPage: true });
  await page.getByRole("link", { name: /Open job/ }).first().click();
  await page.waitForURL(/\/driver\/jobs\//);

  // Accept → en route
  await page.getByRole("button", { name: "Accept job" }).click();
  await page.getByRole("button", { name: "Start driving to pickup" }).click();
  await expect(page.getByRole("heading", { name: /At pickup/ })).toBeVisible();

  // Checklist + scans
  for (const label of ["Checked in with the authorized contact", "Read and confirmed the job instructions", /Bag count matches/]) {
    await page.getByLabel(label).check();
  }
  await expect(page.getByRole("button", { name: /Confirm pickup/ })).toBeDisabled();
  await typePiece(page, fx.pieces[0]);
  await typePiece(page, fx.pieces[1]);
  await expect(page.getByTestId("scan-progress")).toContainText("2 of 3");
  // A foreign tag is rejected locally
  await typePiece(page, "EB-000000-ZZZZ-01");
  await expect(page.getByText(/is not part of this order/)).toBeVisible();
  await typePiece(page, fx.pieces[2]);
  await expect(page.getByTestId("scan-progress")).toContainText("3 of 3");

  // Condition photo
  await page.locator("#photo-Addconditionphotos").setInputFiles({ name: "bag.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("list", { name: "1 photos added" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-pickup-390.png`, fullPage: true });
  await page.getByRole("button", { name: /Confirm pickup \(3 of 3\)/ }).click();
  await expect(page.getByText("Picked up").first()).toBeVisible();

  // Out for delivery → re-scan, one scan while offline
  await page.getByRole("button", { name: "Out for delivery" }).click();
  await expect(page.getByRole("heading", { name: /Re-count at handoff/ })).toBeVisible();
  await typePiece(page, fx.pieces[0]);
  await context.setOffline(true);
  await typePiece(page, fx.pieces[1]);
  await expect(page.getByTestId("sync-banner")).toContainText(/1 action waiting to sync/);
  await page.screenshot({ path: `${SHOTS}/04-offline-390.png`, fullPage: false });
  await context.setOffline(false);
  await expect(page.getByTestId("sync-banner")).toHaveCount(0, { timeout: 15_000 });
  await typePiece(page, fx.pieces[2]);
  await expect(page.getByTestId("scan-progress")).toContainText("3 of 3");

  // Recipient + signature
  await page.locator("#recipient").fill("Terminal porter");
  const canvas = page.getByTestId("signature-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 22, box.y + 100 + Math.sin(i) * 40);
  await page.mouse.up();
  await expect(page.getByText("Signature captured.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-delivery-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Confirm delivery" }).click();
  await expect(page.getByText("Job complete")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/06-done-390.png`, fullPage: true });

  // Database: delivered, with signed delivery proof and a photo on pickup proof
  const db = JSON.parse(tsx("status", fx.orderId));
  expect(db.status).toBe("DELIVERED");
  expect(db.eventsWithGps).toBeGreaterThan(0); // scans/status changes carry the phone's location
  expect(db.proofs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "PICKUP", photos: 1 }),
      expect.objectContaining({ kind: "DELIVERY", recipientName: "Terminal porter", signed: true }),
    ]),
  );
  // No horizontal scroll on the phone
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);
});

test("desktop width still renders the job list cleanly", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/driver/login");
  await page.locator("#d-email").fill(fx.email);
  await page.locator("#d-password").fill(fx.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/driver$/);
  await page.getByRole("tab", { name: "Completed" }).click();
  await expect(page.getByText(fx.reference)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-completed-1440.png`, fullPage: true });
  await page.getByRole("link", { name: /Open job/ }).first().click();
  await expect(page.getByText("Job complete")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-job-1440.png`, fullPage: true });
});
