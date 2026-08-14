-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT');

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceQuotationId" TEXT NOT NULL,
    "sourceQuotationNumber" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "priceListId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "totalAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "notesAr" TEXT,
    "notesEn" TEXT,
    "termsAndConditions" TEXT,
    "termsAndConditionsAr" TEXT,
    "termsAndConditionsEn" TEXT,
    "sourceApprovedAt" TIMESTAMP(3) NOT NULL,
    "sourceApprovedByName" TEXT NOT NULL,
    "sourceApprovedByRole" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "sourceQuotationLineId" TEXT NOT NULL,
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

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_sourceQuotationId_key" ON "SalesOrder"("sourceQuotationId");

-- CreateIndex
CREATE INDEX "SalesOrder_companyId_idx" ON "SalesOrder"("companyId");

-- CreateIndex
CREATE INDEX "SalesOrder_companyId_status_idx" ON "SalesOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "SalesOrder_companyId_customerId_idx" ON "SalesOrder"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "SalesOrder_companyId_orderDate_idx" ON "SalesOrder"("companyId", "orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");

-- CreateIndex
CREATE INDEX "SalesOrder_priceListId_idx" ON "SalesOrder"("priceListId");

-- CreateIndex
CREATE INDEX "SalesOrder_createdByUserId_idx" ON "SalesOrder"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_companyId_number_key" ON "SalesOrder"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderLine_sourceQuotationLineId_key" ON "SalesOrderLine"("sourceQuotationLineId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_salesOrderId_idx" ON "SalesOrderLine"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_catalogItemId_idx" ON "SalesOrderLine"("catalogItemId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_taxRateId_idx" ON "SalesOrderLine"("taxRateId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderLine_salesOrderId_position_key" ON "SalesOrderLine"("salesOrderId", "position");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_sourceQuotationId_fkey" FOREIGN KEY ("sourceQuotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_sourceQuotationLineId_fkey" FOREIGN KEY ("sourceQuotationLineId") REFERENCES "QuotationLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
