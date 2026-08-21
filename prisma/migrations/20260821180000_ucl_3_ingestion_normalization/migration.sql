-- CreateEnum
CREATE TYPE "UniversalIngestionStatus" AS ENUM ('RECEIVED', 'NORMALIZED', 'MATCHED', 'PROCESSING', 'PUBLISHED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED');

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
    "processingStartedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalIngestionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UniversalSource_isActive_idx" ON "UniversalSource"("isActive");

-- CreateIndex
CREATE INDEX "UniversalIngestionRecord_sourceId_idx" ON "UniversalIngestionRecord"("sourceId");
CREATE INDEX "UniversalIngestionRecord_status_processingStartedAt_createdAt_idx" ON "UniversalIngestionRecord"("status", "processingStartedAt", "createdAt");
CREATE INDEX "UniversalIngestionRecord_payloadHash_idx" ON "UniversalIngestionRecord"("payloadHash");
CREATE INDEX "UniversalIngestionRecord_matchedItemId_idx" ON "UniversalIngestionRecord"("matchedItemId");
CREATE UNIQUE INDEX "UniversalIngestionRecord_sourceId_sourceExternalId_key" ON "UniversalIngestionRecord"("sourceId", "sourceExternalId");

-- AddForeignKey
ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversalSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_matchedItemId_fkey" FOREIGN KEY ("matchedItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity Checks
ALTER TABLE "UniversalSource" ADD CONSTRAINT "UniversalSource_trust_score_check" CHECK (
    "trustScore" IS NULL OR ("trustScore" >= 0.00 AND "trustScore" <= 1.00)
);

ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_identity_check" CHECK (
    BTRIM("sourceExternalId") <> ''
    AND "sourceExternalId" = BTRIM("sourceExternalId")
    AND "entityType" = 'ITEM'
    AND "payloadHash" ~ '^[0-9a-f]{64}$'
    AND "retryCount" >= 0
);

ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_status_data_check" CHECK (
    ("status" NOT IN ('NORMALIZED', 'MATCHED', 'PROCESSING', 'NEEDS_REVIEW', 'PUBLISHED') OR "normalizedData" IS NOT NULL)
    AND ("status" NOT IN ('MATCHED', 'PUBLISHED') OR "matchedItemId" IS NOT NULL)
    AND ("status" <> 'PROCESSING' OR "processingStartedAt" IS NOT NULL)
    AND ("status" <> 'PUBLISHED' OR "processedAt" IS NOT NULL)
    AND ("status" NOT IN ('REJECTED', 'FAILED') OR BTRIM(COALESCE("errorMessage", '')) <> '')
);

CREATE FUNCTION "guardUniversalIngestionStatusTransition"() RETURNS trigger AS $$
BEGIN
    IF NEW."status" = OLD."status" THEN
        RETURN NEW;
    END IF;

    IF (OLD."status" = 'RECEIVED' AND NEW."status" IN ('NORMALIZED', 'MATCHED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED'))
       OR (OLD."status" IN ('NORMALIZED', 'MATCHED') AND NEW."status" IN ('PROCESSING', 'NEEDS_REVIEW', 'REJECTED', 'FAILED'))
       OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('PUBLISHED', 'REJECTED', 'FAILED'))
       OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'NEEDS_REVIEW')
       OR (OLD."status" = 'NEEDS_REVIEW' AND NEW."status" IN ('NORMALIZED', 'MATCHED', 'REJECTED'))
       OR (OLD."status" IN ('REJECTED', 'FAILED') AND NEW."status" IN ('NORMALIZED', 'MATCHED', 'NEEDS_REVIEW', 'REJECTED', 'FAILED')) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invalid UniversalIngestionRecord status transition: % -> %', OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UniversalIngestionRecord_status_transition_guard"
BEFORE UPDATE OF "status" ON "UniversalIngestionRecord"
FOR EACH ROW EXECUTE FUNCTION "guardUniversalIngestionStatusTransition"();
