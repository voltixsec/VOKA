-- CreateTable
CREATE TABLE "CompanyQuotationTermsTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scopeType" "QuotationScopeType" NOT NULL,
    "termsAr" TEXT,
    "termsEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyQuotationTermsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyQuotationTermsTemplate_companyId_idx" ON "CompanyQuotationTermsTemplate"("companyId");

-- CreateIndex
CREATE INDEX "CompanyQuotationTermsTemplate_companyId_scopeType_idx" ON "CompanyQuotationTermsTemplate"("companyId", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyQuotationTermsTemplate_companyId_scopeType_key" ON "CompanyQuotationTermsTemplate"("companyId", "scopeType");

-- AddForeignKey
ALTER TABLE "CompanyQuotationTermsTemplate" ADD CONSTRAINT "CompanyQuotationTermsTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
