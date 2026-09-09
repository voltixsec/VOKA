CREATE TABLE "CompanyUniversalLibrarySector" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sectorCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyUniversalLibrarySector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyUniversalLibrarySector_companyId_sectorCode_key" ON "CompanyUniversalLibrarySector"("companyId", "sectorCode");
CREATE INDEX "CompanyUniversalLibrarySector_companyId_idx" ON "CompanyUniversalLibrarySector"("companyId");

ALTER TABLE "CompanyUniversalLibrarySector" ADD CONSTRAINT "CompanyUniversalLibrarySector_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
