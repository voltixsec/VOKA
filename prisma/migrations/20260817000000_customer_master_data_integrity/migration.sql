-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "nameAr" TEXT,
ADD COLUMN "nameEn" TEXT;

-- CreateTable
CREATE TABLE "CustomerSequence" (
    "companyId" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CustomerSequence_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "Customer_companyId_nameAr_idx" ON "Customer"("companyId", "nameAr");

-- CreateIndex
CREATE INDEX "Customer_companyId_nameEn_idx" ON "Customer"("companyId", "nameEn");

-- AddForeignKey
ALTER TABLE "CustomerSequence" ADD CONSTRAINT "CustomerSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
