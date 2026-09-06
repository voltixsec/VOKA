-- CreateEnum
CREATE TYPE "UniversalIngestionReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "UniversalIngestionReviewEvent" (
    "id" TEXT NOT NULL,
    "ingestionRecordId" TEXT NOT NULL,
    "decision" "UniversalIngestionReviewDecision" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniversalIngestionReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UniversalIngestionReviewEvent_ingestionRecordId_createdAt_idx" ON "UniversalIngestionReviewEvent"("ingestionRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "UniversalIngestionReviewEvent_actorUserId_createdAt_idx" ON "UniversalIngestionReviewEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "UniversalIngestionReviewEvent_decision_createdAt_idx" ON "UniversalIngestionReviewEvent"("decision", "createdAt");

-- AddForeignKey
ALTER TABLE "UniversalIngestionReviewEvent" ADD CONSTRAINT "UniversalIngestionReviewEvent_ingestionRecordId_fkey" FOREIGN KEY ("ingestionRecordId") REFERENCES "UniversalIngestionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
