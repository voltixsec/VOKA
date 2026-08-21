CREATE TYPE "UniversalSourceApprovalState" AS ENUM ('DRAFT', 'APPROVED', 'PAUSED', 'BLOCKED');
CREATE TYPE "UniversalPolicyState" AS ENUM ('UNKNOWN', 'ALLOWED', 'DISALLOWED');
CREATE TYPE "UniversalSourceHealth" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'BLOCKED');
CREATE TYPE "UniversalAcquisitionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'BLOCKED', 'CANCELLED');

ALTER TABLE "UniversalSource"
  ADD COLUMN "acquisitionMode" TEXT NOT NULL DEFAULT 'HTTP_JSON',
  ADD COLUMN "licenseReferenceUrl" TEXT,
  ADD COLUMN "robotsPolicy" TEXT,
  ADD COLUMN "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commercialUseState" "UniversalPolicyState" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "redistributionState" "UniversalPolicyState" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "maxRequestsPerMinute" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "maxRecordsPerRun" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "maxRecordsPerDay" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "acquisitionTimeoutMs" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "lastAcquisitionSucceededAt" TIMESTAMP(3),
  ADD COLUMN "lastAcquisitionFailedAt" TIMESTAMP(3),
  ADD COLUMN "healthStatus" "UniversalSourceHealth" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "governanceNotes" TEXT,
  ADD COLUMN "approvalState" "UniversalSourceApprovalState" NOT NULL DEFAULT 'DRAFT',
  ADD CONSTRAINT "UniversalSource_acquisition_limits_check" CHECK ("maxRequestsPerMinute" BETWEEN 1 AND 120 AND "maxRecordsPerRun" BETWEEN 1 AND 1000 AND "maxRecordsPerDay" BETWEEN 1 AND 1000 AND "acquisitionTimeoutMs" BETWEEN 1000 AND 30000 AND "maxRetries" BETWEEN 0 AND 5);

CREATE TABLE "UniversalAcquisitionRun" (
  "id" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "initiatedByUserId" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL, "status" "UniversalAcquisitionRunStatus" NOT NULL DEFAULT 'QUEUED',
  "requestedLimit" INTEGER NOT NULL, "reservedRequestCount" INTEGER NOT NULL DEFAULT 1, "fetchedCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0, "stagedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0, "changedCount" INTEGER NOT NULL DEFAULT 0,
  "reviewRequiredCount" INTEGER NOT NULL DEFAULT 0, "publishedCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0, "failedCount" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0, "continuationCursor" TEXT, "safeErrorSummary" TEXT,
  "policySnapshot" JSONB NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UniversalAcquisitionRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UniversalAcquisitionRun_counts_check" CHECK ("requestedLimit" BETWEEN 1 AND 1000 AND "reservedRequestCount" BETWEEN 1 AND 6 AND "fetchedCount" >= 0 AND "acceptedCount" >= 0 AND "stagedCount" >= 0 AND "duplicateCount" >= 0 AND "changedCount" >= 0 AND "reviewRequiredCount" >= 0 AND "publishedCount" >= 0 AND "rejectedCount" >= 0 AND "failedCount" >= 0 AND "retryCount" >= 0)
);
ALTER TABLE "UniversalAcquisitionRun" ADD CONSTRAINT "UniversalAcquisitionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "UniversalSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UniversalIngestionRecord" ADD COLUMN "acquisitionRunId" TEXT, ADD COLUMN "canonicalSourceUrl" TEXT, ADD COLUMN "fetchedAt" TIMESTAMP(3), ADD COLUMN "attributionText" TEXT;
ALTER TABLE "UniversalIngestionRecord" ADD CONSTRAINT "UniversalIngestionRecord_acquisitionRunId_fkey" FOREIGN KEY ("acquisitionRunId") REFERENCES "UniversalAcquisitionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UniversalItemProvenance" ADD COLUMN "acquisitionRunId" TEXT, ADD COLUMN "canonicalSourceUrl" TEXT, ADD COLUMN "attributionText" TEXT, ADD COLUMN "licenseReferenceUrl" TEXT, ADD COLUMN "rawPayloadHash" TEXT;
ALTER TABLE "UniversalItemProvenance" ADD CONSTRAINT "UniversalItemProvenance_acquisitionRunId_fkey" FOREIGN KEY ("acquisitionRunId") REFERENCES "UniversalAcquisitionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "UniversalSource_approvalState_isActive_idx" ON "UniversalSource"("approvalState", "isActive");
CREATE INDEX "UniversalSource_healthStatus_idx" ON "UniversalSource"("healthStatus");
CREATE INDEX "UniversalAcquisitionRun_sourceId_createdAt_idx" ON "UniversalAcquisitionRun"("sourceId", "createdAt");
CREATE INDEX "UniversalAcquisitionRun_status_createdAt_idx" ON "UniversalAcquisitionRun"("status", "createdAt");
CREATE INDEX "UniversalAcquisitionRun_createdAt_idx" ON "UniversalAcquisitionRun"("createdAt");
CREATE INDEX "UniversalIngestionRecord_acquisitionRunId_idx" ON "UniversalIngestionRecord"("acquisitionRunId");
CREATE INDEX "UniversalItemProvenance_acquisitionRunId_idx" ON "UniversalItemProvenance"("acquisitionRunId");
