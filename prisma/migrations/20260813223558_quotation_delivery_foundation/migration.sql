-- CreateEnum
CREATE TYPE "QuotationDeliveryChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "QuotationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "QuotationDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "channel" "QuotationDeliveryChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "QuotationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationDelivery_companyId_quotationId_idx" ON "QuotationDelivery"("companyId", "quotationId");

-- CreateIndex
CREATE INDEX "QuotationDelivery_quotationId_createdAt_idx" ON "QuotationDelivery"("quotationId", "createdAt");

-- CreateIndex
CREATE INDEX "QuotationDelivery_companyId_status_idx" ON "QuotationDelivery"("companyId", "status");

-- AddForeignKey
ALTER TABLE "QuotationDelivery" ADD CONSTRAINT "QuotationDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationDelivery" ADD CONSTRAINT "QuotationDelivery_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
