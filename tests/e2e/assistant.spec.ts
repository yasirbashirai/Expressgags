import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Website assistant end to end (scripted mode, no AI key): widget opens, English + Spanish exchange,
 * handoff reaches the office inbox, and on phones the launcher never covers the quote wizard's action bar.
 */
const API = process.env.E2E_API_URL || "http://localhost:4000";
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
const stamp = Date.now().toString(36);

/** The cookie banner (if shown) takes priority over the chat button: make a choice first. */
async function dismissConsent(page: import("@playwright/test").Page) {
  const banner = page.getByTestId("consent-banner");
  if (await banner.isVisible({ timeout: 2500 }).catch(() => false)) await banner.getByRole("button", { name: /Necessary only/i }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("eb-assistant-session-v1");
      sessionStorage.removeItem("eb-assistant-transcript-v1");
    } catch {
      /* ignore */
    }
  });
});

test("assistant opens, answers in English, closes with Escape", async ({ page }) => {
  await page.goto("/");
  await dismissConsent(page);
  const launcher = page.getByTestId("assistant-launcher");
  await expect(launcher).toBeVisible({ timeout: 10_000 });
  await launcher.click();
  const panel = page.getByRole("dialog", { name: "Express Bags assistant" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("textbox")).toBeFocused();
  await panel.getByRole("textbox").fill("Do you cover Key West?");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.getByText(/Key West|Keys/).nth(1)).toBeVisible({ timeout: 15_000 });
  await expect(panel).not.toContainText(/\$\s?\d/);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("Spanish conversation", async ({ page }) => {
  await page.goto("/");
  await dismissConsent(page);
  await page.getByTestId("assistant-launcher").click();
  const panel = page.getByTestId("assistant-panel");
  await panel.getByRole("button", { name: "ES", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Asistente de Express Bags" })).toBeVisible();
  await panel.getByRole("textbox").fill("¿Cuánto cuesta llevar maletas al aeropuerto?");
  await panel.getByRole("button", { name: "Enviar" }).click();
  await expect(panel.getByText(/cotiza/i).last()).toBeVisible({ timeout: 15_000 });
  await expect(panel).not.toContainText(/\$\s?\d/);
});

test("talk to a person creates a lead in the office inbox", async ({ page, request }) => {
  await page.goto("/");
  await dismissConsent(page);
  await page.getByTestId("assistant-launcher").click();
  const panel = page.getByTestId("assistant-panel");
  await panel.getByRole("button", { name: "Talk to a person" }).click();
  const form = panel.getByTestId("assistant-handoff");
  await form.getByLabel("Your name").fill(`E2E Handoff ${stamp}`);
  await form.getByLabel("Phone").fill("305 555 0142");
  await form.getByLabel("What do you need?").fill("Group of 40 guests, hotel to PortMiami next month.");
  await form.getByRole("button", { name: "Send to the team" }).click();
  await expect(panel.getByText(/A coordinator will contact you soon/)).toBeVisible();

  const login = await request.post(`${API}/v1/admin/auth/login`, { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const msgs = await (await request.get(`${API}/v1/admin/messages`)).json();
  const list = (msgs.messages ?? msgs.items ?? msgs.rows ?? []) as { name: string; topic: string }[];
  expect(list.some((m) => m.name === `E2E Handoff ${stamp}` && m.topic.startsWith("assistant-handoff"))).toBeTruthy();
});

test("the chat button steps aside while the cookie banner is open", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByTestId("consent-banner");
  test.skip(!(await banner.isVisible({ timeout: 2500 }).catch(() => false)), "consent banner not shown in this build");
  await expect(page.getByTestId("assistant-launcher")).toHaveCount(0);
  await banner.getByRole("button", { name: /Necessary only/i }).click();
  await expect(page.getByTestId("assistant-launcher")).toBeVisible();
});

test("on phones the launcher never covers the quote wizard action bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/request-a-quote");
  await dismissConsent(page);
  const launcher = page.getByTestId("assistant-launcher");
  await expect(launcher).toBeVisible({ timeout: 10_000 });
  const cont = page.getByRole("button", { name: /^Continue/ });
  await expect(cont).toBeVisible();
  const a = (await launcher.boundingBox())!;
  const b = (await cont.boundingBox())!;
  const overlap = !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  expect(overlap).toBeFalsy();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("phone: chat opens as a full-screen sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await dismissConsent(page);
  await page.getByTestId("assistant-launcher").click();
  const box = (await page.getByTestId("assistant-panel").boundingBox())!;
  expect(Math.round(box.width)).toBe(390);
  expect(box.height).toBeGreaterThan(800);
});
