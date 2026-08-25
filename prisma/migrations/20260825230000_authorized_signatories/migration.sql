CREATE TABLE "AuthorizedSignatory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "titleAr" TEXT,
    "titleEn" TEXT,
    "signatureUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowedDocumentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthorizedSignatory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthorizedSignatory_companyId_isActive_idx" ON "AuthorizedSignatory"("companyId", "isActive");
CREATE INDEX "AuthorizedSignatory_companyId_isDefault_idx" ON "AuthorizedSignatory"("companyId", "isDefault");
CREATE UNIQUE INDEX "AuthorizedSignatory_one_default_per_company_idx" ON "AuthorizedSignatory"("companyId") WHERE "isDefault" = true;
ALTER TABLE "AuthorizedSignatory" ADD CONSTRAINT "AuthorizedSignatory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
