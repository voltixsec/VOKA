-- Phase 2A-9: governed proprietary CAD/BIM derivation foundation (DWG → DXF / RVT → IFC).
--
-- Additive only:
-- - two new SourceArtifactKind values (DWG, RVT) for immutable proprietary
--   ORIGINAL artifacts. No existing row, column, constraint, or index changes;
-- - three new enums (ArtifactDerivationKind, ArtifactDerivationMethod,
--   ArtifactDerivationStatus) and the ArtifactDerivation lineage table.
--
-- Postgres allows a new enum value to be added inside a transaction as long as
-- the value is not used in that same transaction, which is the case here: no
-- row is written. RFA, DGN, IFCZIP, NWC, and NWD are deliberately NOT added —
-- they remain unsupported and are detected and rejected truthfully at ingest.
ALTER TYPE "SourceArtifactKind" ADD VALUE IF NOT EXISTS 'DWG';
ALTER TYPE "SourceArtifactKind" ADD VALUE IF NOT EXISTS 'RVT';

CREATE TYPE "ArtifactDerivationKind" AS ENUM ('DWG_TO_DXF', 'RVT_TO_IFC');
CREATE TYPE "ArtifactDerivationMethod" AS ENUM ('AUTOMATED_CONVERSION', 'USER_PROVIDED_EXPORT');
CREATE TYPE "ArtifactDerivationStatus" AS ENUM ('PENDING', 'RUNNING', 'AWAITING_USER_EXPORT', 'SUCCEEDED', 'FAILED', 'NOT_CONFIGURED', 'REJECTED');

CREATE TABLE "ArtifactDerivation" ("id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "originalArtifactId" TEXT NOT NULL, "derivedArtifactId" TEXT, "derivationKind" "ArtifactDerivationKind" NOT NULL, "derivationMethod" "ArtifactDerivationMethod" NOT NULL, "converterId" TEXT, "converterVersion" TEXT, "optionsFingerprint" TEXT NOT NULL, "sourceFormat" TEXT NOT NULL, "derivedFormat" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "derivedHash" TEXT, "status" "ArtifactDerivationStatus" NOT NULL DEFAULT 'PENDING', "failureReason" TEXT, "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "fidelityLimitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "derivationKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), CONSTRAINT "ArtifactDerivation_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "ArtifactDerivation_companyId_derivationKey_key" ON "ArtifactDerivation"("companyId", "derivationKey");
CREATE INDEX "ArtifactDerivation_companyId_originalArtifactId_idx" ON "ArtifactDerivation"("companyId", "originalArtifactId");
CREATE INDEX "ArtifactDerivation_companyId_derivedArtifactId_idx" ON "ArtifactDerivation"("companyId", "derivedArtifactId");
CREATE INDEX "ArtifactDerivation_companyId_status_createdAt_idx" ON "ArtifactDerivation"("companyId", "status", "createdAt");

ALTER TABLE "ArtifactDerivation" ADD CONSTRAINT "ArtifactDerivation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactDerivation" ADD CONSTRAINT "ArtifactDerivation_originalArtifactId_fkey" FOREIGN KEY ("originalArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArtifactDerivation" ADD CONSTRAINT "ArtifactDerivation_derivedArtifactId_fkey" FOREIGN KEY ("derivedArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
