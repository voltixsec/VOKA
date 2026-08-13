-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "attentionNameAr" TEXT,
ADD COLUMN     "attentionNameEn" TEXT,
ADD COLUMN     "customerNameAr" TEXT,
ADD COLUMN     "customerNameEn" TEXT,
ADD COLUMN     "notesAr" TEXT,
ADD COLUMN     "notesEn" TEXT,
ADD COLUMN     "projectNameAr" TEXT,
ADD COLUMN     "projectNameEn" TEXT,
ADD COLUMN     "termsAndConditionsAr" TEXT,
ADD COLUMN     "termsAndConditionsEn" TEXT;

-- AlterTable
ALTER TABLE "QuotationLine" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "itemNameAr" TEXT,
ADD COLUMN     "itemNameEn" TEXT;
