ALTER TABLE "Quotation"
  ADD COLUMN IF NOT EXISTS "familyId" TEXT,
  ADD COLUMN IF NOT EXISTS "revisionNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "previousRevisionId" TEXT,
  ADD COLUMN IF NOT EXISTS "isCurrentRevision" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);

UPDATE "Quotation" SET "familyId" = "id" WHERE "familyId" IS NULL;
ALTER TABLE "Quotation" ALTER COLUMN "familyId" SET NOT NULL;

DROP INDEX IF EXISTS "Quotation_companyId_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_companyId_number_revisionNumber_key" ON "Quotation"("companyId", "number", "revisionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_companyId_familyId_revisionNumber_key" ON "Quotation"("companyId", "familyId", "revisionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_previousRevisionId_key" ON "Quotation"("previousRevisionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_one_current_revision_per_family_key" ON "Quotation"("companyId", "familyId") WHERE "isCurrentRevision" = true AND "isDeleted" = false;
CREATE INDEX IF NOT EXISTS "Quotation_companyId_familyId_revisionNumber_idx" ON "Quotation"("companyId", "familyId", "revisionNumber");

DO $$ BEGIN
  ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_previousRevisionId_fkey"
    FOREIGN KEY ("previousRevisionId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "sourceQuotationFamilyId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceQuotationRevisionNumber" INTEGER NOT NULL DEFAULT 0;
UPDATE "SalesOrder" SET "sourceQuotationFamilyId" = "sourceQuotationId" WHERE "sourceQuotationFamilyId" IS NULL;
ALTER TABLE "SalesOrder" ALTER COLUMN "sourceQuotationFamilyId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "SalesOrder_companyId_sourceQuotationFamilyId_sourceQuotationRevisionNumber_idx"
  ON "SalesOrder"("companyId", "sourceQuotationFamilyId", "sourceQuotationRevisionNumber");
