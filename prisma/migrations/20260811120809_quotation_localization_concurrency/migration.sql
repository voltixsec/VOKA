-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "localizationAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "localizationClaimToken" TEXT,
ADD COLUMN     "localizationLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "localizationSourceSignature" TEXT;

-- CreateIndex
CREATE INDEX "Quotation_companyId_localizationStatus_localizationLeaseUnt_idx" ON "Quotation"("companyId", "localizationStatus", "localizationLeaseUntil");
