-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'STAFF', 'DISPATCHER');

-- CreateEnum
CREATE TYPE "QuoteRoute" AS ENUM ('CUSTOM_QUOTE', 'STANDARD_QUOTE', 'SPECIAL_ROUTE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('NEW', 'REVIEWING', 'QUOTED', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('DISABLED', 'PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'PICKED_UP', 'AT_FACILITY', 'TRANSFERRED_TO_CARRIER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "segment" TEXT,
    "market" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "preferredContact" TEXT,
    "companyId" TEXT,
    "hubspotContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "route" "QuoteRoute" NOT NULL,
    "routeReasons" TEXT[],
    "status" "QuoteStatus" NOT NULL DEFAULT 'NEW',
    "pickupMarket" TEXT NOT NULL,
    "deliveryMarket" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "totalPieces" INTEGER NOT NULL,
    "leadSource" TEXT NOT NULL,
    "billingType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "pricingPreview" JSONB,
    "customerId" TEXT NOT NULL,
    "companyId" TEXT,
    "hubspotSyncStatus" "SyncStatus" NOT NULL DEFAULT 'DISABLED',
    "hubspotDealId" TEXT,
    "hubspotError" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteNote" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEvent" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "serviceType" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quoteId" TEXT,
    "assignedDriverRef" TEXT,
    "retailCents" INTEGER,
    "costCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPiece" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "barcode" TEXT,
    "conditionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "isHq" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecognizedLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "instructions" TEXT,
    "surchargeCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecognizedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleClass" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxPieces" INTEGER,
    "maxWeightLbs" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VehicleClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PricingRuleSet" (
    "id" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotableProjectPermission" (
    "projectId" TEXT NOT NULL,
    "permissionGranted" BOOLEAN NOT NULL DEFAULT false,
    "evidenceNote" TEXT,
    "grantedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "NotableProjectPermission_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "CareerApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "market" TEXT,
    "experience" TEXT,
    "message" TEXT,
    "resumeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_reference_key" ON "QuoteRequest"("reference");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");

-- CreateIndex
CREATE INDEX "QuoteRequest_serviceType_idx" ON "QuoteRequest"("serviceType");

-- CreateIndex
CREATE INDEX "QuoteRequest_pickupMarket_idx" ON "QuoteRequest"("pickupMarket");

-- CreateIndex
CREATE INDEX "QuoteRequest_createdAt_idx" ON "QuoteRequest"("createdAt");

-- CreateIndex
CREATE INDEX "QuoteNote_quoteId_idx" ON "QuoteNote"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteEvent_quoteId_idx" ON "QuoteEvent"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPiece_pieceId_key" ON "OrderPiece"("pieceId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPiece_barcode_key" ON "OrderPiece"("barcode");

-- CreateIndex
CREATE INDEX "OrderPiece_orderId_idx" ON "OrderPiece"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_slug_key" ON "Market"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_code_key" ON "Zone"("code");

-- CreateIndex
CREATE INDEX "Zone_marketId_idx" ON "Zone"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "RecognizedLocation_code_key" ON "RecognizedLocation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleClass_code_key" ON "VehicleClass"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRuleSet_engine_version_key" ON "PricingRuleSet"("engine", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storedName_key" ON "Upload"("storedName");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPiece" ADD CONSTRAINT "OrderPiece_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecognizedLocation" ADD CONSTRAINT "RecognizedLocation_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
