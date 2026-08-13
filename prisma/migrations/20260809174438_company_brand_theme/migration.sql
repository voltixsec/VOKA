-- CreateEnum
CREATE TYPE "CompanyBrandTheme" AS ENUM ('NAVY_GOLD', 'ROYAL_BLUE', 'EMERALD', 'BURGUNDY', 'CHARCOAL');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "brandTheme" "CompanyBrandTheme" NOT NULL DEFAULT 'NAVY_GOLD';
