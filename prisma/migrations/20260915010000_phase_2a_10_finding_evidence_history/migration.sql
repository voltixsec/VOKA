-- Phase 2A-10 hardening: FINDING EVIDENCE HISTORY.
--
-- ADDITIVE ONLY. No column, type, index, constraint, or row of any earlier
-- migration — including the still-unaccepted 2A-10 migration
-- 20260915000000_phase_2a_10_cross_document_evidence — is altered, dropped, or
-- backfilled. Nothing here creates a Requirement, DrawingTakeoffLine, BOM line,
-- quotation line, product selection, supplier record, procurement requirement,
-- RFQ, offer, award, or PO.
--
-- Why this exists (load-bearing, not cosmetic):
-- - `CrossDocumentFinding` deliberately holds only the CURRENT evidence
--   projection: its `evidenceSignature` Json and its `FindingParticipant` rows
--   are replaced on every run so a two-source disagreement never renders as
--   three sides. That made the previous projection the only copy of the older
--   evidence, so Run 1 ("BOQ 24 vs IFC 22") stopped being readable the moment
--   Run 2 ("BOQ 24 vs IFC 23") replaced the current participants. A hash-only
--   signature history would not have fixed it: the reviewer needs the old
--   immutable claim ids, the exact old locators, and the exact old literals,
--   plus their finding/run association.
-- - These two tables are that mechanism: one observation row per
--   (finding, run), and one join row per claim that observation rested on.
-- - The join references the IMMUTABLE `NormalizedEvidenceClaim` row instead of
--   copying it. The claim already holds the verbatim literal, the unit, the
--   exact locator, the citation, the artifact hash, and the source numeric
--   view, so duplicating it would only create a second place where history
--   could drift. The only observation-owned columns are the finding/run
--   association and the stable display ordinal.
-- - No row is ever updated in place: `("findingId","comparisonRunId")` is
--   unique, so a re-run of the same run id collides with itself instead of
--   rewriting an earlier observation.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE "FindingEvidenceObservation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "comparisonRunId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "evidenceSignatureHash" TEXT NOT NULL,
  "evidenceChanged" BOOLEAN NOT NULL DEFAULT false,
  "entryCount" INTEGER NOT NULL DEFAULT 0,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingEvidenceObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FindingEvidenceObservationEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "observationId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "comparisonRunId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingEvidenceObservationEntry_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "FindingEvidenceObservation_findingId_comparisonRunId_key" ON "FindingEvidenceObservation"("findingId", "comparisonRunId");
CREATE INDEX "FindingEvidenceObservation_companyId_findingId_observedAt_idx" ON "FindingEvidenceObservation"("companyId", "findingId", "observedAt");
CREATE INDEX "FindingEvidenceObservation_companyId_comparisonRunId_idx" ON "FindingEvidenceObservation"("companyId", "comparisonRunId");

CREATE UNIQUE INDEX "FindingEvidenceObservationEntry_observationId_claimId_key" ON "FindingEvidenceObservationEntry"("observationId", "claimId");
CREATE INDEX "FindingEvidenceObservationEntry_companyId_findingId_comparisonRunId_idx" ON "FindingEvidenceObservationEntry"("companyId", "findingId", "comparisonRunId");
CREATE INDEX "FindingEvidenceObservationEntry_claimId_idx" ON "FindingEvidenceObservationEntry"("claimId");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "FindingEvidenceObservation" ADD CONSTRAINT "FindingEvidenceObservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingEvidenceObservation" ADD CONSTRAINT "FindingEvidenceObservation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CrossDocumentFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingEvidenceObservation" ADD CONSTRAINT "FindingEvidenceObservation_comparisonRunId_fkey" FOREIGN KEY ("comparisonRunId") REFERENCES "ComparisonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FindingEvidenceObservationEntry" ADD CONSTRAINT "FindingEvidenceObservationEntry_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "FindingEvidenceObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingEvidenceObservationEntry" ADD CONSTRAINT "FindingEvidenceObservationEntry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
