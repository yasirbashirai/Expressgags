import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { generateSync } from "otplib";
import pg from "pg";
import { expect, test } from "@playwright/test";

/**
 * Resources E2E: owner enrolls two-factor sign-in, signs in with a TOTP code, adds a team member and a
 * vehicle through the UI, and sees an expiring credential on the credentials register.
 */
const DB_URL = readFileSync(".env", "utf8").match(/DATABASE_URL="?([^"\n]+)"?/)![1];
const tag = Date.now().toString(36);
const email = `e2e-res-owner-${tag}@test.local`;
const password = `E2E-Resources-Pass-${tag}!`;
const API = process.env.E2E_API_URL || "http://localhost:4000";

async function db<T>(fn: (c: pg.Client) => Promise<T>) {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const hash = await bcrypt.hash(password, 10);
  await db((c) =>
    c.query(
      `INSERT INTO "User"(id,email,"passwordHash",role,active,"createdAt","updatedAt","totpEnabled","failedLogins","mustChangePassword","tokenVersion","totpRecoveryCodes")
       VALUES ($1,$2,$3,'OWNER',true,now(),now(),false,0,false,0,'{}')`,
      [`e2e_res_${tag}`, email, hash],
    ),
  );
});

test.afterAll(async () => {
  await db(async (c) => {
    await c.query(`DELETE FROM "Credential" WHERE identifier LIKE $1`, [`E2E-${tag}%`]);
    await c.query(`DELETE FROM "Employee" WHERE "lastName" = $1`, [`Tester-${tag}`]);
    await c.query(`DELETE FROM "Vehicle" WHERE "unitNumber" = $1`, [`E2E-${tag}`]);
    await c.query(`DELETE FROM "AuditLog" WHERE "userId" = $1`, [`e2e_res_${tag}`]);
    await c.query(`DELETE FROM "User" WHERE id = $1`, [`e2e_res_${tag}`]);
  });
});

let secret = "";
let recoveryCodes: string[] = [];

test("owner enrolls two-factor sign-in", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
  await page.goto("/admin/users/me");
  await page.getByRole("button", { name: "Set up two-factor" }).click();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.locator("#tf-enable-code").fill(generateSync({ secret }));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  recoveryCodes = await page.getByTestId("recovery-codes").locator("li").allTextContents();
  await expect(page.getByText("On. You will be asked for a 6-digit code at sign-in.")).toBeVisible();
});

test("sign-in now requires the authenticator code", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#totp")).toBeVisible();
  // wrong code first
  await page.locator("#totp").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("not valid");
  // the enrollment code's time step is spent, so use the next one (replay protection)
  await page.locator("#totp").fill(generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 }));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await page.waitForURL(/\/admin$/);

  // Add a team member through the UI
  await page.goto("/admin/team");
  await page.getByRole("button", { name: "Add team member" }).click();
  await page.locator("#emp-first").fill("Dana");
  await page.locator("#emp-last").fill(`Tester-${tag}`);
  await page.locator("#emp-role").selectOption("DRIVER");
  await page.getByRole("dialog").getByRole("button", { name: "Add team member" }).click();
  await page.waitForURL(/\/admin\/team\/c/);
  await expect(page.getByRole("heading", { name: `Dana Tester-${tag}` })).toBeVisible();
  const employeeId = page.url().split("/").pop()!;

  // Add a vehicle through the UI
  await page.goto("/admin/fleet");
  await page.getByRole("button", { name: "Add vehicle" }).click();
  await page.locator("#v-unit").fill(`E2E-${tag}`);
  await page.locator("#v-class").selectOption("box-20");
  await page.getByRole("dialog").getByRole("button", { name: "Add vehicle" }).click();
  await page.waitForURL(/\/admin\/fleet\/c/);
  await expect(page.getByRole("heading", { name: `Unit E2E-${tag}` })).toBeVisible();

  // An expiring credential for that person (added through the profile's dialog)
  await page.goto(`/admin/team/${employeeId}`);
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page.locator("#cred-type").selectOption("TWIC");
  await page.locator("#cred-facility").selectOption("portmiami");
  await page.locator("#cred-id").fill(`E2E-${tag}-TWIC`);
  const soon = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
  await page.locator("#cred-expires").fill(soon);
  await page.getByRole("button", { name: "Save credential" }).click();
  await expect(page.getByText(`E2E-${tag}-TWIC`)).toBeVisible();

  // It shows on the register, filtered to the next 30 days
  await page.goto("/admin/credentials?within=30");
  const row = page.getByRole("row").filter({ hasText: `E2E-${tag}-TWIC` });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`Dana Tester-${tag}`);
  await expect(row).toContainText(/\d+d ·/);
});

test("API rejects the session cookie once the password changes elsewhere", async ({ request }) => {
  // Fresh API login with a single-use recovery code (TOTP steps in this window are already spent),
  // then a password change elsewhere bumps tokenVersion → the old cookie is rejected
  const login = await request.post(`${API}/v1/admin/auth/login`, { data: { email, password, recoveryCode: recoveryCodes[0] } });
  expect(login.status()).toBe(200);
  expect((await request.get(`${API}/v1/admin/auth/me`)).status()).toBe(200);
  await db((c) => c.query(`UPDATE "User" SET "tokenVersion" = "tokenVersion" + 1 WHERE email = $1`, [email]));
  expect((await request.get(`${API}/v1/admin/auth/me`)).status()).toBe(401);
});
