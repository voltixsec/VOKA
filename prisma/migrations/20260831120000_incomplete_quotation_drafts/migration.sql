-- Draft quotations may preserve genuine pending commercial data.
ALTER TABLE "Quotation" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "Quotation" ALTER COLUMN "customerName" DROP NOT NULL;
ALTER TABLE "QuotationLine" ALTER COLUMN "quantity" DROP NOT NULL;
ALTER TABLE "QuotationLine" ALTER COLUMN "unitPrice" DROP NOT NULL;
ALTER TABLE "QuotationLine" ADD COLUMN "quantityStatus" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "QuotationLine" ADD COLUMN "pricingStatus" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "QuotationLine" ADD COLUMN "productSelectionStatus" TEXT NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "QuotationLine" ADD COLUMN "brandName" TEXT;
ALTER TABLE "QuotationLine" ADD COLUMN "modelNumber" TEXT;
ALTER TABLE "QuotationLine" ADD COLUMN "provenance" TEXT;
ALTER TABLE "QuotationLine" ADD COLUMN "engineeringComponentKeys" JSONB;
