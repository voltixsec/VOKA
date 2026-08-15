-- AlterEnum
ALTER TYPE "SalesOrderStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "SalesOrderStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByName" TEXT,
ADD COLUMN     "cancelledByRole" TEXT,
ADD COLUMN     "cancelledByUserId" TEXT,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedByName" TEXT,
ADD COLUMN     "confirmedByRole" TEXT,
ADD COLUMN     "confirmedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "SalesOrder_confirmedByUserId_idx" ON "SalesOrder"("confirmedByUserId");

-- CreateIndex
CREATE INDEX "SalesOrder_cancelledByUserId_idx" ON "SalesOrder"("cancelledByUserId");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
