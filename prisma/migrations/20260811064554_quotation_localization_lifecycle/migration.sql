-- CreateEnum
CREATE TYPE "LocalizationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "localizationCompletedAt" TIMESTAMP(3),
ADD COLUMN     "localizationLastError" TEXT,
ADD COLUMN     "localizationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "localizationSourceLocale" "Locale",
ADD COLUMN     "localizationStatus" "LocalizationStatus";
