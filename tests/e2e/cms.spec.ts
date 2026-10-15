import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * CMS end to end: the owner writes and publishes a post with a cover image (it appears on /blog after
 * on-demand revalidation), a testimonial without written permission cannot be published, and a published
 * gallery photo appears on /gallery. Created content is removed afterwards.
 */
const API = process.env.E2E_API_URL || "http://localhost:4000";
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
  }),
);
// 64×40 navy PNG (a 1×1 image cannot be re-encoded to AVIF by the image optimizer)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAADBrGu+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAaklEQVRYhe2SAQkAURSDjGOk65/kx5DHDRZAZeB3e+QEToC8orsQd0dO4ATIK7oLcXfkBE6AvKK7EHdHTuAEyCu6C3F35AROgLyiuxB3R07gBMgrugtxd+QEToC8orsQd0dO4ATIK/rjCz0ZEwBMNIbeFAAAAABJRU5ErkJggg==", "base64");
const stamp = Date.now().toString(36);
const created: { posts: string[]; testimonials: string[]; gallery: string[] } = { posts: [], testimonials: [], gallery: [] };

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(env.ADMIN_EMAIL);
  await page.locator("#password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin(\/)?(\?.*)?$/, { timeout: 20_000 });
}

/** API context signed in as the owner (for cleanup and direct rule checks). */
async function ownerApi(request: APIRequestContext) {
  // Retry: the shared local dev database can drop a single query under load from other work
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await request.post(`${API}/v1/admin/auth/login`, { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
    if (res.ok()) return request;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Owner sign-in failed");
}

/** Removes this spec's test content by pattern (retries restart the worker, so in-memory ids can be lost). */
test.afterAll(async ({ request }) => {
  const api = await ownerApi(request);
  const posts = (await (await api.get(`${API}/v1/admin/cms/posts?search=${encodeURIComponent("Cruise-day luggage timing")}`)).json()).posts ?? [];
  for (const p of posts) if (/^Cruise-day luggage timing [a-z0-9]{6,}$/.test(p.title) || created.posts.includes(p.id)) await api.delete(`${API}/v1/admin/cms/posts/${p.id}`);
  const ts = (await (await api.get(`${API}/v1/admin/cms/testimonials`)).json()).testimonials ?? [];
  for (const t of ts) if (/again at the port [a-z0-9]{6,}\.$/.test(t.quote) || created.testimonials.includes(t.id)) await api.delete(`${API}/v1/admin/cms/testimonials/${t.id}`);
  const gs = (await (await api.get(`${API}/v1/admin/cms/gallery`)).json()).items ?? [];
  for (const g of gs) if (/^Box truck at a hotel entrance [a-z0-9]{6,}$/.test(g.alt) || created.gallery.includes(g.id)) await api.delete(`${API}/v1/admin/cms/gallery/${g.id}`);
});

test("owner writes and publishes a post with a cover image; it appears on the blog", async ({ page }) => {
  await login(page);
  await page.goto("/admin/content/posts/new");
  const title = `Cruise-day luggage timing ${stamp}`;
  await page.locator("#p-title").fill(title);
  await page.locator("#p-excerpt").fill("How to plan hotel-to-ship luggage on embarkation morning.");
  await page.locator("#p-body").fill(
    "## Start with the sailing\n\nShip name, sailing date and the bag count per guest decide the plan. Dispatch confirms the route, window and vehicle before we commit, subject to terminal rules.\n\n- Ship name\n- Bag count\n- Hotel pickup contact",
  );
  await page.locator("#p-cat").fill("Cruise-day planning");
  // Cover upload (file input inside the cover panel)
  await page.locator('input[type="file"]').last().setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByAltText("Cover preview")).toBeVisible();
  await page.getByRole("button", { name: /Publish now/ }).click();
  await expect(page.getByText("Published. The article is live on the website.")).toBeVisible({ timeout: 20_000 });
  const id = page.url().split("/").pop()!;
  created.posts.push(id);

  // Public blog (on-demand revalidation was triggered by the API)
  await expect(async () => {
    await page.goto("/blog");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("Express Bags Team").first()).toBeVisible();
  const cover = page.locator("article img").first();
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 15_000 }).toBe(true);
  // Article schema present
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((t) => t.includes('"BlogPosting"'))).toBe(true);
});

test("a testimonial without written permission cannot be published", async ({ page, request }) => {
  await login(page);
  await page.goto("/admin/content?tab=testimonials");
  await page.getByRole("button", { name: "Add testimonial" }).click();
  const quote = `Every bag was counted at pickup and again at the port ${stamp}.`;
  await page.locator("#t-quote").fill(quote);
  await page.locator("#t-attr").fill("Hotel operations manager, Miami Beach");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  const row = page.locator("tr", { hasText: stamp });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Publish" })).toBeDisabled();

  const api = await ownerApi(request);
  const list = await (await api.get(`${API}/v1/admin/cms/testimonials`)).json();
  const t = list.testimonials.find((x: { quote: string }) => x.quote === quote);
  created.testimonials.push(t.id);
  const res = await api.patch(`${API}/v1/admin/cms/testimonials/${t.id}`, { data: { published: true } });
  expect(res.status()).toBe(422);

  await page.goto("/testimonials");
  await expect(page.getByText(quote)).toHaveCount(0);
});

test("a published gallery photo appears on the gallery page", async ({ page }) => {
  await login(page);
  await page.goto("/admin/content?tab=gallery");
  const alt = `Box truck at a hotel entrance ${stamp}`;
  await page.locator("#g-file").setInputFiles({ name: "truck.png", mimeType: "image/png", buffer: PNG });
  await page.locator("#g-alt").fill(alt);
  await page.locator("#g-caption").fill("Hotel pickup");
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Uploaded. Review it, then publish.")).toBeVisible();
  const card = page.locator("li", { has: page.getByAltText(alt) });
  await card.getByRole("button", { name: "Publish" }).click();
  await expect(card.getByText("Live")).toBeVisible();

  await expect(async () => {
    await page.goto("/gallery");
    await expect(page.getByAltText(alt)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  const img = page.getByAltText(alt);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 15_000 }).toBe(true);
  // remember for cleanup
  const r = await page.request.get(`${API}/v1/content/gallery`);
  const item = (await r.json()).items.find((i: { alt: string }) => i.alt === alt);
  if (item) created.gallery.push(item.id);
});
