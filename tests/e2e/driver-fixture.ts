/**
 * Creates (or removes) the data for the driver e2e test and prints it as JSON.
 *   npx tsx tests/e2e/driver-fixture.ts create
 *   npx tsx tests/e2e/driver-fixture.ts cleanup '<json from create>'
 */
import "../../src/server/lib/env";
import { prisma } from "../../src/server/db";
import { cleanupFixture, createAssignedJob, createDriver, FIXTURE_PASSWORD } from "../../src/server/modules/driver/__tests__/fixtures";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "create") {
    const { user, employee } = await createDriver();
    const { customer, order } = await createAssignedJob(employee.id, { pieces: 3 });
    const pieces = await prisma.orderPiece.findMany({ where: { orderId: order.id }, orderBy: { pieceId: "asc" } });
    console.log(JSON.stringify({ email: user.email, password: FIXTURE_PASSWORD, orderId: order.id, reference: order.reference, pieces: pieces.map((p) => p.pieceId), ids: { userIds: [user.id], employeeIds: [employee.id], customerIds: [customer.id] } }));
  } else if (cmd === "status") {
    const o = await prisma.order.findUniqueOrThrow({ where: { id: arg }, include: { proofs: true } });
    const eventsWithGps = await prisma.orderEvent.count({ where: { orderId: arg, lat: { not: null } } });
    console.log(JSON.stringify({ status: o.status, eventsWithGps, proofs: o.proofs.map((p) => ({ kind: p.kind, recipientName: p.recipientName, signed: !!p.signatureUploadId, photos: p.photoUploadIds.length })) }));
  } else if (cmd === "cleanup") {
    await cleanupFixture(JSON.parse(arg).ids);
  }
  await prisma.$disconnect();
}
void main();
