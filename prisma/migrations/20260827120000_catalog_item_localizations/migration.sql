CREATE TYPE "CatalogLocalizationSource" AS ENUM ('HUMAN', 'GOVERNED', 'LEGACY');

CREATE TABLE "CatalogItemLocalization" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "CatalogLocalizationSource" NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogItemLocalization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogItemLocalization_catalogItemId_locale_key"
ON "CatalogItemLocalization"("catalogItemId", "locale");
CREATE INDEX "CatalogItemLocalization_companyId_locale_name_idx"
ON "CatalogItemLocalization"("companyId", "locale", "name");
CREATE INDEX "CatalogItemLocalization_companyId_catalogItemId_idx"
ON "CatalogItemLocalization"("companyId", "catalogItemId");

ALTER TABLE "CatalogItemLocalization" ADD CONSTRAINT "CatalogItemLocalization_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogItemLocalization" ADD CONSTRAINT "CatalogItemLocalization_catalogItemId_fkey"
FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CatalogItemLocalization"
    ("id", "companyId", "catalogItemId", "locale", "name", "description", "source", "createdAt", "updatedAt")
SELECT 'cil_ar_' || "id", "companyId", "id", 'ar', "nameAr", "descriptionAr",
    'LEGACY'::"CatalogLocalizationSource", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CatalogItem" WHERE NULLIF(BTRIM("nameAr"), '') IS NOT NULL;

INSERT INTO "CatalogItemLocalization"
    ("id", "companyId", "catalogItemId", "locale", "name", "description", "source", "createdAt", "updatedAt")
SELECT 'cil_en_' || "id", "companyId", "id", 'en', "nameEn", "descriptionEn",
    'LEGACY'::"CatalogLocalizationSource", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CatalogItem" WHERE NULLIF(BTRIM("nameEn"), '') IS NOT NULL;
