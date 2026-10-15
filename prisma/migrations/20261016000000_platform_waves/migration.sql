-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpRecoveryCodes" TEXT[];

-- CreateTable
CREATE TABLE "AiQuoteDraft" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "conversationId" TEXT,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiQuoteDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingTestRun" (
    "id" TEXT NOT NULL,
    "runById" TEXT,
    "runByEmail" TEXT,
    "scenarioCount" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingApproval" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "flags" JSONB NOT NULL,
    "testRunId" TEXT,
    "approvedById" TEXT,
    "approvedByEmail" TEXT,
    "statement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryEntryDisplay" (
    "entryId" TEXT NOT NULL,
    "genericTitle" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoryEntryDisplay_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "DriverActionLog" (
    "key" TEXT NOT NULL,
    "employeeId" TEXT,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "orderId" TEXT,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverActionLog_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MoneySequence" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MoneySequence_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "QuotationDetails" (
    "quotationId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "fulfillment" TEXT NOT NULL DEFAULT 'local',
    "pickup" JSONB NOT NULL,
    "delivery" JSONB NOT NULL,
    "extraStops" JSONB,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "timeWindow" TEXT,
    "market" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "companyId" TEXT,
    "poNumber" TEXT,
    "costCenter" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationDetails_pkey" PRIMARY KEY ("quotationId")
);

-- CreateTable
CREATE TABLE "QuotationRevision" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSyncLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "remoteId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "data" JSONB NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactOptOut" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAccess" (
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pendingPasswordHash" TEXT,
    "invitedByCustomerId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccess_pkey" PRIMARY KEY ("customerId")
);

-- CreateTable
CREATE TABLE "StorageBookingMeta" (
    "bookingId" TEXT NOT NULL,
    "combination" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "pricing" JSONB,
    "pieceTags" TEXT[],
    "bays" JSONB,
    "intakeCount" INTEGER,
    "intakeNotes" TEXT,
    "intakeUploadIds" TEXT[],
    "checkedInBy" TEXT,
    "releasedTo" TEXT,
    "releaseCount" INTEGER,
    "releaseUploadIds" TEXT[],
    "releasedBy" TEXT,
    "extensions" JSONB,
    "overstayCents" INTEGER NOT NULL DEFAULT 0,
    "cancelReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageBookingMeta_pkey" PRIMARY KEY ("bookingId")
);

-- CreateTable
CREATE TABLE "ClaimEvidence" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "customerVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiQuoteDraft_token_key" ON "AiQuoteDraft"("token");

-- CreateIndex
CREATE INDEX "AiQuoteDraft_expiresAt_idx" ON "AiQuoteDraft"("expiresAt");

-- CreateIndex
CREATE INDEX "PricingTestRun_createdAt_idx" ON "PricingTestRun"("createdAt");

-- CreateIndex
CREATE INDEX "DriverActionLog_orderId_idx" ON "DriverActionLog"("orderId");

-- CreateIndex
CREATE INDEX "QuotationRevision_quotationId_idx" ON "QuotationRevision"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationRevision_quotationId_version_key" ON "QuotationRevision"("quotationId", "version");

-- CreateIndex
CREATE INDEX "AccountingSyncLog_entity_entityId_idx" ON "AccountingSyncLog"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationJob_dedupeKey_key" ON "NotificationJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationJob_status_scheduledFor_idx" ON "NotificationJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationJob_orderId_idx" ON "NotificationJob"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactOptOut_channel_address_key" ON "ContactOptOut"("channel", "address");

-- CreateIndex
CREATE INDEX "ClaimEvidence_claimId_idx" ON "ClaimEvidence"("claimId");

-- CreateIndex
CREATE INDEX "ClaimEvent_claimId_createdAt_idx" ON "ClaimEvent"("claimId", "createdAt");

-- ---------------------------------------------------------------------------
-- Email normalization trigger (prisma/sql/email-normalization.sql)
-- ---------------------------------------------------------------------------
-- Normalize staff and customer emails to lowercase on every insert/update, so sign-in
-- (which lowercases input) always matches no matter which code path created the row.
CREATE OR REPLACE FUNCTION eb_lowercase_email() RETURNS trigger AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(trim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS eb_user_email_lower ON "User";
CREATE TRIGGER eb_user_email_lower BEFORE INSERT OR UPDATE OF email ON "User"
  FOR EACH ROW EXECUTE FUNCTION eb_lowercase_email();

DROP TRIGGER IF EXISTS eb_customer_email_lower ON "Customer";
CREATE TRIGGER eb_customer_email_lower BEFORE INSERT OR UPDATE OF email ON "Customer"
  FOR EACH ROW EXECUTE FUNCTION eb_lowercase_email();

-- Existing rows (no-op when already lowercase)
UPDATE "User" SET email = lower(trim(email)) WHERE email <> lower(trim(email));
UPDATE "Customer" SET email = lower(trim(email)) WHERE email <> lower(trim(email));
