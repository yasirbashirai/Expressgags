/**
 * Seeds reference data: 8 priority markets, zones (incl. 5 Florida Keys sub-zones), airports &
 * cruise ports as recognized locations, vehicle classes, default settings and the owner account.
 * Safe to re-run (upserts). Run: npm run db:seed
 */
import { randomBytes } from "node:crypto";
import "../src/server/lib/env";
import { airports, markets, ports } from "../src/content/site";
import { hashPassword } from "../src/server/auth";
import { prisma } from "../src/server/db";
import { DEFAULT_SETTINGS } from "../src/server/settings";

/** Zones per market. Codes are what pricing rules reference (e.g. zone pairs). */
const ZONES: Record<string, { code: string; name: string; children?: { code: string; name: string }[] }[]> = {
  miami: [
    { code: "MIA-MAINLAND", name: "Miami mainland (Downtown, Brickell, Doral, Coral Gables)" },
    { code: "MIA-BEACH", name: "Miami Beach" },
    { code: "MIA-NORTH", name: "North Miami-Dade (Aventura)" },
    { code: "MIA-SOUTH", name: "South Miami-Dade" },
  ],
  "fort-lauderdale-broward": [
    { code: "BRW-EAST", name: "Fort Lauderdale & east Broward" },
    { code: "BRW-SOUTH", name: "South Broward (Hollywood, Miramar, Pembroke Pines)" },
    { code: "BRW-WEST", name: "West Broward (Sunrise, Plantation, Davie)" },
    { code: "BRW-NORTH", name: "North Broward (Pompano, Coral Springs, Deerfield)" },
  ],
  "florida-keys-key-west": [
    {
      code: "KEYS",
      name: "Florida Keys",
      children: [
        { code: "KEYS-KEY-LARGO", name: "Key Largo" },
        { code: "KEYS-ISLAMORADA", name: "Islamorada" },
        { code: "KEYS-MARATHON", name: "Marathon" },
        { code: "KEYS-LOWER", name: "Lower Keys" },
        { code: "KEYS-KEY-WEST", name: "Key West" },
      ],
    },
  ],
  "west-palm-beach": [
    { code: "PB-CENTRAL", name: "West Palm Beach & Palm Beach" },
    { code: "PB-SOUTH", name: "South Palm Beach County (Boca Raton, Delray)" },
    { code: "PB-NORTH", name: "North Palm Beach County (Jupiter, Gardens)" },
  ],
  orlando: [{ code: "ORL-METRO", name: "Orlando metro" }],
  tampa: [{ code: "TPA-METRO", name: "Tampa Bay metro" }],
  "fort-myers": [{ code: "FMY-METRO", name: "Fort Myers & Lee County" }],
  "cape-canaveral-port-canaveral": [{ code: "CNV-PORT", name: "Cape Canaveral & Port Canaveral" }],
};

const VEHICLES = [
  { code: "cargo-van", name: "Cargo van", sortOrder: 1 },
  { code: "box-15", name: "15-foot box truck", sortOrder: 2 },
  { code: "box-20", name: "20-foot box truck", sortOrder: 3 },
  { code: "box-26", name: "26-foot box truck", sortOrder: 4 },
];

async function main() {
  // Markets + zones
  for (const [i, m] of markets.entries()) {
    const market = await prisma.market.upsert({
      where: { slug: m.slug },
      update: { name: m.name, tier: m.tier, isHq: !!m.hq, sortOrder: i },
      create: { slug: m.slug, name: m.name, tier: m.tier, isHq: !!m.hq, sortOrder: i },
    });
    for (const [j, z] of (ZONES[m.slug] ?? []).entries()) {
      const parent = await prisma.zone.upsert({
        where: { code: z.code },
        update: { name: z.name, marketId: market.id, sortOrder: j },
        create: { code: z.code, name: z.name, marketId: market.id, sortOrder: j },
      });
      for (const [k, c] of (z.children ?? []).entries()) {
        await prisma.zone.upsert({
          where: { code: c.code },
          update: { name: c.name, marketId: market.id, parentId: parent.id, sortOrder: k },
          create: { code: c.code, name: c.name, marketId: market.id, parentId: parent.id, sortOrder: k },
        });
      }
    }
  }

  // Airports & ports as recognized operational locations
  const marketId = async (slug: string) => (await prisma.market.findUniqueOrThrow({ where: { slug } })).id;
  for (const a of airports) {
    await prisma.recognizedLocation.upsert({
      where: { code: a.code },
      update: { name: a.officialName ?? a.name, marketId: await marketId(a.market) },
      create: { code: a.code, name: a.officialName ?? a.name, type: "airport", marketId: await marketId(a.market) },
    });
  }
  for (const p of ports) {
    await prisma.recognizedLocation.upsert({
      where: { code: p.slug },
      update: { name: p.name, marketId: await marketId(p.market) },
      create: { code: p.slug, name: p.name, type: "cruise-port", marketId: await marketId(p.market) },
    });
  }

  // Vehicle classes (capacity thresholds left empty: Express Bags sets them)
  for (const v of VEHICLES) {
    await prisma.vehicleClass.upsert({ where: { code: v.code }, update: { name: v.name, sortOrder: v.sortOrder }, create: v });
  }

  // Default settings (never overwrite values the owner already changed)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as object } });
  }

  // Owner account
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  if (!email) {
    console.warn("ADMIN_EMAIL not set: skipping owner account.");
  } else if (!(await prisma.user.findUnique({ where: { email } }))) {
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
    await prisma.user.create({ data: { email, name: "Owner", role: "OWNER", passwordHash: await hashPassword(password) } });
    console.info(`Owner account created: ${email}${generated ? ` · temporary password: ${password} (change it after first sign-in)` : ""}`);
  } else {
    console.info(`Owner account already exists: ${email}`);
  }
  console.info("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
