-- AlterTable
ALTER TABLE "Unit" ADD COLUMN "companyId" TEXT,
ADD COLUMN "nameAr" TEXT,
ADD COLUMN "nameEn" TEXT;

-- DropIndex
DROP INDEX IF EXISTS "Unit_symbol_key";

-- CreateIndex
CREATE INDEX "Unit_companyId_idx" ON "Unit"("companyId");

-- CreateIndex: Tenant-owned Unit composite uniqueness
CREATE UNIQUE INDEX "Unit_companyId_symbol_key" ON "Unit"("companyId", "symbol");

-- CreateIndex: Partial unique index for shared/system Units where companyId IS NULL
CREATE UNIQUE INDEX "Unit_shared_symbol_key" ON "Unit"("symbol") WHERE "companyId" IS NULL;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN "nameAr" TEXT,
ADD COLUMN "nameEn" TEXT,
ADD COLUMN "descriptionAr" TEXT,
ADD COLUMN "descriptionEn" TEXT;
