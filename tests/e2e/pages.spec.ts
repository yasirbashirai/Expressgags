import { expect, test } from "@playwright/test";

/** Every URL in the sitemap: loads, one H1, title + description, no console errors, no sideways scroll on phones. */
test("every sitemap page renders cleanly on desktop and phone", async ({ page, request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(urls.length).toBeGreaterThan(50);

  const problems: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") problems.push(`${page.url()} console: ${msg.text()}`); });

  for (const path of urls) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      if (!res || res.status() !== 200) { problems.push(`${path} status ${res?.status()}`); continue; }
      if (width === 1440) {
        const h1 = await page.locator("h1").count();
        if (h1 !== 1) problems.push(`${path} has ${h1} h1`);
        const title = await page.title();
        const desc = await page.locator('meta[name="description"]').getAttribute("content");
        if (!title || title.length < 10) problems.push(`${path} weak title "${title}"`);
        if (!desc || desc.length < 50) problems.push(`${path} weak description`);
        const imgsNoAlt = await page.locator("img:not([alt])").count();
        if (imgsNoAlt) problems.push(`${path} ${imgsNoAlt} img without alt`);
      } else {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) problems.push(`${path} horizontal scroll ${overflow}px at 390`);
      }
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("old website URLs redirect", async ({ request }) => {
  for (const [from, to] of [["/home", "/"], ["/our-team", "/about"], ["/locations", "/service-areas"]]) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(308);
    expect(new URL(res.headers().location, "http://x").pathname).toBe(to);
  }
});

test("unknown URL shows branded 404 with site navigation", async ({ page }) => {
  const res = await page.goto("/this-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This page took a different route.")).toBeVisible();
  await expect(page.locator("header").first()).toBeVisible();
});

test("admin is hidden from search engines and has no public header", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  await page.goto("/admin/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("link", { name: "Request a Quote" })).toHaveCount(0);
});
