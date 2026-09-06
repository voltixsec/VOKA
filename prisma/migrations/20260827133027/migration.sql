-- DropIndex
DROP INDEX "SalesOrder_companyId_sourceQuotationFamilyId_sourceQuotationRev";

-- AlterTable
ALTER TABLE "SalesOrder" ALTER COLUMN "sourceQuotationRevisionNumber" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "LocalizedContent_companyId_resourceType_resourceId_fieldKey_loc" RENAME TO "LocalizedContent_companyId_resourceType_resourceId_fieldKey_key";

-- RenameIndex
ALTER INDEX "UniversalIngestionRecord_status_processingStartedAt_createdAt_i" RENAME TO "UniversalIngestionRecord_status_processingStartedAt_created_idx";

-- RenameIndex
ALTER INDEX "UniversalItemAttributeValue_universalItemId_attributeDefiniti_k" RENAME TO "UniversalItemAttributeValue_universalItemId_attributeDefini_key";

-- RenameIndex
ALTER INDEX "UniversalItemIdentifier_universalItemId_identifierType_normali_" RENAME TO "UniversalItemIdentifier_universalItemId_identifierType_norm_key";
