import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Public-site experience tests: route planner, motion, accessibility, mobile layout, Spanish pages, header menus. */

const PAGES = [
  "/", "/services", "/services/airport-luggage", "/service-areas", "/service-areas/miami", "/airports", "/airports/mia-miami-international-airport",
  "/ports", "/ports/portmiami", "/about", "/industries", "/fleet", "/business-accounts", "/faq", "/contact", "/careers",
  "/es", "/es/servicios", "/es/areas/miami", "/es/areas/florida-keys-key-west",
];

// Keep the cookie banner out of the way (it is tested by its own module)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("eb-consent-v1", JSON.stringify({ analytics: false, marketing: false, at: new Date().toISOString(), v: 1 })); } catch {}
  });
});

async function plan(page: Page, from: string, to: string, item: string, storage = false) {
  const planner = page.locator("section", { has: page.getByRole("heading", { name: "Where is it going?" }) });
  await planner.getByLabel("From", { exact: true }).selectOption(from);
  await planner.getByLabel("To", { exact: true }).selectOption(to);
  await planner.getByText(item, { exact: true }).click();
  const box = planner.getByRole("checkbox");
  if ((await box.isChecked()) !== storage) await box.click();
  return planner;
}

test("route planner recommends the right service and prefills the quote link", async ({ page }) => {
  await page.goto("/");
  const cases: [string, string, string, boolean, RegExp, string, boolean][] = [
    ["local:miami", "port:portmiami", "A few suitcases (1 to 10)", false, /Cruise-Port/, "type=cruise&market=miami", false],
    ["airport:MIA", "local:fort-lauderdale-broward", "A few suitcases (1 to 10)", false, /Airport Luggage/, "type=airport&market=miami", false],
    ["local:miami", "outside", "A few suitcases (1 to 10)", false, /Nationwide luggage shipping/, "type=nationwide-shipping&market=miami", false],
    ["other", "local:orlando", "Pallets, equipment or cargo", false, /Box-Truck/, "type=truck&market=orlando", true],
    ["local:tampa", "local:tampa", "A group or many bags", false, /VIP & Group/, "type=group-event&market=tampa", false],
    ["local:miami", "airport:MIA", "A few suitcases (1 to 10)", true, /Storage/, "type=storage&market=miami", false],
  ];
  for (const [from, to, item, storage, service, query, special] of cases) {
    const planner = await plan(page, from, to, item, storage);
    await expect(planner.getByTestId("planner-service")).toHaveText(service);
    await expect(planner.getByTestId("planner-cta")).toHaveAttribute("href", `/request-a-quote?${query}`);
    await expect(planner.getByTestId("planner-special")).toHaveCount(special ? 1 : 0);
  }
});

test("reduced motion renders every section in its final state", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForTimeout(400);
  expect(await page.locator('[data-reveal="out"]').count()).toBe(0);
  const opacity = await page.locator(".anim-fade-up").first().evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBe(1);
  await expect(page.getByRole("heading", { name: "Proof of delivery" })).toBeVisible();
  await ctx.close();
});

test("no serious or critical accessibility violations on public pages", async ({ page }) => {
  const problems: string[] = [];
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(150);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("[data-nextjs-toast]").analyze();
    for (const v of r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) {
      problems.push(`${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("no horizontal scroll at 390px and the mobile action bar is present", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  await page.goto("/services");
  await expect(page.getByTestId("mobile-action-bar")).toBeVisible();
  await page.goto("/request-a-quote");
  await expect(page.getByTestId("mobile-action-bar")).toHaveCount(0);
});

test("Spanish pages declare their language and hreflang alternates", async ({ page }) => {
  for (const [es, en] of [["/es", "/"], ["/es/servicios", "/services"], ["/es/areas/miami", "/service-areas/miami"]]) {
    await page.goto(es);
    // The (es) root layout sets the document language itself (no wrapper div needed)
    await expect(page.locator("html")).toHaveAttribute("lang", "es-US");
    await expect(page.locator('link[rel="alternate"][hreflang="en-US"]')).toHaveAttribute("href", en === "/" ? /express-bags\.com\/?$/ : new RegExp(`${en}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="es-US"]')).toHaveAttribute("href", new RegExp(`${es}$`));
    await expect(page.getByRole("link", { name: /Solicitar cotización/ }).first()).toBeVisible();
  }
  await page.goto("/service-areas/miami");
  await expect(page.locator('link[rel="alternate"][hreflang="es-US"]')).toHaveAttribute("href", /\/es\/areas\/miami$/);
});

test("header mega menu and mobile drawer are keyboard friendly", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const btn = page.getByRole("button", { name: "Services" });
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#mega-services").getByRole("link", { name: /Cruise-Port Luggage Logistics/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("link", { name: /Ver esta página en español/ }).click();
  await expect(page).toHaveURL(/\/es$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.locator("#mobile-menu")).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
});

test("FAQ search and topic filters narrow the answers", async ({ page }) => {
  await page.goto("/faq");
  await page.getByLabel("Search frequently asked questions").fill("short-term");
  await expect(page.getByRole("button", { name: /Do you store luggage/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /How much does it cost/ })).toBeHidden();
  await page.getByLabel("Search frequently asked questions").fill("");
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  await expect(page.getByRole("button", { name: /How much does it cost/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Do you store luggage/ })).toBeHidden();
  const html = await page.content();
  expect(html.match(/"@type":"FAQPage"/g)?.length).toBe(1);
});
