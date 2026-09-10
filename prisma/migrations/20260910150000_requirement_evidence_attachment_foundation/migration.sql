CREATE TYPE "SourceArtifactContext" AS ENUM ('SALES_ASSISTANT', 'TAKEOFF', 'ENGINEERING_TENDER');
CREATE TYPE "SourceArtifactKind" AS ENUM ('PDF', 'IMAGE');
CREATE TYPE "SourceArtifactProcessingState" AS ENUM ('RECEIVED', 'TEXT_EXTRACTED', 'STORED_PENDING_VISION', 'DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE', 'FAILED');
CREATE TYPE "RequirementQuantityStatus" AS ENUM ('USER_PROVIDED', 'EXTRACTED_REVIEW_REQUIRED', 'DETERMINISTIC', 'UNKNOWN');
CREATE TYPE "RequirementReviewState" AS ENUM ('NEEDS_REVIEW', 'CONFIRMED', 'REJECTED');

ALTER TABLE "DrawingTakeoffSession" ADD COLUMN "sourceArtifactId" TEXT;

CREATE TABLE "SourceArtifact" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "kind" "SourceArtifactKind" NOT NULL,
  "storageRef" TEXT NOT NULL,
  "context" "SourceArtifactContext" NOT NULL,
  "conversationRuntimeId" TEXT,
  "processingState" "SourceArtifactProcessingState" NOT NULL DEFAULT 'RECEIVED',
  "extractedText" TEXT,
  "extractedPages" JSONB,
  "processingError" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceArtifact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SourceArtifact_companyId_contentSha256_originalFilename_key" ON "SourceArtifact"("companyId", "contentSha256", "originalFilename");
CREATE INDEX "SourceArtifact_companyId_context_createdAt_idx" ON "SourceArtifact"("companyId", "context", "createdAt");
CREATE INDEX "SourceArtifact_companyId_processingState_idx" ON "SourceArtifact"("companyId", "processingState");

CREATE TABLE "Citation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sourceArtifactId" TEXT,
  "sourceType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "pageNumber" INTEGER,
  "sheet" TEXT,
  "section" TEXT,
  "lineLocator" TEXT,
  "url" TEXT,
  "publisher" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provenance" TEXT NOT NULL,
  "verificationState" TEXT NOT NULL,
  "confidence" DECIMAL(5,4),
  "supportedClaimSummary" TEXT NOT NULL,
  CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Citation_companyId_sourceArtifactId_idx" ON "Citation"("companyId", "sourceArtifactId");
CREATE INDEX "Citation_companyId_sourceType_idx" ON "Citation"("companyId", "sourceType");

CREATE TABLE "Requirement" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "stableKey" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "sourceContext" "SourceArtifactContext" NOT NULL,
  "parentId" TEXT,
  "systemKey" TEXT,
  "componentKey" TEXT,
  "materialKey" TEXT,
  "serviceKey" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18,3),
  "unit" TEXT,
  "technicalRequirement" TEXT,
  "quantityStatus" "RequirementQuantityStatus" NOT NULL DEFAULT 'UNKNOWN',
  "reviewState" "RequirementReviewState" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "locality" TEXT,
  "provenance" TEXT NOT NULL,
  "correctionTrace" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Requirement_companyId_stableKey_key" ON "Requirement"("companyId", "stableKey");
CREATE INDEX "Requirement_companyId_sourceContext_reviewState_idx" ON "Requirement"("companyId", "sourceContext", "reviewState");
CREATE INDEX "Requirement_companyId_systemKey_componentKey_idx" ON "Requirement"("companyId", "systemKey", "componentKey");

CREATE TABLE "RequirementCitation" (
  "requirementId" TEXT NOT NULL,
  "citationId" TEXT NOT NULL,
  "claimSummary" TEXT NOT NULL,
  CONSTRAINT "RequirementCitation_pkey" PRIMARY KEY ("requirementId", "citationId")
);
CREATE INDEX "RequirementCitation_citationId_idx" ON "RequirementCitation"("citationId");

ALTER TABLE "SourceArtifact" ADD CONSTRAINT "SourceArtifact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceArtifact" ADD CONSTRAINT "SourceArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequirementCitation" ADD CONSTRAINT "RequirementCitation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequirementCitation" ADD CONSTRAINT "RequirementCitation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrawingTakeoffSession" ADD CONSTRAINT "DrawingTakeoffSession_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DrawingTakeoffSession_companyId_sourceArtifactId_idx" ON "DrawingTakeoffSession"("companyId", "sourceArtifactId");
