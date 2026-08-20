-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT');

-- CreateEnum
CREATE TYPE "CommercialDocumentOrigin" AS ENUM ('DIRECT', 'QUOTATION', 'SALES_ORDER', 'CONTRACT');

-- CreateEnum
CREATE TYPE "MilestoneAmountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "origin" "CommercialDocumentOrigin" NOT NULL DEFAULT 'DIRECT',
    "sourceKind" TEXT,
    "sourceId" TEXT,
    "customerId" TEXT NOT NULL,
    "priceListId" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'KWD',
    "contractDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerNameAr" TEXT,
    "customerNameEn" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerTaxNo" TEXT,
    "billingAddress" TEXT,
    "subjectAr" TEXT,
    "subjectEn" TEXT,
    "briefAr" TEXT,
    "briefEn" TEXT,
    "projectName" TEXT,
    "projectNameAr" TEXT,
    "projectNameEn" TEXT,
    "attentionName" TEXT,
    "attentionNameAr" TEXT,
    "attentionNameEn" TEXT,
    "scopeType" "QuotationScopeType",
    "subtotal" DECIMAL(18,3) NOT NULL,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "notes" TEXT,
    "notesAr" TEXT,
    "notesEn" TEXT,
    "termsAndConditions" TEXT,
    "termsAndConditionsAr" TEXT,
    "termsAndConditionsEn" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "documentBrandSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLine" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sourceLineId" TEXT,
    "catalogItemId" TEXT,
    "taxRateId" TEXT,
    "position" INTEGER NOT NULL,
    "type" "CatalogItemType" NOT NULL,
    "itemCode" TEXT,
    "itemName" TEXT NOT NULL,
    "itemNameAr" TEXT,
    "itemNameEn" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "unitName" TEXT,
    "unitNameAr" TEXT,
    "unitNameEn" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,3) NOT NULL,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "taxPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,3) NOT NULL,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMilestone" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "amountType" "MilestoneAmountType" NOT NULL,
    "percentage" DECIMAL(5,2),
    "fixedAmount" DECIMAL(18,3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_companyId_number_key" ON "Contract"("companyId", "number");

-- CreateIndex
CREATE INDEX "Contract_companyId_idx" ON "Contract"("companyId");

-- CreateIndex
CREATE INDEX "Contract_companyId_status_idx" ON "Contract"("companyId", "status");

-- CreateIndex
CREATE INDEX "Contract_companyId_customerId_idx" ON "Contract"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "Contract_companyId_contractDate_idx" ON "Contract"("companyId", "contractDate");

-- CreateIndex
CREATE INDEX "Contract_customerId_idx" ON "Contract"("customerId");

-- CreateIndex
CREATE INDEX "Contract_priceListId_idx" ON "Contract"("priceListId");

-- CreateIndex
CREATE INDEX "Contract_createdByUserId_idx" ON "Contract"("createdByUserId");

-- CreateIndex
CREATE INDEX "Contract_companyId_origin_sourceId_idx" ON "Contract"("companyId", "origin", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractLine_contractId_position_key" ON "ContractLine"("contractId", "position");

-- CreateIndex
CREATE INDEX "ContractLine_contractId_idx" ON "ContractLine"("contractId");

-- CreateIndex
CREATE INDEX "ContractLine_catalogItemId_idx" ON "ContractLine"("catalogItemId");

-- CreateIndex
CREATE INDEX "ContractLine_taxRateId_idx" ON "ContractLine"("taxRateId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractMilestone_contractId_position_key" ON "ContractMilestone"("contractId", "position");

-- CreateIndex
CREATE INDEX "ContractMilestone_contractId_idx" ON "ContractMilestone"("contractId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
