DROP TABLE IF EXISTS "CompanyUniversalLibrarySector";

CREATE TABLE "CompanyUniversalLibrarySector" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyUniversalLibrarySector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyUniversalLibrarySector_companyId_categoryId_key" ON "CompanyUniversalLibrarySector"("companyId", "categoryId");
CREATE INDEX "CompanyUniversalLibrarySector_companyId_isActive_idx" ON "CompanyUniversalLibrarySector"("companyId", "isActive");
CREATE INDEX "CompanyUniversalLibrarySector_categoryId_idx" ON "CompanyUniversalLibrarySector"("categoryId");

ALTER TABLE "CompanyUniversalLibrarySector" ADD CONSTRAINT "CompanyUniversalLibrarySector_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyUniversalLibrarySector" ADD CONSTRAINT "CompanyUniversalLibrarySector_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "UniversalCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
