/**
 * CMS module: roles, post publish rules + scheduling, testimonial permission rule, gallery/media visibility
 * (public route never serves private uploads), history naming permission, and ISR revalidation calls.
 */
process.env.LOGIN_RATE_LIMIT = "10000";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL || (() => { try { process.loadEnvFile(".env"); return !!process.env.DATABASE_URL; } catch { return false; } })();

// 1×1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!hasDb)("cms module", async () => {
  // Capture revalidation calls the API makes to the website
  const calls: { secret?: string; paths: string[] }[] = [];
  const stub: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ secret: req.headers["x-revalidate-secret"] as string, paths: JSON.parse(body || "{}").paths ?? [] });
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  process.env.WEB_INTERNAL_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  process.env.REVALIDATE_SECRET = "test-revalidate-secret-123";

  const { app } = await import("../../../app");
  const { prisma } = await import("../../../db");
  const { hashPassword } = await import("../../../auth");
  const tag = randomBytes(3).toString("hex");
  const pw = `Cms-Test-Pass-${tag}!`;
  const emails = { staff: `cms-staff-${tag}@test.local`, disp: `cms-disp-${tag}@test.local`, acct: `cms-acct-${tag}@test.local` };
  const created = { posts: [] as string[], testimonials: [] as string[], gallery: [] as string[], resources: [] as string[], uploads: [] as string[], history: [] as string[] };

  beforeAll(async () => {
    const passwordHash = await hashPassword(pw);
    await prisma.user.createMany({
      data: [
        { email: emails.staff, role: "STAFF", passwordHash },
        { email: emails.disp, role: "DISPATCHER", passwordHash },
        { email: emails.acct, role: "ACCOUNTING", passwordHash },
      ],
    });
  });
  afterAll(async () => {
    await prisma.post.deleteMany({ where: { id: { in: created.posts } } });
    await prisma.testimonial.deleteMany({ where: { id: { in: created.testimonials } } });
    await prisma.galleryItem.deleteMany({ where: { id: { in: created.gallery } } });
    await prisma.resource.deleteMany({ where: { id: { in: created.resources } } });
    await prisma.historyEntryDisplay.deleteMany({ where: { entryId: { in: created.history } } });
    await prisma.notableProjectPermission.deleteMany({ where: { projectId: { in: created.history } } });
    await prisma.historyEntry.deleteMany({ where: { id: { in: created.history } } });
    await prisma.upload.deleteMany({ where: { id: { in: created.uploads } } });
    const users = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await new Promise<void>((r) => stub.close(() => r()));
  });

  const as = async (email: string) => {
    const agent = request.agent(app);
    expect((await agent.post("/v1/admin/auth/login").send({ email, password: pw })).status).toBe(200);
    return agent;
  };

  it("only owner/staff may manage content", async () => {
    expect((await request(app).get("/v1/admin/cms/posts")).status).toBe(401);
    expect((await (await as(emails.disp)).get("/v1/admin/cms/posts")).status).toBe(403);
    expect((await (await as(emails.acct)).post("/v1/admin/cms/posts").send({ title: "Nope" })).status).toBe(403);
    expect((await (await as(emails.staff)).get("/v1/admin/cms/posts")).status).toBe(200);
  });

  it("posts: drafts are private, publish rules apply, author is always the company, scheduling hides future posts", async () => {
    const staff = await as(emails.staff);
    const draft = await staff.post("/v1/admin/cms/posts").send({ title: `Cruise day timing ${tag}`, body: "Too short." });
    expect(draft.status).toBe(201);
    created.posts.push(draft.body.post.id);
    expect(draft.body.post.authorLabel).toBe("Express Bags Team");
    expect(draft.body.post.slug).toBe(`cruise-day-timing-${tag}`);
    // same title → unique slug
    const dupe = await staff.post("/v1/admin/cms/posts").send({ title: `Cruise day timing ${tag}`, body: "x" });
    created.posts.push(dupe.body.post.id);
    expect(dupe.body.post.slug).toBe(`cruise-day-timing-${tag}-2`);

    // Not public while draft
    expect((await request(app).get(`/v1/content/posts/${draft.body.post.slug}`)).status).toBe(404);
    // Publish rules
    const bad = await staff.post(`/v1/admin/cms/posts/${draft.body.post.id}/publish`).send({});
    expect(bad.status).toBe(422);

    const body = "## What to prepare\n\nShip name, sailing date, bag count per guest and the hotel pickup contact. Dispatch confirms the route, window and vehicle before we commit.\n\n- Ship name\n- Bag count";
    await staff.patch(`/v1/admin/cms/posts/${draft.body.post.id}`).send({ body, excerpt: "Embarkation-day checklist.", category: "Cruise-day planning" });
    calls.length = 0;
    const pub = await staff.post(`/v1/admin/cms/posts/${draft.body.post.id}/publish`).send({});
    expect(pub.status).toBe(200);
    expect(pub.body.scheduled).toBe(false);
    expect(calls.at(-1)?.secret).toBe("test-revalidate-secret-123");
    expect(calls.at(-1)?.paths).toEqual(expect.arrayContaining(["/blog", `/blog/${draft.body.post.slug}`, "/blog/category/cruise-day-planning", "/sitemap.xml"]));

    const live = await request(app).get(`/v1/content/posts/${draft.body.post.slug}`);
    expect(live.status).toBe(200);
    expect(live.body.post.author).toBe("Express Bags Team");
    const list = await request(app).get("/v1/content/posts");
    expect(list.body.posts.some((p: { slug: string }) => p.slug === draft.body.post.slug)).toBe(true);
    expect(list.body.categories.some((c: { slug: string }) => c.slug === "cruise-day-planning")).toBe(true);

    // Schedule the second post in the future → not public yet
    await staff.patch(`/v1/admin/cms/posts/${dupe.body.post.id}`).send({ body, excerpt: "Later." });
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const sch = await staff.post(`/v1/admin/cms/posts/${dupe.body.post.id}/publish`).send({ publishedAt: future });
    expect(sch.body.scheduled).toBe(true);
    expect((await request(app).get(`/v1/content/posts/${dupe.body.post.slug}`)).status).toBe(404);

    // Unpublish → gone again
    await staff.post(`/v1/admin/cms/posts/${draft.body.post.id}/unpublish`).send({});
    expect((await request(app).get(`/v1/content/posts/${draft.body.post.slug}`)).status).toBe(404);
  });

  it("testimonials cannot be published without recorded written permission", async () => {
    const staff = await as(emails.staff);
    expect((await staff.post("/v1/admin/cms/testimonials").send({ quote: "Great service from the whole team.", attribution: "jane@example.com" })).status).toBe(400);
    const t = await staff.post("/v1/admin/cms/testimonials").send({ quote: `Every bag arrived and was counted twice ${tag}.`, attribution: "Hotel operations manager, Miami Beach" });
    expect(t.status).toBe(201);
    created.testimonials.push(t.body.testimonial.id);
    const id = t.body.testimonial.id;
    expect((await staff.patch(`/v1/admin/cms/testimonials/${id}`).send({ published: true })).status).toBe(422);
    expect((await staff.patch(`/v1/admin/cms/testimonials/${id}`).send({ published: true, permissionGranted: true, permissionNote: "x" })).status).toBe(422);
    const ok = await staff.patch(`/v1/admin/cms/testimonials/${id}`).send({ published: true, permissionGranted: true, permissionNote: "Approved by email from the client's GM on 2026-10-01." });
    expect(ok.status).toBe(200);
    expect(ok.body.testimonial.published).toBe(true);
    expect((await request(app).get("/v1/content/testimonials")).body.testimonials.some((x: { id: string }) => x.id === id)).toBe(true);
    // Revoking permission unpublishes
    const revoked = await staff.patch(`/v1/admin/cms/testimonials/${id}`).send({ permissionGranted: false });
    expect(revoked.body.testimonial.published).toBe(false);
    expect((await request(app).get("/v1/content/testimonials")).body.testimonials.some((x: { id: string }) => x.id === id)).toBe(false);
  });

  it("media route serves only published CMS media, never other uploads", async () => {
    const staff = await as(emails.staff);
    // A non-CMS upload (e.g. a quote attachment) is never public
    const priv = await request(app).post("/v1/uploads").attach("file", PNG, { filename: "private.png", contentType: "image/png" });
    expect(priv.status).toBe(201);
    created.uploads.push(priv.body.id);
    expect((await request(app).get(`/v1/content/media/${priv.body.id}`)).status).toBe(404);
    await prisma.upload.update({ where: { id: priv.body.id }, data: { isPublic: true } }); // even if mis-flagged…
    expect((await request(app).get(`/v1/content/media/${priv.body.id}`)).status).toBe(404); // …it isn't CMS-owned

    // Gallery: images only; private until published
    const noImg = await staff.post("/v1/admin/cms/gallery").attach("file", Buffer.from("%PDF-1.4"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(noImg.status).toBe(415);
    const up = await staff.post("/v1/admin/cms/gallery").field("alt", "Box truck at a hotel entrance").field("caption", "Hotel pickup").attach("file", PNG, { filename: "truck.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    created.gallery.push(up.body.item.id);
    created.uploads.push(up.body.item.uploadId);
    expect(up.body.item.alt).toBe("Box truck at a hotel entrance");
    const mediaId = up.body.item.uploadId as string;
    expect((await request(app).get(`/v1/content/media/${mediaId}`)).status).toBe(404);
    expect((await staff.get(`/v1/admin/cms/media/${mediaId}`)).status).toBe(200); // staff preview works

    await staff.patch(`/v1/admin/cms/gallery/${up.body.item.id}`).send({ published: true });
    const pub = await request(app).get(`/v1/content/media/${mediaId}`);
    expect(pub.status).toBe(200);
    expect(pub.headers["content-type"]).toMatch(/image\/png/);
    expect(pub.headers["cache-control"]).toMatch(/immutable/);
    expect((await request(app).get("/v1/content/gallery")).body.items.some((i: { mediaId: string }) => i.mediaId === mediaId)).toBe(true);

    await staff.patch(`/v1/admin/cms/gallery/${up.body.item.id}`).send({ published: false });
    expect((await request(app).get(`/v1/content/media/${mediaId}`)).status).toBe(404);

    // Publishing without alt text is refused
    await prisma.galleryItem.update({ where: { id: up.body.item.id }, data: { alt: "" } });
    expect((await staff.patch(`/v1/admin/cms/gallery/${up.body.item.id}`).send({ published: true })).status).toBe(422);
  });

  it("downloads: title required, public only when published", async () => {
    const staff = await as(emails.staff);
    expect((await staff.post("/v1/admin/cms/resources").attach("file", Buffer.from("%PDF-1.4 test"), { filename: "m.pdf", contentType: "application/pdf" })).status).toBe(400);
    const r = await staff.post("/v1/admin/cms/resources").field("title", `Manifest template ${tag}`).attach("file", Buffer.from("%PDF-1.4 test"), { filename: "manifest.pdf", contentType: "application/pdf" });
    expect(r.status).toBe(201);
    created.resources.push(r.body.resource.id);
    created.uploads.push(r.body.resource.uploadId);
    expect((await request(app).get(`/v1/content/media/${r.body.resource.uploadId}`)).status).toBe(404);
    await staff.patch(`/v1/admin/cms/resources/${r.body.resource.id}`).send({ published: true });
    expect((await request(app).get(`/v1/content/media/${r.body.resource.uploadId}`)).status).toBe(200);
    const list = await request(app).get("/v1/content/resources");
    expect(list.body.resources.find((x: { id: string }) => x.id === r.body.resource.id)?.mediaId).toBe(r.body.resource.uploadId);
  });

  it("history: names only with a recorded permission note; partners and locations stay private otherwise", async () => {
    const staff = await as(emails.staff);
    const e = await staff.post("/v1/admin/cms/history").send({
      year: "2024", title: `Famous Artist Tour ${tag}`, genericTitle: "Touring-artist operations", contractingCustomer: `Secret Partner ${tag}`,
      endClient: `Famous Artist ${tag}`, projectType: "Entertainment", locations: [`Luxury Hotel ${tag}`], evidenceLevel: "end-client-project",
      genericSummary: "26-foot truck luggage movement from a luxury Miami hotel to a private aviation terminal.",
    });
    expect(e.status).toBe(201);
    const id = e.body.entry.id as string;
    created.history.push(id);

    // Hidden by default
    let pub = JSON.stringify((await request(app).get("/v1/content/history")).body);
    expect(pub).not.toContain(tag);

    await staff.put(`/v1/admin/cms/history/${id}/visibility`).send({ visibility: "GENERIC" });
    pub = JSON.stringify((await request(app).get("/v1/content/history")).body);
    expect(pub).not.toContain(tag); // no title, partner, client or location names
    expect(pub).not.toContain(id); // opaque key, not the internal id
    expect(pub).toContain("Touring-artist operations");

    expect((await staff.put(`/v1/admin/cms/history/${id}/visibility`).send({ visibility: "NAMED" })).status).toBe(422);
    calls.length = 0;
    const named = await staff.put(`/v1/admin/cms/history/${id}/visibility`).send({ visibility: "NAMED", permissionNote: "Written approval from the artist's management, email 2026-10-05." });
    expect(named.status).toBe(200);
    expect(calls.at(-1)?.paths).toEqual(expect.arrayContaining(["/our-history", "/notable-projects"]));
    const entries = (await request(app).get("/v1/content/history")).body.entries as { title: string; through: string | null; locations: string[] }[];
    const row = entries.find((x) => x.title === `Famous Artist Tour ${tag}`);
    expect(row?.through).toBe(`Secret Partner ${tag}`);
    expect(row?.locations).toEqual([`Luxury Hotel ${tag}`]);
    expect((await staff.get("/v1/admin/cms/permissions")).body.granted).toContain(id);

    // Back to generic revokes the permission
    await staff.put(`/v1/admin/cms/history/${id}/visibility`).send({ visibility: "GENERIC" });
    expect(JSON.stringify((await request(app).get("/v1/content/history")).body)).not.toContain(tag);
    expect((await staff.get("/v1/admin/cms/permissions")).body.granted).not.toContain(id);
  });
});
