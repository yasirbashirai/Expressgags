/**
 * Demo/initial content for the CMS module.
 *  - Imports the company-history content model from the History & Roadmap brief (src/content/site.ts
 *    notableProjects) with GENERIC visibility — no names until written permission is recorded.
 *  - Adds two DRAFT blog posts (never published by the seed: no fake public articles) and one DRAFT
 *    testimonial without permission, so the admin screens have something to review.
 * Idempotent. Usage: await seedCms(prisma)  ·  standalone: npx tsx prisma/seed-demo/cms.ts
 */
import { notableProjects } from "../../src/content/site";
import type { PrismaClient } from "../../src/server/generated/prisma/client";

export async function seedCms(prisma: PrismaClient) {
  let history = 0;
  for (const [i, p] of notableProjects.entries()) {
    if (await prisma.historyEntry.findUnique({ where: { id: p.id } })) continue;
    await prisma.historyEntry.create({
      data: {
        id: p.id, year: p.period, title: p.title, endClient: p.title, contractingCustomer: p.through ?? null, projectType: p.type,
        locations: [], evidenceLevel: p.evidence, visibility: "GENERIC", genericSummary: p.summary, sortOrder: i,
      },
    });
    await prisma.historyEntryDisplay.upsert({ where: { entryId: p.id }, update: {}, create: { entryId: p.id, genericTitle: p.genericTitle } });
    history++;
  }

  let posts = 0;
  const drafts = [
    {
      slug: "demo-draft-cruise-day-luggage-timing",
      title: "Cruise-day luggage timing at PortMiami (demo draft)",
      category: "Cruise-day planning",
      excerpt: "A planning checklist for hotel-to-ship luggage on embarkation day. Demo draft, review before publishing.",
      body: "## Why timing matters\n\nEmbarkation mornings concentrate hotel check-outs, airport arrivals and terminal drop-off windows into a few hours.\n\n## What to have ready\n\n- Ship name and sailing date\n- Bag count per guest or group\n- Hotel pickup contact\n\n> Every route, time window and vehicle is confirmed by dispatch before we commit.\n",
    },
    {
      slug: "demo-draft-group-arrivals-mia-fll",
      title: "Planning group arrivals at MIA and FLL (demo draft)",
      category: "Airport arrivals",
      excerpt: "How manifests, arrival windows and handoff points keep a group arrival on schedule. Demo draft.",
      body: "## Start with the manifest\n\nA clear manifest is the single best predictor of a smooth arrival.\n\n## Build in buffer\n\nFlights change. A realistic buffer protects the hotel check-in window.\n",
    },
  ];
  for (const d of drafts) {
    if (await prisma.post.findUnique({ where: { slug: d.slug } })) continue;
    await prisma.post.create({ data: { ...d, tags: ["demo"], status: "DRAFT", authorLabel: "Express Bags Team", language: "en" } });
    posts++;
  }

  let testimonials = 0;
  const quote = "The team handled our group's luggage between three hotels and the port without a single missing bag. (Demo draft, needs written permission.)";
  if (!(await prisma.testimonial.findFirst({ where: { quote } }))) {
    await prisma.testimonial.create({ data: { quote, attribution: "Group program coordinator, destination management company", permissionGranted: false, published: false, rating: 5 } });
    testimonials++;
  }
  return { history, posts, testimonials };
}

// Standalone: npx tsx prisma/seed-demo/cms.ts
if (process.argv[1] && /seed-demo[\\/]cms\.ts$/.test(process.argv[1])) {
  (async () => {
    process.loadEnvFile?.(".env");
    const { prisma } = await import("../../src/server/db");
    console.log("CMS seed:", await seedCms(prisma));
    await prisma.$disconnect();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
