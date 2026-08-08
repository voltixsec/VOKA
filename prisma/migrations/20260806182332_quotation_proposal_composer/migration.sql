-- CreateEnum
CREATE TYPE "QuotationScopeType" AS ENUM ('SUPPLY_ONLY', 'SUPPLY_AND_INSTALLATION', 'INSTALLATION_ONLY', 'SERVICE', 'MAINTENANCE', 'CONSULTATION', 'CUSTOM');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "attentionName" TEXT,
ADD COLUMN     "briefAr" TEXT,
ADD COLUMN     "briefEn" TEXT,
ADD COLUMN     "projectName" TEXT,
ADD COLUMN     "scopeType" "QuotationScopeType",
ADD COLUMN     "subjectAr" TEXT,
ADD COLUMN     "subjectEn" TEXT;
