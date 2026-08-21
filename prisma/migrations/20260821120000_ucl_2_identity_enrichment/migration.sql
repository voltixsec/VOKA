-- CreateEnum
CREATE TYPE "UniversalIdentifierType" AS ENUM ('GTIN', 'GTIN_8', 'GTIN_12', 'GTIN_13', 'GTIN_14', 'EAN', 'UPC', 'MPN', 'MODEL_NO', 'EXTERNAL_ID');

-- CreateEnum
CREATE TYPE "UniversalAliasType" AS ENUM ('MONIKER', 'SEARCH', 'SYNONYM', 'MPN', 'HISTORICAL', 'TRANSLITERATION');

-- CreateEnum
CREATE TYPE "UniversalAttributeDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DECIMAL', 'SELECT');

-- AlterTable
ALTER TABLE "UniversalCatalogItem" ADD COLUMN "manufacturerId" TEXT,
ADD COLUMN "brandId" TEXT,
ADD COLUMN "familyId" TEXT,
ADD COLUMN "modelNumber" TEXT,
ADD COLUMN "variantName" TEXT,
ADD COLUMN "parentId" TEXT;

-- CreateTable
CREATE TABLE "UniversalManufacturer" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "countryCode" TEXT,
    "websiteUrl" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalManufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalBrand" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalProductFamily" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalProductFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalItemAlias" (
    "id" TEXT NOT NULL,
    "universalItemId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "locale" "Locale",
    "aliasType" "UniversalAliasType" NOT NULL DEFAULT 'SYNONYM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalItemAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalItemIdentifier" (
    "id" TEXT NOT NULL,
    "universalItemId" TEXT NOT NULL,
    "identifierType" "UniversalIdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalItemIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalAttributeDefinition" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "dataType" "UniversalAttributeDataType" NOT NULL DEFAULT 'STRING',
    "unitOfMeasure" TEXT,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalAttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversalItemAttributeValue" (
    "id" TEXT NOT NULL,
    "universalItemId" TEXT NOT NULL,
    "attributeDefinitionId" TEXT NOT NULL,
    "valueString" TEXT,
    "valueNumber" DECIMAL(18,4),
    "valueBoolean" BOOLEAN,
    "valueJson" JSONB,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversalItemAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UniversalManufacturer_code_key" ON "UniversalManufacturer"("code");
CREATE INDEX "UniversalManufacturer_isActive_idx" ON "UniversalManufacturer"("isActive");
CREATE INDEX "UniversalManufacturer_name_idx" ON "UniversalManufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalBrand_code_key" ON "UniversalBrand"("code");
CREATE INDEX "UniversalBrand_manufacturerId_idx" ON "UniversalBrand"("manufacturerId");
CREATE INDEX "UniversalBrand_isActive_idx" ON "UniversalBrand"("isActive");
CREATE INDEX "UniversalBrand_name_idx" ON "UniversalBrand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalProductFamily_code_key" ON "UniversalProductFamily"("code");
CREATE INDEX "UniversalProductFamily_brandId_idx" ON "UniversalProductFamily"("brandId");
CREATE INDEX "UniversalProductFamily_isActive_idx" ON "UniversalProductFamily"("isActive");
CREATE INDEX "UniversalProductFamily_name_idx" ON "UniversalProductFamily"("name");

-- CreateIndex
CREATE INDEX "UniversalCatalogItem_manufacturerId_idx" ON "UniversalCatalogItem"("manufacturerId");
CREATE INDEX "UniversalCatalogItem_brandId_idx" ON "UniversalCatalogItem"("brandId");
CREATE INDEX "UniversalCatalogItem_familyId_idx" ON "UniversalCatalogItem"("familyId");
CREATE INDEX "UniversalCatalogItem_parentId_idx" ON "UniversalCatalogItem"("parentId");
CREATE INDEX "UniversalCatalogItem_modelNumber_idx" ON "UniversalCatalogItem"("modelNumber");

-- CreateIndex
CREATE INDEX "UniversalItemAlias_universalItemId_idx" ON "UniversalItemAlias"("universalItemId");
CREATE INDEX "UniversalItemAlias_alias_idx" ON "UniversalItemAlias"("alias");
CREATE UNIQUE INDEX "UniversalItemAlias_universalItemId_alias_locale_key" ON "UniversalItemAlias"("universalItemId", "alias", "locale");

-- CreateIndex
CREATE INDEX "UniversalItemIdentifier_universalItemId_idx" ON "UniversalItemIdentifier"("universalItemId");
CREATE INDEX "UniversalItemIdentifier_identifierType_normalizedValue_idx" ON "UniversalItemIdentifier"("identifierType", "normalizedValue");
CREATE INDEX "UniversalItemIdentifier_normalizedValue_idx" ON "UniversalItemIdentifier"("normalizedValue");
CREATE UNIQUE INDEX "UniversalItemIdentifier_universalItemId_identifierType_normali_key" ON "UniversalItemIdentifier"("universalItemId", "identifierType", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalAttributeDefinition_code_key" ON "UniversalAttributeDefinition"("code");
CREATE INDEX "UniversalAttributeDefinition_categoryId_idx" ON "UniversalAttributeDefinition"("categoryId");
CREATE INDEX "UniversalAttributeDefinition_isActive_idx" ON "UniversalAttributeDefinition"("isActive");
CREATE INDEX "UniversalAttributeDefinition_code_idx" ON "UniversalAttributeDefinition"("code");

-- CreateIndex
CREATE INDEX "UniversalItemAttributeValue_universalItemId_idx" ON "UniversalItemAttributeValue"("universalItemId");
CREATE INDEX "UniversalItemAttributeValue_attributeDefinitionId_idx" ON "UniversalItemAttributeValue"("attributeDefinitionId");
CREATE UNIQUE INDEX "UniversalItemAttributeValue_universalItemId_attributeDefiniti_key" ON "UniversalItemAttributeValue"("universalItemId", "attributeDefinitionId");

-- AddForeignKey
ALTER TABLE "UniversalBrand" ADD CONSTRAINT "UniversalBrand_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "UniversalManufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalProductFamily" ADD CONSTRAINT "UniversalProductFamily_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "UniversalBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalCatalogItem" ADD CONSTRAINT "UniversalCatalogItem_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "UniversalManufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalCatalogItem" ADD CONSTRAINT "UniversalCatalogItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "UniversalBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalCatalogItem" ADD CONSTRAINT "UniversalCatalogItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "UniversalProductFamily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalCatalogItem" ADD CONSTRAINT "UniversalCatalogItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "UniversalCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAlias" ADD CONSTRAINT "UniversalItemAlias_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemIdentifier" ADD CONSTRAINT "UniversalItemIdentifier_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalAttributeDefinition" ADD CONSTRAINT "UniversalAttributeDefinition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UniversalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAttributeValue" ADD CONSTRAINT "UniversalItemAttributeValue_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAttributeValue" ADD CONSTRAINT "UniversalItemAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "UniversalAttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
