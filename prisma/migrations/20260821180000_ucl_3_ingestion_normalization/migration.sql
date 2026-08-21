-- CreateEnum
CREATE TYPE "UniversalIngestionStatus" AS ENUM ('RECEIVED', 'NORMALIZED', 'MATCHED', 'PUBLISHED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "UniversalSource"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "trustScore" DECIMAL(3,2);

-- CreateTable
CREATE TABLE "UniversalIngestionRecord" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceExternalId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'ITEM',
    "rawPayload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "UniversalIngestionStatus" NOT NULL DEFAULT 'RECEIVED',
    "normalizedData" JSONB,
    "matchedItemId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalIngestionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UniversalSource_isActive_idx" ON "UniversalSource"("isActive");

-- CreateIndex
CREATE INDEX "UniversalIngestionRecord_sourceId_idx" ON "UniversalIngestionRecord"("sourceId");
CREATE INDEX "UniversalIngestionRecord_status_createdAt_idx" ON "UniversalIngestionRecord"("status", "createdAt");
CREATE INDEX "UniversalIngestionRecord_payloadHash_idx" ON "UniversalIngestionRecord"("payloadHash");
CREATE INDEX "UniversalIngestionRecord_matchedItemId_idx" ON "UniversalIngestionRecord"("matchedItemId");
CREATE UNIQUE INDEX "UniversalIngestionRecord_sourceId_sourceExternalId_key" ON "UniversalIngestionRecord"("sourceId", "sourceExternalId");

-- AddForeignKey
ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_matchedItemId_fkey" FOREIGN KEY ("matchedItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity Checks
ALTER TABLE "UniversalSource" ADD CONSTRAINT "UniversalSource_trust_score_check" CHECK (
    "trustScore" IS NULL OR ("trustScore" >= 0.00 AND "trustScore" <= 1.00)
);

ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_identity_check" CHECK (
    BTRIM("sourceExternalId") <> '' AND BTRIM("payloadHash") <> ''
);
