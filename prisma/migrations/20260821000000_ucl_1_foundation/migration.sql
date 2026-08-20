-- CreateEnum
CREATE TYPE "UniversalVerificationStatus" AS ENUM ('UNVERIFIED', 'SOURCE_VERIFIED', 'CROSS_VERIFIED', 'CURATED', 'DEPRECATED');

-- CreateTable
CREATE TABLE "UniversalCategory" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "externalRef" TEXT,
    "url" TEXT,
    "licenseInfo" TEXT,
    "verificationStatus" "UniversalVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalCatalogItem" (
    "id" TEXT NOT NULL,
    "type" "CatalogItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "searchName" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "categoryId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalItemProvenance" (
    "id" TEXT NOT NULL,
    "universalItemId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalRef" TEXT,
    "confidence" DECIMAL(3,2),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalItemProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalItemAdoption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "universalItemId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "adoptedByUserId" TEXT,
    "adoptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniversalItemAdoption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_companyId_id_key" ON "CatalogItem"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalCategory_code_key" ON "UniversalCategory"("code");

-- CreateIndex
CREATE INDEX "UniversalCategory_parentId_idx" ON "UniversalCategory"("parentId");

-- CreateIndex
CREATE INDEX "UniversalCategory_isActive_idx" ON "UniversalCategory"("isActive");

-- CreateIndex
CREATE INDEX "UniversalCategory_name_idx" ON "UniversalCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalSource_type_externalRef_key" ON "UniversalSource"("type", "externalRef");

-- CreateIndex
CREATE INDEX "UniversalSource_type_idx" ON "UniversalSource"("type");

-- CreateIndex
CREATE INDEX "UniversalSource_verificationStatus_idx" ON "UniversalSource"("verificationStatus");

-- CreateIndex
CREATE INDEX "UniversalCatalogItem_type_idx" ON "UniversalCatalogItem"("type");

-- CreateIndex
CREATE INDEX "UniversalCatalogItem_isActive_idx" ON "UniversalCatalogItem"("isActive");

-- CreateIndex
CREATE INDEX "UniversalCatalogItem_categoryId_idx" ON "UniversalCatalogItem"("categoryId");

-- CreateIndex
CREATE INDEX "UniversalCatalogItem_searchName_idx" ON "UniversalCatalogItem"("searchName");

-- CreateIndex
CREATE INDEX "UniversalCatalogItem_name_idx" ON "UniversalCatalogItem"("name");

-- CreateIndex
CREATE INDEX "UniversalCatalogItem_createdAt_idx" ON "UniversalCatalogItem"("createdAt");

-- CreateIndex
CREATE INDEX "UniversalItemProvenance_universalItemId_idx" ON "UniversalItemProvenance"("universalItemId");

-- CreateIndex
CREATE INDEX "UniversalItemProvenance_sourceId_idx" ON "UniversalItemProvenance"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalItemProvenance_universalItemId_sourceId_key" ON "UniversalItemProvenance"("universalItemId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalItemAdoption_catalogItemId_key" ON "UniversalItemAdoption"("catalogItemId");

-- CreateIndex
CREATE INDEX "UniversalItemAdoption_companyId_idx" ON "UniversalItemAdoption"("companyId");

-- CreateIndex
CREATE INDEX "UniversalItemAdoption_universalItemId_idx" ON "UniversalItemAdoption"("universalItemId");

-- CreateIndex
CREATE INDEX "UniversalItemAdoption_adoptedByUserId_idx" ON "UniversalItemAdoption"("adoptedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalItemAdoption_companyId_universalItemId_key" ON "UniversalItemAdoption"("companyId", "universalItemId");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalItemAdoption_companyId_catalogItemId_key" ON "UniversalItemAdoption"("companyId", "catalogItemId");

-- AddForeignKey
ALTER TABLE "UniversalCategory" ADD CONSTRAINT "UniversalCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "UniversalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalCatalogItem" ADD CONSTRAINT "UniversalCatalogItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UniversalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemProvenance" ADD CONSTRAINT "UniversalItemProvenance_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemProvenance" ADD CONSTRAINT "UniversalItemProvenance_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAdoption" ADD CONSTRAINT "UniversalItemAdoption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAdoption" ADD CONSTRAINT "UniversalItemAdoption_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAdoption" ADD CONSTRAINT "UniversalItemAdoption_companyId_catalogItemId_fkey" FOREIGN KEY ("companyId", "catalogItemId") REFERENCES "CatalogItem"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAdoption" ADD CONSTRAINT "UniversalItemAdoption_adoptedByUserId_fkey" FOREIGN KEY ("adoptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Confidence is a normalized score when present.
ALTER TABLE "UniversalItemProvenance" ADD CONSTRAINT "UniversalItemProvenance_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
