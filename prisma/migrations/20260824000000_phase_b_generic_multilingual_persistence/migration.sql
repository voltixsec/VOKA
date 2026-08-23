-- CreateEnum
CREATE TYPE "LocalizedContentStatus" AS ENUM ('PENDING', 'VALID', 'STALE', 'FAILED');

-- CreateTable
CREATE TABLE "LocalizedContent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sourceLocale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "LocalizedContentStatus" NOT NULL DEFAULT 'VALID',
    "sourceHash" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "translatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalizedContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalizedContent_companyId_resourceType_resourceId_fieldKey_locale_key" ON "LocalizedContent"("companyId", "resourceType", "resourceId", "fieldKey", "locale");

-- CreateIndex
CREATE INDEX "LocalizedContent_companyId_resourceType_resourceId_idx" ON "LocalizedContent"("companyId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "LocalizedContent_resourceType_resourceId_locale_idx" ON "LocalizedContent"("resourceType", "resourceId", "locale");

-- CreateIndex
CREATE INDEX "LocalizedContent_status_idx" ON "LocalizedContent"("status");

-- CreateIndex
CREATE INDEX "LocalizedContent_companyId_status_idx" ON "LocalizedContent"("companyId", "status");

-- AddForeignKey
ALTER TABLE "LocalizedContent" ADD CONSTRAINT "LocalizedContent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
