-- CreateEnum
CREATE TYPE "UniversalIdentifierType" AS ENUM ('GTIN', 'GTIN_8', 'GTIN_12', 'GTIN_13', 'GTIN_14', 'EAN', 'UPC', 'MPN', 'MODEL_NO', 'EXTERNAL_ID');

-- CreateEnum
CREATE TYPE "UniversalAliasType" AS ENUM ('MONIKER', 'SEARCH', 'SYNONYM', 'MPN', 'HISTORICAL', 'TRANSLITERATION');

-- CreateEnum
CREATE TYPE "UniversalAttributeDataType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DECIMAL', 'SELECT', 'JSON');

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
    "manufacturerId" TEXT,
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
CREATE UNIQUE INDEX "UniversalManufacturer_code_key" ON "UniversalManufacturer"(LOWER("code")) WHERE "code" IS NOT NULL;
CREATE INDEX "UniversalManufacturer_code_idx" ON "UniversalManufacturer"("code");
CREATE INDEX "UniversalManufacturer_isActive_idx" ON "UniversalManufacturer"("isActive");
CREATE INDEX "UniversalManufacturer_name_idx" ON "UniversalManufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalBrand_code_key" ON "UniversalBrand"(LOWER("code")) WHERE "code" IS NOT NULL;
CREATE INDEX "UniversalBrand_code_idx" ON "UniversalBrand"("code");
CREATE INDEX "UniversalBrand_manufacturerId_idx" ON "UniversalBrand"("manufacturerId");
CREATE INDEX "UniversalBrand_isActive_idx" ON "UniversalBrand"("isActive");
CREATE INDEX "UniversalBrand_name_idx" ON "UniversalBrand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UniversalProductFamily_code_key" ON "UniversalProductFamily"(LOWER("code")) WHERE "code" IS NOT NULL;
CREATE INDEX "UniversalProductFamily_code_idx" ON "UniversalProductFamily"("code");
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
CREATE INDEX "UniversalItemAlias_universalItemId_alias_locale_idx" ON "UniversalItemAlias"("universalItemId", "alias", "locale");
CREATE UNIQUE INDEX "UniversalItemAlias_identity_without_locale_key" ON "UniversalItemAlias"(
    "universalItemId", LOWER("alias")
) WHERE "locale" IS NULL;
CREATE UNIQUE INDEX "UniversalItemAlias_identity_with_locale_key" ON "UniversalItemAlias"(
    "universalItemId", LOWER("alias"), "locale"
) WHERE "locale" IS NOT NULL;

-- CreateIndex
CREATE INDEX "UniversalItemIdentifier_universalItemId_idx" ON "UniversalItemIdentifier"("universalItemId");
CREATE INDEX "UniversalItemIdentifier_manufacturerId_idx" ON "UniversalItemIdentifier"("manufacturerId");
CREATE INDEX "UniversalItemIdentifier_identifierType_normalizedValue_idx" ON "UniversalItemIdentifier"("identifierType", "normalizedValue");
CREATE INDEX "UniversalItemIdentifier_normalizedValue_idx" ON "UniversalItemIdentifier"("normalizedValue");
CREATE UNIQUE INDEX "UniversalItemIdentifier_universalItemId_identifierType_normali_key" ON "UniversalItemIdentifier"("universalItemId", "identifierType", "normalizedValue");
CREATE UNIQUE INDEX "UniversalItemIdentifier_global_identity_key" ON "UniversalItemIdentifier"("identifierType", "normalizedValue")
WHERE "identifierType" IN ('GTIN', 'GTIN_8', 'GTIN_12', 'GTIN_13', 'GTIN_14', 'EAN', 'UPC');
CREATE UNIQUE INDEX "UniversalItemIdentifier_manufacturer_identity_key" ON "UniversalItemIdentifier"("identifierType", "manufacturerId", "normalizedValue")
WHERE "identifierType" IN ('MPN', 'MODEL_NO');
CREATE UNIQUE INDEX "UniversalItemIdentifier_external_identity_key" ON "UniversalItemIdentifier"("source", "normalizedValue")
WHERE "identifierType" = 'EXTERNAL_ID';

-- CreateIndex
CREATE UNIQUE INDEX "UniversalAttributeDefinition_code_key" ON "UniversalAttributeDefinition"(LOWER("code"));
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

ALTER TABLE "UniversalCatalogItem" ADD CONSTRAINT "UniversalCatalogItem_parent_not_self_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- AddForeignKey
ALTER TABLE "UniversalItemAlias" ADD CONSTRAINT "UniversalItemAlias_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemIdentifier" ADD CONSTRAINT "UniversalItemIdentifier_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UniversalItemIdentifier" ADD CONSTRAINT "UniversalItemIdentifier_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "UniversalManufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UniversalItemIdentifier" ADD CONSTRAINT "UniversalItemIdentifier_scope_check" CHECK (
    ("identifierType" IN ('MPN', 'MODEL_NO') AND "manufacturerId" IS NOT NULL AND "source" IS NULL)
    OR ("identifierType" = 'EXTERNAL_ID' AND "source" IS NOT NULL AND BTRIM("source") <> '' AND "manufacturerId" IS NULL)
    OR ("identifierType" IN ('GTIN', 'GTIN_8', 'GTIN_12', 'GTIN_13', 'GTIN_14', 'EAN', 'UPC') AND "manufacturerId" IS NULL AND "source" IS NULL)
);

ALTER TABLE "UniversalManufacturer" ADD CONSTRAINT "UniversalManufacturer_identity_check" CHECK (
    BTRIM("name") <> '' AND ("code" IS NULL OR BTRIM("code") <> '')
);
ALTER TABLE "UniversalBrand" ADD CONSTRAINT "UniversalBrand_identity_check" CHECK (
    BTRIM("name") <> '' AND ("code" IS NULL OR BTRIM("code") <> '')
);
ALTER TABLE "UniversalProductFamily" ADD CONSTRAINT "UniversalProductFamily_identity_check" CHECK (
    BTRIM("name") <> '' AND ("code" IS NULL OR BTRIM("code") <> '')
);
ALTER TABLE "UniversalItemAlias" ADD CONSTRAINT "UniversalItemAlias_value_check" CHECK (BTRIM("alias") <> '');
ALTER TABLE "UniversalAttributeDefinition" ADD CONSTRAINT "UniversalAttributeDefinition_identity_check" CHECK (
    BTRIM("code") <> '' AND BTRIM("name") <> ''
);
ALTER TABLE "UniversalItemIdentifier" ADD CONSTRAINT "UniversalItemIdentifier_value_check" CHECK (
    BTRIM("value") <> '' AND BTRIM("normalizedValue") <> ''
    AND (
        ("identifierType" = 'GTIN' AND "normalizedValue" ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$')
        OR ("identifierType" = 'GTIN_8' AND "normalizedValue" ~ '^[0-9]{8}$')
        OR ("identifierType" = 'GTIN_12' AND "normalizedValue" ~ '^[0-9]{12}$')
        OR ("identifierType" = 'GTIN_13' AND "normalizedValue" ~ '^[0-9]{13}$')
        OR ("identifierType" = 'GTIN_14' AND "normalizedValue" ~ '^[0-9]{14}$')
        OR ("identifierType" = 'EAN' AND "normalizedValue" ~ '^([0-9]{8}|[0-9]{13})$')
        OR ("identifierType" = 'UPC' AND "normalizedValue" ~ '^[0-9]{12}$')
        OR ("identifierType" IN ('MPN', 'MODEL_NO') AND "normalizedValue" = UPPER(BTRIM(REGEXP_REPLACE("value", '[[:space:]]+', ' ', 'g'))))
        OR ("identifierType" = 'EXTERNAL_ID' AND "normalizedValue" = BTRIM("value"))
    )
);

-- AddForeignKey
ALTER TABLE "UniversalAttributeDefinition" ADD CONSTRAINT "UniversalAttributeDefinition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UniversalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAttributeValue" ADD CONSTRAINT "UniversalItemAttributeValue_universalItemId_fkey" FOREIGN KEY ("universalItemId") REFERENCES "UniversalCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversalItemAttributeValue" ADD CONSTRAINT "UniversalItemAttributeValue_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "UniversalAttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UniversalItemAttributeValue" ADD CONSTRAINT "UniversalItemAttributeValue_exactly_one_value_check" CHECK (
    NUM_NONNULLS("valueString", "valueNumber", "valueBoolean", "valueJson") = 1
);

CREATE FUNCTION "validateUniversalItemAttributeValue"() RETURNS trigger AS $$
DECLARE
    definition_type "UniversalAttributeDataType";
BEGIN
    SELECT "dataType" INTO definition_type
    FROM "UniversalAttributeDefinition"
    WHERE "id" = NEW."attributeDefinitionId";

    IF definition_type IN ('STRING', 'SELECT') AND NEW."valueString" IS NULL THEN
        RAISE EXCEPTION 'Universal attribute value must use valueString for %', definition_type;
    ELSIF definition_type IN ('NUMBER', 'DECIMAL') AND NEW."valueNumber" IS NULL THEN
        RAISE EXCEPTION 'Universal attribute value must use valueNumber for %', definition_type;
    ELSIF definition_type = 'BOOLEAN' AND NEW."valueBoolean" IS NULL THEN
        RAISE EXCEPTION 'Universal attribute value must use valueBoolean for BOOLEAN';
    ELSIF definition_type = 'JSON' AND NEW."valueJson" IS NULL THEN
        RAISE EXCEPTION 'Universal attribute value must use valueJson for JSON';
    END IF;

    IF NEW."unit" IS NOT NULL AND definition_type NOT IN ('NUMBER', 'DECIMAL') THEN
        RAISE EXCEPTION 'Universal attribute unit is only valid for numeric values';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UniversalItemAttributeValue_type_guard"
BEFORE INSERT OR UPDATE ON "UniversalItemAttributeValue"
FOR EACH ROW EXECUTE FUNCTION "validateUniversalItemAttributeValue"();

CREATE FUNCTION "guardUniversalAttributeDefinitionType"() RETURNS trigger AS $$
BEGIN
    IF NEW."dataType" <> OLD."dataType" AND EXISTS (
        SELECT 1
        FROM "UniversalItemAttributeValue" value
        WHERE value."attributeDefinitionId" = NEW."id"
          AND NOT (
              (NEW."dataType" IN ('STRING', 'SELECT') AND value."valueString" IS NOT NULL)
              OR (NEW."dataType" IN ('NUMBER', 'DECIMAL') AND value."valueNumber" IS NOT NULL)
              OR (NEW."dataType" = 'BOOLEAN' AND value."valueBoolean" IS NOT NULL)
              OR (NEW."dataType" = 'JSON' AND value."valueJson" IS NOT NULL)
          )
    ) THEN
        RAISE EXCEPTION 'Attribute definition type conflicts with existing values';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UniversalAttributeDefinition_type_guard"
BEFORE UPDATE OF "dataType" ON "UniversalAttributeDefinition"
FOR EACH ROW EXECUTE FUNCTION "guardUniversalAttributeDefinitionType"();
