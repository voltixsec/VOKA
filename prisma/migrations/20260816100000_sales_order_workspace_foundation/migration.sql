-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN "documentBrandSnapshot" JSONB;

-- CreateTable
CREATE TABLE "SalesOrderActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrderActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesOrderActivity_companyId_salesOrderId_createdAt_idx" ON "SalesOrderActivity"("companyId", "salesOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesOrderActivity_salesOrderId_idx" ON "SalesOrderActivity"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesOrderActivity_actorUserId_idx" ON "SalesOrderActivity"("actorUserId");

-- AddForeignKey
ALTER TABLE "SalesOrderActivity" ADD CONSTRAINT "SalesOrderActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderActivity" ADD CONSTRAINT "SalesOrderActivity_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderActivity" ADD CONSTRAINT "SalesOrderActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
