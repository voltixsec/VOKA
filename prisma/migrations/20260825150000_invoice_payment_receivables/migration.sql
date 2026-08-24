-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceSettlementStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "InvoiceNumberSequence" (
    "companyId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("companyId","yearMonth")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "creationRequestKey" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "settlementStatus" "InvoiceSettlementStatus" NOT NULL DEFAULT 'UNPAID',
    "origin" "CommercialDocumentOrigin" NOT NULL DEFAULT 'DIRECT',
    "sourceKind" TEXT,
    "sourceId" TEXT,
    "sourceQuotationFamilyId" TEXT,
    "sourceQuotationRevisionNumber" INTEGER,
    "customerId" TEXT NOT NULL,
    "priceListId" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'KWD',
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "customerNameAr" TEXT,
    "customerNameEn" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerTaxNo" TEXT,
    "billingAddress" TEXT,
    "subtotal" DECIMAL(18,3) NOT NULL,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,3) NOT NULL,
    "paidAmount" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(18,3) NOT NULL,
    "notes" TEXT,
    "termsAndConditions" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "issuedByUserId" TEXT,
    "issuedByName" TEXT,
    "issuedByRole" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidedByName" TEXT,
    "voidedByRole" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
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
    "unitName" TEXT,
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

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "amount" DECIMAL(18,3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedByUserId" TEXT,
    "recordedByName" TEXT NOT NULL,
    "recordedByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_invoiceDate_idx" ON "Invoice"("companyId", "status", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_settlementStatus_dueDate_idx" ON "Invoice"("companyId", "settlementStatus", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_customerId_invoiceDate_idx" ON "Invoice"("companyId", "customerId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_sourceKind_sourceId_idx" ON "Invoice"("companyId", "sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_sourceQuotationFamilyId_sourceQuotationRe_idx" ON "Invoice"("companyId", "sourceQuotationFamilyId", "sourceQuotationRevisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_creationRequestKey_key" ON "Invoice"("companyId", "creationRequestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_sourceKind_sourceId_key" ON "Invoice"("companyId", "sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "Payment_companyId_invoiceId_receivedAt_idx" ON "Payment"("companyId", "invoiceId", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_companyId_receivedAt_idx" ON "Payment"("companyId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_companyId_requestKey_key" ON "Payment"("companyId", "requestKey");

-- CreateIndex
CREATE INDEX "InvoiceEvent_companyId_invoiceId_occurredAt_idx" ON "InvoiceEvent"("companyId", "invoiceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "InvoiceNumberSequence" ADD CONSTRAINT "InvoiceNumberSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
