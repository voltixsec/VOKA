-- Phase 2A-11: Engineering Takeoff + Governed Engineering BOM.
--
-- ADDITIVE ONLY. No column, type, index, constraint, or row of any earlier
-- migration is altered, dropped, renamed, or backfilled. The accepted Phase
-- 2A-10 migrations (20260915000000_phase_2a_10_cross_document_evidence and
-- 20260915010000_phase_2a_10_finding_evidence_history) are untouched history.
--
-- This migration creates ONLY engineering-truth structures. Nothing here
-- creates or references a Quotation, QuotationLine, Invoice, ProductSelection,
-- Supplier, ProcurementRequirement, Rfq, Offer, Award, or PurchaseOrder, and no
-- column anywhere holds a price, rate, amount, currency, pack size, minimum
-- order quantity, procurement order quantity, or lead time. That absence is
-- deliberate and is enforced by the no-promotion tests.
--
-- Design notes that are load-bearing, not cosmetic:
-- - EngineeringQuantityCandidate.id is the deterministic candidate id produced
--   by the candidate builder. A candidate carries NO approved-value column:
--   approval lives exclusively in EngineeringQuantityDecision.
-- - EngineeringOccurrenceLedgerEntry is the durable occurrence ledger. One row
--   per occurrence VOKA considered — included OR excluded — with its exact
--   locator, classification, inclusion/exclusion reason, and the counting rule
--   id + version that judged it. A counted quantity is reproducible by
--   re-reading these rows; an unexplained aggregate is never stored alone.
-- - derivationFamilyRootArtifactId is carried on every occurrence and candidate
--   so a Phase 2A-9 derivation family (DWG+DXF, RVT+IFC) can never be double
--   counted: the family root is always the ORIGINAL proprietary artifact.
-- - EngineeringCandidateConflict records a DISPUTE, never a winner: there is no
--   selected-side, preferred-side, or resolved-value column. Conflict resolution
--   is a decision.
-- - EngineeringQuantityDecision is APPEND-ONLY. Supersession is by reference
--   ("supersedesDecisionId"/"supersededByDecisionId" and the monotonic
--   "decisionVersion"); an approved value is never rewritten in place.
-- - EngineeringAdjustment NEVER mutates its base: "baseDecisionId" + "baseValue"
--   name the approved base it extends and "adjustedValue" is a separate result.
-- - EngineeringBomVersion is IMMUTABLE once APPROVED. A change produces a new
--   version pointing at the one it replaces; prior rows are never touched.
-- - EngineeringBomRow is PRODUCT-AGNOSTIC: a generic engineering subject,
--   specification constraints, and an approved quantity. There is deliberately
--   no catalog item, product selection, supplier, price, or order quantity.
-- - EngineeringBomRowConstraint.isSpecificationOnly defaults true: a
--   manufacturer or named tender model is a SPECIFICATION CONSTRAINT, not a
--   supplier reference and not a product selection.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "EngineeringQuantityOrigin" AS ENUM ('OBSERVED', 'STATED', 'DECLARED_MODEL', 'COUNTED', 'CALCULATED', 'ADJUSTED', 'APPROVED_ENGINEERING');
CREATE TYPE "EngineeringRequirementKind" AS ENUM ('EQUIPMENT', 'MATERIAL', 'COMPONENT_OR_ACCESSORY', 'SERVICE_OR_WORK');
CREATE TYPE "EngineeringRequirementNature" AS ENUM ('PHYSICAL_ARTICLE', 'PERFORMED_SERVICE');
CREATE TYPE "EngineeringReadinessState" AS ENUM ('NOT_READY', 'BLOCKED', 'REVIEW_REQUIRED', 'READY_FOR_DECISION', 'APPROVED');
CREATE TYPE "EngineeringBomCompletenessState" AS ENUM ('INCOMPLETE', 'REVIEW_REQUIRED', 'PARTIALLY_APPROVED', 'APPROVED');
CREATE TYPE "EngineeringTakeoffScopeKind" AS ENUM ('MATERIAL_TAKEOFF', 'EQUIPMENT_SCHEDULE_TAKEOFF', 'SYSTEM_TAKEOFF', 'DISCIPLINE_TAKEOFF', 'WHOLE_PACKAGE_TAKEOFF');
CREATE TYPE "EngineeringTakeoffScopeState" AS ENUM ('OPEN', 'DECIDING', 'BOM_ISSUED', 'SUPERSEDED');
CREATE TYPE "EngineeringOccurrenceClass" AS ENUM ('MODEL_SPACE_INSTANCE', 'DRAWING_MODEL_ENTITY', 'TYPE_DEFINITION', 'TYPE_OBJECT', 'PAPER_SPACE_ENTITY', 'TITLE_BLOCK', 'LEGEND_SYMBOL', 'ANNOTATION_SYMBOL', 'DIMENSION_ENTITY', 'TEXT_LABEL', 'BLOCK_DEFINITION', 'XREF_REFERENCE', 'PROPERTY_SET', 'QUANTITY_SET', 'MATERIAL_ASSIGNMENT', 'CLASSIFICATION_ASSIGNMENT', 'SYSTEM_CONTAINER', 'SPATIAL_CONTAINER', 'RELATIONSHIP_OBJECT', 'DOCUMENT_REFERENCE', 'LAYER_DEFINITION', 'STYLE_DEFINITION');
CREATE TYPE "EngineeringCountingRuleFamily" AS ENUM ('DXF', 'IFC');
CREATE TYPE "EngineeringCandidateBasis" AS ENUM ('SOURCE_CLAIM', 'OCCURRENCE_COUNT', 'GOVERNED_CALCULATION', 'ENGINEERING_ADJUSTMENT');
CREATE TYPE "EngineeringCandidateConflictState" AS ENUM ('UNDISPUTED', 'CONFLICTING', 'AMBIGUOUS_SUBJECT', 'BLOCKED_INCOMPATIBLE_UNITS');
CREATE TYPE "EngineeringQuantityDecisionState" AS ENUM ('APPROVED', 'SUPERSEDED', 'WITHDRAWN');
CREATE TYPE "EngineeringQuantityDecisionBasis" AS ENUM ('ADOPTED_SOURCE_VALUE', 'ADOPTED_COUNTED_VALUE', 'ADOPTED_CALCULATED_VALUE', 'ADOPTED_ADJUSTED_VALUE', 'RESOLVED_SOURCE_CONFLICT', 'REPLACED_BY_REVISED_EVIDENCE', 'CORRECTED_BY_HUMAN');
CREATE TYPE "EngineeringCalculationInputSource" AS ENUM ('EVIDENCE_CLAIM', 'QUANTITY_DECISION', 'ADJUSTMENT', 'CALCULATION_RESULT');
CREATE TYPE "EngineeringAdjustmentType" AS ENUM ('WASTAGE', 'SPARE_ALLOWANCE', 'CUTTING_LOSS', 'CONTINGENCY', 'OVERLAP', 'LAPPING', 'COVERAGE_ALLOWANCE');
CREATE TYPE "EngineeringAdjustmentMode" AS ENUM ('PERCENTAGE', 'MULTIPLIER', 'ABSOLUTE_ADDITION');
CREATE TYPE "EngineeringBomVersionState" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN');
CREATE TYPE "EngineeringBomRowConstraintKind" AS ENUM ('REQUIRED_SPECIFICATION', 'MANUFACTURER', 'NAMED_TENDER_MODEL', 'DIMENSION', 'RATING_OR_PERFORMANCE', 'MATERIAL_SPECIFICATION', 'STANDARD_OR_CODE');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE "EngineeringTakeoffScope" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectContextKey" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "scopeKind" "EngineeringTakeoffScopeKind" NOT NULL,
  "state" "EngineeringTakeoffScopeState" NOT NULL DEFAULT 'OPEN',
  "comparisonScopeId" TEXT NOT NULL,
  "comparisonRunId" TEXT,
  "evidenceInputDigest" TEXT,
  "acceptedClaimCount" INTEGER NOT NULL DEFAULT 0,
  "withheldClaimCount" INTEGER NOT NULL DEFAULT 0,
  "revisionPolicy" TEXT NOT NULL DEFAULT 'ACTIVE_ONLY',
  "readiness" "EngineeringReadinessState" NOT NULL DEFAULT 'NOT_READY',
  "readinessReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "completeness" "EngineeringBomCompletenessState",
  "blockReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scopeVersion" INTEGER NOT NULL DEFAULT 1,
  "supersedesScopeId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "takeoffContractVersion" TEXT NOT NULL DEFAULT '2a-11.takeoff.v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EngineeringTakeoffScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringCountingRule" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "family" "EngineeringCountingRuleFamily" NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "admittedEntityTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "modelSpaceOnly" BOOLEAN NOT NULL DEFAULT true,
  "requiresSubjectIdentity" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringCountingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringOccurrenceLedgerEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "countingRuleId" TEXT NOT NULL,
  "subjectMatchKey" TEXT,
  "subjectKeyNamespace" TEXT,
  "artifactId" TEXT NOT NULL,
  "derivationFamilyRootArtifactId" TEXT NOT NULL,
  "evidenceClaimId" TEXT,
  "locator" TEXT NOT NULL,
  "family" "EngineeringCountingRuleFamily" NOT NULL,
  "sourceType" TEXT NOT NULL,
  "occurrenceClass" "EngineeringOccurrenceClass" NOT NULL,
  "included" BOOLEAN NOT NULL,
  "inclusionReason" TEXT,
  "exclusionReason" TEXT,
  "note" TEXT,
  "countingRuleVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringOccurrenceLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringQuantityCandidate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "subjectMatchKey" TEXT NOT NULL,
  "subjectKeyNamespace" TEXT NOT NULL,
  "subjectLabel" TEXT,
  "requirementKind" "EngineeringRequirementKind" NOT NULL DEFAULT 'MATERIAL',
  "origin" "EngineeringQuantityOrigin" NOT NULL,
  "basis" "EngineeringCandidateBasis" NOT NULL,
  "value" DECIMAL(18,3),
  "unitLiteral" TEXT,
  "unitDimension" TEXT,
  "valueLiteral" TEXT,
  "subjectClusterId" TEXT,
  "contributingDerivationFamilyRoots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "conflictState" "EngineeringCandidateConflictState" NOT NULL DEFAULT 'UNDISPUTED',
  "conflictReason" TEXT,
  "readiness" "EngineeringReadinessState" NOT NULL DEFAULT 'NOT_READY',
  "readinessReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceCoverage" TEXT NOT NULL DEFAULT 'COMPLETE',
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringQuantityCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringQuantityCandidateSource" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "basis" "EngineeringCandidateBasis" NOT NULL,
  "claimId" TEXT,
  "sourceArtifactId" TEXT,
  "derivationFamilyRootArtifactId" TEXT,
  "locator" TEXT,
  "humanLocator" TEXT,
  "citationId" TEXT,
  "ledgerEntryId" TEXT,
  "calculationId" TEXT,
  "adjustmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringQuantityCandidateSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringCandidateConflict" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "subjectMatchKey" TEXT NOT NULL,
  "leftCandidateId" TEXT NOT NULL,
  "rightCandidateId" TEXT NOT NULL,
  "conflictState" "EngineeringCandidateConflictState" NOT NULL,
  "reason" TEXT NOT NULL,
  "requiresExplicitDecision" BOOLEAN NOT NULL DEFAULT true,
  "resolvedByDecisionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringCandidateConflict_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringQuantityDecision" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "subjectMatchKey" TEXT NOT NULL,
  "subjectKeyNamespace" TEXT NOT NULL,
  "subjectLabel" TEXT,
  "requirementKind" "EngineeringRequirementKind" NOT NULL,
  "decisionVersion" INTEGER NOT NULL,
  "approvedValue" DECIMAL(18,3) NOT NULL,
  "approvedUnitLiteral" TEXT NOT NULL,
  "approvedUnitDimension" TEXT NOT NULL,
  "quantityOrigin" "EngineeringQuantityOrigin" NOT NULL,
  "decisionBasis" "EngineeringQuantityDecisionBasis" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "selectedCandidateId" TEXT,
  "resolvedConflictSubjectKey" TEXT,
  "supersedesDecisionId" TEXT,
  "supersededByDecisionId" TEXT,
  "state" "EngineeringQuantityDecisionState" NOT NULL DEFAULT 'APPROVED',
  "revisionMembershipIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "documentIdentityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "decisionContractVersion" TEXT NOT NULL DEFAULT '2a-11.decision.v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringQuantityDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringQuantityDecisionSource" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "calculationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringQuantityDecisionSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringQuantityDecisionClaim" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringQuantityDecisionClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringCalculation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "subjectMatchKey" TEXT NOT NULL,
  "subjectKeyNamespace" TEXT NOT NULL,
  "subjectLabel" TEXT,
  "requirementKind" "EngineeringRequirementKind" NOT NULL,
  "ruleId" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "resultValue" DECIMAL(18,3),
  "resultUnitLiteral" TEXT,
  "resultDimension" TEXT,
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "blockedReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inputDigest" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL,
  "calculationContractVersion" TEXT NOT NULL DEFAULT '2a-11.calculation.v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringCalculation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringCalculationInput" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "calculationId" TEXT NOT NULL,
  "inputName" TEXT NOT NULL,
  "source" "EngineeringCalculationInputSource" NOT NULL,
  "sourceReferenceId" TEXT NOT NULL,
  "inputValue" DECIMAL(18,3),
  "inputUnitLiteral" TEXT,
  "resolved" BOOLEAN NOT NULL,
  "unresolvedReason" TEXT,
  "candidateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringCalculationInput_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringAdjustment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "subjectMatchKey" TEXT NOT NULL,
  "subjectKeyNamespace" TEXT NOT NULL,
  "subjectLabel" TEXT,
  "requirementKind" "EngineeringRequirementKind" NOT NULL,
  "adjustmentType" "EngineeringAdjustmentType" NOT NULL,
  "mode" "EngineeringAdjustmentMode" NOT NULL,
  "adjustmentFactor" DECIMAL(18,6) NOT NULL,
  "normalizedFactor" DECIMAL(18,6),
  "unitLiteral" TEXT,
  "dimension" TEXT,
  "baseDecisionId" TEXT NOT NULL,
  "baseValue" DECIMAL(18,3) NOT NULL,
  "adjustedValue" DECIMAL(18,3),
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "blockedReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rationale" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "readiness" "EngineeringReadinessState" NOT NULL DEFAULT 'NOT_READY',
  "adjustmentContractVersion" TEXT NOT NULL DEFAULT '2a-11.adjustment.v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringBomVersion" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "takeoffScopeId" TEXT NOT NULL,
  "engineeringScope" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "previousVersionId" TEXT,
  "state" "EngineeringBomVersionState" NOT NULL DEFAULT 'DRAFT',
  "completeness" "EngineeringBomCompletenessState" NOT NULL DEFAULT 'INCOMPLETE',
  "comparisonScopeId" TEXT,
  "comparisonRunId" TEXT,
  "evidenceInputDigest" TEXT,
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "changeNote" TEXT NOT NULL DEFAULT '',
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "approvedRowCount" INTEGER NOT NULL DEFAULT 0,
  "completenessReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bomContractVersion" TEXT NOT NULL DEFAULT '2a-11.bom.v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringBomVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringBomVersionDecision" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bomVersionId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringBomVersionDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringBomRow" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bomVersionId" TEXT NOT NULL,
  "rowKey" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "engineeringSubject" TEXT NOT NULL,
  "requirementKind" "EngineeringRequirementKind" NOT NULL,
  "requirementNature" "EngineeringRequirementNature" NOT NULL,
  "approvedQuantity" DECIMAL(18,3) NOT NULL,
  "unitLiteral" TEXT NOT NULL,
  "unitDimension" TEXT NOT NULL,
  "quantityDecisionId" TEXT NOT NULL,
  "decisionVersion" INTEGER NOT NULL,
  "quantityOrigin" "EngineeringQuantityOrigin" NOT NULL,
  "systemContext" TEXT,
  "locationContext" TEXT,
  "sourceClaimIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "derivationFamilyRootArtifactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "occurrenceLedgerEntryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "readiness" "EngineeringReadinessState" NOT NULL DEFAULT 'NOT_READY',
  "readinessReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isApprovedRow" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringBomRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringBomRowConstraint" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bomRowId" TEXT NOT NULL,
  "kind" "EngineeringBomRowConstraintKind" NOT NULL,
  "value" TEXT NOT NULL,
  "sourceClaimId" TEXT,
  "locator" TEXT,
  "isSpecificationOnly" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringBomRowConstraint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EngineeringBomRowAdjustment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bomRowId" TEXT NOT NULL,
  "adjustmentId" TEXT NOT NULL,
  "adjustmentType" "EngineeringAdjustmentType" NOT NULL,
  "mode" "EngineeringAdjustmentMode" NOT NULL,
  "factor" DECIMAL(18,6) NOT NULL,
  "baseValue" DECIMAL(18,3) NOT NULL,
  "adjustedValue" DECIMAL(18,3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringBomRowAdjustment_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "EngineeringTakeoffScope_companyId_comparisonScopeId_scopeKind_name_key" ON "EngineeringTakeoffScope"("companyId", "comparisonScopeId", "scopeKind", "name");
CREATE INDEX "EngineeringTakeoffScope_companyId_state_idx" ON "EngineeringTakeoffScope"("companyId", "state");
CREATE INDEX "EngineeringTakeoffScope_companyId_comparisonScopeId_idx" ON "EngineeringTakeoffScope"("companyId", "comparisonScopeId");
CREATE INDEX "EngineeringTakeoffScope_companyId_readiness_idx" ON "EngineeringTakeoffScope"("companyId", "readiness");

CREATE UNIQUE INDEX "EngineeringCountingRule_companyId_takeoffScopeId_family_ruleVersion_key" ON "EngineeringCountingRule"("companyId", "takeoffScopeId", "family", "ruleVersion");
CREATE INDEX "EngineeringCountingRule_companyId_takeoffScopeId_idx" ON "EngineeringCountingRule"("companyId", "takeoffScopeId");

CREATE INDEX "EngineeringOccurrenceLedgerEntry_companyId_takeoffScopeId_included_idx" ON "EngineeringOccurrenceLedgerEntry"("companyId", "takeoffScopeId", "included");
CREATE INDEX "EngineeringOccurrenceLedgerEntry_companyId_takeoffScopeId_subjectMatchKey_idx" ON "EngineeringOccurrenceLedgerEntry"("companyId", "takeoffScopeId", "subjectMatchKey");
CREATE INDEX "EngineeringOccurrenceLedgerEntry_companyId_derivationFamilyRootArtifactId_idx" ON "EngineeringOccurrenceLedgerEntry"("companyId", "derivationFamilyRootArtifactId");
CREATE INDEX "EngineeringOccurrenceLedgerEntry_companyId_artifactId_idx" ON "EngineeringOccurrenceLedgerEntry"("companyId", "artifactId");

CREATE UNIQUE INDEX "EngineeringQuantityCandidate_companyId_takeoffScopeId_subjectMatchKey_origin_basis_key" ON "EngineeringQuantityCandidate"("companyId", "takeoffScopeId", "subjectMatchKey", "origin", "basis");
CREATE INDEX "EngineeringQuantityCandidate_companyId_takeoffScopeId_conflictState_idx" ON "EngineeringQuantityCandidate"("companyId", "takeoffScopeId", "conflictState");
CREATE INDEX "EngineeringQuantityCandidate_companyId_subjectMatchKey_idx" ON "EngineeringQuantityCandidate"("companyId", "subjectMatchKey");
CREATE INDEX "EngineeringQuantityCandidate_companyId_readiness_idx" ON "EngineeringQuantityCandidate"("companyId", "readiness");

CREATE UNIQUE INDEX "EngineeringQuantityCandidateSource_candidateId_basis_claimId_ledgerEntryId_key" ON "EngineeringQuantityCandidateSource"("candidateId", "basis", "claimId", "ledgerEntryId");
CREATE INDEX "EngineeringQuantityCandidateSource_companyId_candidateId_idx" ON "EngineeringQuantityCandidateSource"("companyId", "candidateId");
CREATE INDEX "EngineeringQuantityCandidateSource_claimId_idx" ON "EngineeringQuantityCandidateSource"("claimId");

CREATE UNIQUE INDEX "EngineeringCandidateConflict_leftCandidateId_rightCandidateId_key" ON "EngineeringCandidateConflict"("leftCandidateId", "rightCandidateId");
CREATE INDEX "EngineeringCandidateConflict_companyId_takeoffScopeId_subjectMatchKey_idx" ON "EngineeringCandidateConflict"("companyId", "takeoffScopeId", "subjectMatchKey");

CREATE UNIQUE INDEX "EngineeringQuantityDecision_companyId_takeoffScopeId_subjectMatchKey_decisionVersion_key" ON "EngineeringQuantityDecision"("companyId", "takeoffScopeId", "subjectMatchKey", "decisionVersion");
CREATE INDEX "EngineeringQuantityDecision_companyId_takeoffScopeId_state_idx" ON "EngineeringQuantityDecision"("companyId", "takeoffScopeId", "state");
CREATE INDEX "EngineeringQuantityDecision_companyId_subjectMatchKey_idx" ON "EngineeringQuantityDecision"("companyId", "subjectMatchKey");
CREATE INDEX "EngineeringQuantityDecision_companyId_decidedAt_idx" ON "EngineeringQuantityDecision"("companyId", "decidedAt");

CREATE UNIQUE INDEX "EngineeringQuantityDecisionSource_decisionId_candidateId_key" ON "EngineeringQuantityDecisionSource"("decisionId", "candidateId");
CREATE INDEX "EngineeringQuantityDecisionSource_candidateId_idx" ON "EngineeringQuantityDecisionSource"("candidateId");
CREATE INDEX "EngineeringQuantityDecisionSource_calculationId_idx" ON "EngineeringQuantityDecisionSource"("calculationId");

CREATE UNIQUE INDEX "EngineeringQuantityDecisionClaim_decisionId_claimId_key" ON "EngineeringQuantityDecisionClaim"("decisionId", "claimId");
CREATE INDEX "EngineeringQuantityDecisionClaim_claimId_idx" ON "EngineeringQuantityDecisionClaim"("claimId");

CREATE UNIQUE INDEX "EngineeringCalculation_companyId_takeoffScopeId_subjectMatchKey_ruleId_inputDigest_key" ON "EngineeringCalculation"("companyId", "takeoffScopeId", "subjectMatchKey", "ruleId", "inputDigest");
CREATE INDEX "EngineeringCalculation_companyId_takeoffScopeId_blocked_idx" ON "EngineeringCalculation"("companyId", "takeoffScopeId", "blocked");

CREATE UNIQUE INDEX "EngineeringCalculationInput_calculationId_inputName_key" ON "EngineeringCalculationInput"("calculationId", "inputName");
CREATE INDEX "EngineeringCalculationInput_companyId_calculationId_idx" ON "EngineeringCalculationInput"("companyId", "calculationId");

CREATE UNIQUE INDEX "EngineeringAdjustment_companyId_takeoffScopeId_subjectMatchKey_adjustmentType_ruleVersion_key" ON "EngineeringAdjustment"("companyId", "takeoffScopeId", "subjectMatchKey", "adjustmentType", "ruleVersion");
CREATE INDEX "EngineeringAdjustment_companyId_takeoffScopeId_blocked_idx" ON "EngineeringAdjustment"("companyId", "takeoffScopeId", "blocked");
CREATE INDEX "EngineeringAdjustment_baseDecisionId_idx" ON "EngineeringAdjustment"("baseDecisionId");

CREATE UNIQUE INDEX "EngineeringBomVersion_companyId_takeoffScopeId_versionNumber_key" ON "EngineeringBomVersion"("companyId", "takeoffScopeId", "versionNumber");
CREATE INDEX "EngineeringBomVersion_companyId_takeoffScopeId_state_idx" ON "EngineeringBomVersion"("companyId", "takeoffScopeId", "state");
CREATE INDEX "EngineeringBomVersion_companyId_completeness_idx" ON "EngineeringBomVersion"("companyId", "completeness");

CREATE UNIQUE INDEX "EngineeringBomVersionDecision_bomVersionId_decisionId_key" ON "EngineeringBomVersionDecision"("bomVersionId", "decisionId");
CREATE INDEX "EngineeringBomVersionDecision_decisionId_idx" ON "EngineeringBomVersionDecision"("decisionId");

CREATE UNIQUE INDEX "EngineeringBomRow_bomVersionId_rowKey_key" ON "EngineeringBomRow"("bomVersionId", "rowKey");
CREATE INDEX "EngineeringBomRow_companyId_bomVersionId_readiness_idx" ON "EngineeringBomRow"("companyId", "bomVersionId", "readiness");
CREATE INDEX "EngineeringBomRow_quantityDecisionId_idx" ON "EngineeringBomRow"("quantityDecisionId");
CREATE INDEX "EngineeringBomRow_companyId_requirementKind_idx" ON "EngineeringBomRow"("companyId", "requirementKind");

CREATE INDEX "EngineeringBomRowConstraint_companyId_bomRowId_idx" ON "EngineeringBomRowConstraint"("companyId", "bomRowId");
CREATE INDEX "EngineeringBomRowConstraint_bomRowId_kind_idx" ON "EngineeringBomRowConstraint"("bomRowId", "kind");

CREATE UNIQUE INDEX "EngineeringBomRowAdjustment_bomRowId_adjustmentId_key" ON "EngineeringBomRowAdjustment"("bomRowId", "adjustmentId");
CREATE INDEX "EngineeringBomRowAdjustment_adjustmentId_idx" ON "EngineeringBomRowAdjustment"("adjustmentId");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "EngineeringTakeoffScope" ADD CONSTRAINT "EngineeringTakeoffScope_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringTakeoffScope" ADD CONSTRAINT "EngineeringTakeoffScope_supersedesScopeId_fkey" FOREIGN KEY ("supersedesScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringCountingRule" ADD CONSTRAINT "EngineeringCountingRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringCountingRule" ADD CONSTRAINT "EngineeringCountingRule_takeoffScopeId_fkey" FOREIGN KEY ("takeoffScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringOccurrenceLedgerEntry" ADD CONSTRAINT "EngineeringOccurrenceLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringOccurrenceLedgerEntry" ADD CONSTRAINT "EngineeringOccurrenceLedgerEntry_takeoffScopeId_fkey" FOREIGN KEY ("takeoffScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringOccurrenceLedgerEntry" ADD CONSTRAINT "EngineeringOccurrenceLedgerEntry_countingRuleId_fkey" FOREIGN KEY ("countingRuleId") REFERENCES "EngineeringCountingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringOccurrenceLedgerEntry" ADD CONSTRAINT "EngineeringOccurrenceLedgerEntry_evidenceClaimId_fkey" FOREIGN KEY ("evidenceClaimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringQuantityCandidate" ADD CONSTRAINT "EngineeringQuantityCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityCandidate" ADD CONSTRAINT "EngineeringQuantityCandidate_takeoffScopeId_fkey" FOREIGN KEY ("takeoffScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringQuantityCandidateSource" ADD CONSTRAINT "EngineeringQuantityCandidateSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityCandidateSource" ADD CONSTRAINT "EngineeringQuantityCandidateSource_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "EngineeringQuantityCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityCandidateSource" ADD CONSTRAINT "EngineeringQuantityCandidateSource_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityCandidateSource" ADD CONSTRAINT "EngineeringQuantityCandidateSource_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "EngineeringOccurrenceLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringCandidateConflict" ADD CONSTRAINT "EngineeringCandidateConflict_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringCandidateConflict" ADD CONSTRAINT "EngineeringCandidateConflict_leftCandidateId_fkey" FOREIGN KEY ("leftCandidateId") REFERENCES "EngineeringQuantityCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringCandidateConflict" ADD CONSTRAINT "EngineeringCandidateConflict_rightCandidateId_fkey" FOREIGN KEY ("rightCandidateId") REFERENCES "EngineeringQuantityCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringQuantityDecision" ADD CONSTRAINT "EngineeringQuantityDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecision" ADD CONSTRAINT "EngineeringQuantityDecision_takeoffScopeId_fkey" FOREIGN KEY ("takeoffScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecision" ADD CONSTRAINT "EngineeringQuantityDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecision" ADD CONSTRAINT "EngineeringQuantityDecision_supersedesDecisionId_fkey" FOREIGN KEY ("supersedesDecisionId") REFERENCES "EngineeringQuantityDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringQuantityDecisionSource" ADD CONSTRAINT "EngineeringQuantityDecisionSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecisionSource" ADD CONSTRAINT "EngineeringQuantityDecisionSource_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EngineeringQuantityDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecisionSource" ADD CONSTRAINT "EngineeringQuantityDecisionSource_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "EngineeringQuantityCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecisionSource" ADD CONSTRAINT "EngineeringQuantityDecisionSource_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "EngineeringCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringQuantityDecisionClaim" ADD CONSTRAINT "EngineeringQuantityDecisionClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecisionClaim" ADD CONSTRAINT "EngineeringQuantityDecisionClaim_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EngineeringQuantityDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringQuantityDecisionClaim" ADD CONSTRAINT "EngineeringQuantityDecisionClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringCalculation" ADD CONSTRAINT "EngineeringCalculation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringCalculation" ADD CONSTRAINT "EngineeringCalculation_takeoffScopeId_fkey" FOREIGN KEY ("takeoffScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringCalculationInput" ADD CONSTRAINT "EngineeringCalculationInput_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringCalculationInput" ADD CONSTRAINT "EngineeringCalculationInput_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "EngineeringCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringCalculationInput" ADD CONSTRAINT "EngineeringCalculationInput_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "EngineeringQuantityCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringAdjustment" ADD CONSTRAINT "EngineeringAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringAdjustment" ADD CONSTRAINT "EngineeringAdjustment_takeoffScopeId_fkey" FOREIGN KEY ("takeoffScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringAdjustment" ADD CONSTRAINT "EngineeringAdjustment_baseDecisionId_fkey" FOREIGN KEY ("baseDecisionId") REFERENCES "EngineeringQuantityDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringAdjustment" ADD CONSTRAINT "EngineeringAdjustment_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringBomVersion" ADD CONSTRAINT "EngineeringBomVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomVersion" ADD CONSTRAINT "EngineeringBomVersion_takeoffScopeId_fkey" FOREIGN KEY ("takeoffScopeId") REFERENCES "EngineeringTakeoffScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomVersion" ADD CONSTRAINT "EngineeringBomVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomVersion" ADD CONSTRAINT "EngineeringBomVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomVersion" ADD CONSTRAINT "EngineeringBomVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "EngineeringBomVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EngineeringBomVersionDecision" ADD CONSTRAINT "EngineeringBomVersionDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomVersionDecision" ADD CONSTRAINT "EngineeringBomVersionDecision_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "EngineeringBomVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomVersionDecision" ADD CONSTRAINT "EngineeringBomVersionDecision_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "EngineeringQuantityDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringBomRow" ADD CONSTRAINT "EngineeringBomRow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomRow" ADD CONSTRAINT "EngineeringBomRow_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "EngineeringBomVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomRow" ADD CONSTRAINT "EngineeringBomRow_quantityDecisionId_fkey" FOREIGN KEY ("quantityDecisionId") REFERENCES "EngineeringQuantityDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EngineeringBomRowConstraint" ADD CONSTRAINT "EngineeringBomRowConstraint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomRowConstraint" ADD CONSTRAINT "EngineeringBomRowConstraint_bomRowId_fkey" FOREIGN KEY ("bomRowId") REFERENCES "EngineeringBomRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringBomRowAdjustment" ADD CONSTRAINT "EngineeringBomRowAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomRowAdjustment" ADD CONSTRAINT "EngineeringBomRowAdjustment_bomRowId_fkey" FOREIGN KEY ("bomRowId") REFERENCES "EngineeringBomRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngineeringBomRowAdjustment" ADD CONSTRAINT "EngineeringBomRowAdjustment_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "EngineeringAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Additive repair of a pre-existing Phase 2A-10 schema/migration drift
-- ---------------------------------------------------------------------------
--
-- The accepted Phase 2A-10 migration (20260915000000_...) created the
-- "SubjectCluster"."comparisonRunId" COLUMN but never created the foreign-key
-- CONSTRAINT that the Prisma datamodel declares. Because the column exists and
-- is nullable, nothing failed at the time; the drift was invisible until the
-- datamodel could be validated.
--
-- The two accepted 2A-10 migrations are frozen history and are deliberately NOT
-- edited. This Phase 2A-11 migration repairs the omission ADDITIVELY instead, so
-- migration history and the datamodel agree.
--
-- This statement is idempotent in effect and safe on an already-correct
-- database: it is guarded so it only adds the constraint when it is absent.
-- ON DELETE SET NULL matches the datamodel's nullable relation exactly
-- ("comparisonRun ComparisonRun? @relation(fields: [comparisonRunId], references: [id], onDelete: SetNull)").
--
-- No data is read, moved, rewritten, or deleted by this section.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SubjectCluster'
      AND column_name = 'comparisonRunId'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SubjectCluster_comparisonRunId_fkey'
  ) THEN
    ALTER TABLE "SubjectCluster"
      ADD CONSTRAINT "SubjectCluster_comparisonRunId_fkey"
      FOREIGN KEY ("comparisonRunId") REFERENCES "ComparisonRun"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Additive hardening: required-subject coverage + composite tenant keys
-- ---------------------------------------------------------------------------
--
-- These three additions harden the SAME unaccepted Phase 2A-11 migration (this
-- folder is not yet in migration history), so they live here rather than in a
-- separate migration. Nothing in this section edits the frozen, accepted 2A-10
-- migrations.
--
-- 1. EngineeringBomVersion.unresolvedRequiredSubjectCount — the count of governed
--    required subjects a version did NOT resolve into a row. Non-zero means an
--    approved subset is present and the BOM is deliberately not whole, so
--    "no created rows" can never masquerade as "nothing required".
-- 2. EngineeringBomRequiredSubject — the persisted coverage manifest that keeps
--    every required subject visible with its resolution, so an omission is
--    recorded rather than silently dropped.
-- 3. Composite tenant keys (companyId, id) on EngineeringBomVersion and
--    EngineeringBomRow, so Phase 2A-12 can reference engineering parents with
--    company agreement expressible by the schema rather than by application
--    discipline alone.
--
-- No existing column, constraint, or index is removed or weakened. No data is
-- read, moved, rewritten, or deleted. The ADD COLUMN carries a NOT NULL DEFAULT
-- that is correct for both an empty and an existing table: every existing
-- version has, by definition, not yet recorded coverage, so 0 is the truthful
-- value until coverage is (re)derived.

ALTER TABLE "EngineeringBomVersion"
  ADD COLUMN "unresolvedRequiredSubjectCount" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "EngineeringBomSubjectResolution" AS ENUM ('CARRIED_BY_ROW', 'NO_DECISION', 'DECISION_RETIRED', 'CANDIDATE_WITHOUT_DECISION', 'UNRESOLVED_CANDIDATE');

CREATE TABLE "EngineeringBomRequiredSubject" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bomVersionId" TEXT NOT NULL,
  "subjectMatchKey" TEXT NOT NULL,
  "subjectKeyNamespace" TEXT NOT NULL,
  "subjectLabel" TEXT,
  "requirementKind" "EngineeringRequirementKind" NOT NULL,
  "resolution" "EngineeringBomSubjectResolution" NOT NULL,
  "resolvedByDecisionId" TEXT,
  "bomRowId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringBomRequiredSubject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EngineeringBomRequiredSubject_bomVersionId_subjectMatchKey_key" ON "EngineeringBomRequiredSubject"("bomVersionId", "subjectMatchKey");

CREATE INDEX "EngineeringBomRequiredSubject_companyId_bomVersionId_resolution_idx" ON "EngineeringBomRequiredSubject"("companyId", "bomVersionId", "resolution");

ALTER TABLE "EngineeringBomRequiredSubject" ADD CONSTRAINT "EngineeringBomRequiredSubject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EngineeringBomRequiredSubject" ADD CONSTRAINT "EngineeringBomRequiredSubject_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "EngineeringBomVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "EngineeringBomVersion_companyId_id_key" ON "EngineeringBomVersion"("companyId", "id");

CREATE UNIQUE INDEX "EngineeringBomRow_companyId_id_key" ON "EngineeringBomRow"("companyId", "id");

-- ---------------------------------------------------------------------------
-- Additive repair: implicit many-to-many join table (_CandidateCalculation)
-- ---------------------------------------------------------------------------
--
-- The datamodel declares an implicit many-to-many relation between
-- EngineeringCalculation.candidates and EngineeringQuantityCandidate
-- .sourceCalculations (@relation("CandidateCalculation")). Prisma materializes
-- an implicit M2M as a join table named after the relation, with columns "A"
-- (the lexicographically first model argument) and "B" (the second), plus a
-- composite primary key over (A, B) and an index on B.
--
-- The table was omitted from the original body of this same, still-unaccepted
-- migration. Unit suites did not catch it because they run against the in-memory
-- store; the PGlite validator did not catch it because it checks that the
-- migration SQL applies, not that it matches the datamodel. A real
-- datamodel-vs-migrated-database comparison did.
--
-- The repair is additive and lives here because this migration folder is not
-- yet in migration history. No accepted Phase 2A-10 migration is touched.
--
-- Column order follows Prisma's own generated DDL (verified against
-- `prisma migrate diff --from-empty --to-schema`): "A" references
-- EngineeringCalculation, "B" references EngineeringQuantityCandidate. Both
-- sides cascade, matching the datamodel's optional relation semantics.

CREATE TABLE "_CandidateCalculation" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_CandidateCalculation_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_CandidateCalculation_B_index" ON "_CandidateCalculation"("B");

ALTER TABLE "_CandidateCalculation" ADD CONSTRAINT "_CandidateCalculation_A_fkey" FOREIGN KEY ("A") REFERENCES "EngineeringCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_CandidateCalculation" ADD CONSTRAINT "_CandidateCalculation_B_fkey" FOREIGN KEY ("B") REFERENCES "EngineeringQuantityCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
