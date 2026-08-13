-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "verificationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_verificationToken_key" ON "Quotation"("verificationToken");
