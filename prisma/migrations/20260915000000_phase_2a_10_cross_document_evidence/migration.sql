-- Phase 2A-10: Cross-Document Evidence + Consistency Engine.
--
-- ADDITIVE ONLY. No column, type, index, constraint, or row of any earlier
-- migration is altered, dropped, or backfilled. Nothing here creates a
-- Requirement, DrawingTakeoffLine, BOM line, quotation line, product selection,
-- supplier record, procurement requirement, RFQ, offer, award, or PO.
--
-- Design notes that are load-bearing, not cosmetic:
-- - `NormalizedEvidenceClaim.id` IS the deterministic claim id produced by the
--   claim builder, so re-materializing unchanged bytes can only collide with
--   itself. Claims are immutable: the engine never updates a value in place.
-- - `DocumentIdentity.observedFamilyKey` is indexed NON-UNIQUE on purpose. An
--   evidence-generated family key must never force two uncertain documents into
--   one identity. Ambiguity is preserved in the database. Uniqueness applies
--   only AFTER governance confirms an identity, which is the partial unique
--   index on ("companyId","confirmedIdentityKey") created at the end of this
--   file (Prisma's schema language cannot express a partial unique index, so it
--   is created here deliberately and is the only index not declared in
--   schema.prisma).
-- - Core governance memberships are relational join tables with foreign keys —
--   ActiveRevisionDecisionSelection, ActiveRevisionDecisionEvidenceClaim,
--   DocumentRelationEvidenceClaim, DocumentIdentityEvidence, SubjectClusterMember,
--   and FindingParticipant — never `String[]` pointers.
-- - Json is used only for bounded snapshots that need no FK integrity:
--   ComparisonScope.policyBounds, ComparisonRun.materializerVersions and
--   artifactStates, and CrossDocumentFinding.evidenceSignature.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "CrossDocumentClaimPredicate" AS ENUM ('STATED_QUANTITY', 'UNIT_DECLARATION', 'MANUFACTURER', 'BRAND', 'MODEL_REFERENCE', 'CLASSIFICATION_CODE', 'TYPE_NAME', 'EQUIPMENT_TAG', 'IDENTITY_TAG', 'RATING', 'MATERIAL', 'LOCATION', 'SYSTEM_ASSIGNMENT', 'REVISION_LABEL', 'ITEM_NUMBER', 'SECTION_OR_DIVISION', 'DOCUMENT_IDENTITY', 'PROPERTY_VALUE', 'DESCRIPTION_TEXT');
CREATE TYPE "CrossDocumentReadingChannel" AS ENUM ('PDF_NATIVE_TEXT', 'PDF_OCR_TEXT', 'IMAGE_VISION', 'DRAWING_VISION', 'DRAWING_STRUCTURED', 'WORKBOOK_STRUCTURED', 'DXF_STRUCTURED', 'IFC_MODEL');
CREATE TYPE "CrossDocumentQuantityOrigin" AS ENUM ('STATED', 'DECLARED_MODEL');
CREATE TYPE "CrossDocumentUnitDimension" AS ENUM ('COUNT', 'LENGTH', 'AREA', 'VOLUME', 'MASS', 'TIME', 'POWER', 'TEMPERATURE', 'PRESSURE', 'FLOW', 'OTHER');
CREATE TYPE "CrossDocumentCoverage" AS ENUM ('COMPLETE', 'PARTIAL');
CREATE TYPE "CrossDocumentLineageRole" AS ENUM ('STANDALONE', 'DERIVED_INSPECTED', 'ORIGINAL_PROPRIETARY');
CREATE TYPE "CrossDocumentRevisionContext" AS ENUM ('UNDETERMINED', 'OBSERVED', 'SUPERSEDED', 'ADDENDUM');
CREATE TYPE "CrossDocumentSubjectNamespace" AS ENUM ('GLOBAL_ID', 'EQUIPMENT_TAG', 'MANUFACTURER_MODEL', 'CLASSIFICATION_CODE', 'TYPE_NAME', 'ITEM_NUMBER', 'DRAWING_SHEET', 'SECTION_DIVISION', 'DOCUMENT_IDENTITY', 'TEXT_LABEL', 'ARTIFACT_LOCATOR');
CREATE TYPE "CrossDocumentSubjectKeyBasis" AS ENUM ('SOURCE_IDENTIFIER', 'SOURCE_LABEL', 'SOURCE_PROPERTY', 'ENGINE_DERIVED_TEXT_KEY');
CREATE TYPE "CrossDocumentFindingKind" AS ENUM ('STATED_QUANTITY_MISMATCH', 'MODEL_REFERENCE_MISMATCH', 'MANUFACTURER_MISMATCH', 'BRAND_MISMATCH', 'RATING_MISMATCH', 'UNIT_MISMATCH', 'UNIT_NOT_COMPARABLE', 'MATERIAL_MISMATCH', 'LOCATION_MISMATCH', 'SYSTEM_ASSIGNMENT_MISMATCH', 'IDENTITY_TAG_MISMATCH', 'TYPE_MISMATCH', 'CLASSIFICATION_MISMATCH', 'REVISION_MISMATCH', 'REVISION_SET_BLOCKED', 'INCLUSION_EXCLUSION_MISMATCH', 'PROPERTY_MISSING_IN_SOURCE', 'SCHEDULE_COUNTERPART_MISSING', 'AMBIGUOUS_SUBJECT_MATCH', 'SUBJECT_SUGGESTION_ONLY', 'EVIDENCE_COVERAGE_INCOMPLETE', 'EVIDENCE_UNAVAILABLE_FOR_COMPARISON', 'DERIVATION_FIDELITY_REVIEW', 'DESCRIPTION_MISMATCH');
CREATE TYPE "CrossDocumentSeverity" AS ENUM ('INFO', 'REVIEW', 'ATTENTION');
CREATE TYPE "CrossDocumentReviewState" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'NEEDS_INFORMATION', 'RESOLVED', 'DISMISSED');
CREATE TYPE "CrossDocumentReviewEventKind" AS ENUM ('TRANSITIONED', 'REOPENED', 'COMMENTED');
CREATE TYPE "CrossDocumentStaleReason" AS ENUM ('NOT_REPRODUCED', 'ARTIFACT_BYTES_CHANGED', 'SCOPE_CHANGED', 'ENGINE_VERSION_CHANGED', 'CLAIMS_SUPERSEDED');
CREATE TYPE "CrossDocumentIdentityKind" AS ENUM ('DRAWING', 'SPECIFICATION_SECTION', 'BOQ_OR_SCHEDULE', 'BIM_MODEL', 'TENDER_PACKAGE', 'SUBMITTAL', 'UNRESOLVED');
CREATE TYPE "CrossDocumentIdentityBasis" AS ENUM ('EVIDENCE_SUGGESTED', 'GOVERNANCE_CONFIRMED', 'UNRESOLVED');
CREATE TYPE "CrossDocumentRole" AS ENUM ('SPECIFICATION', 'BOQ', 'DRAWING', 'SCHEDULE', 'BIM_MODEL', 'TENDER', 'ADDENDUM', 'SUBMITTAL', 'UNKNOWN');
CREATE TYPE "CrossDocumentRoleSource" AS ENUM ('USER_DECLARED', 'OBSERVED_FROM_CONTENT');
CREATE TYPE "CrossDocumentMembershipBasis" AS ENUM ('IDENTITY_SUGGESTION', 'GOVERNANCE_CONFIRMED');
CREATE TYPE "CrossDocumentRelationKind" AS ENUM ('REVISION_OF', 'SUPERSEDES', 'ADDENDUM_TO', 'REFERENCES', 'SAME_FAMILY');
CREATE TYPE "CrossDocumentRelationBasis" AS ENUM ('USER_DECLARED', 'OBSERVED_EVIDENCE');
CREATE TYPE "CrossDocumentActiveRevisionStatus" AS ENUM ('UNDECIDED', 'ACTIVE_REVISION_SELECTED', 'BLOCKED_INCOMPATIBLE_ACTIVES');
CREATE TYPE "CrossDocumentRevisionPolicy" AS ENUM ('ACTIVE_ONLY', 'INCLUDE_SUPERSEDED', 'SPECIFIC_REVISIONS');
CREATE TYPE "CrossDocumentRunStatus" AS ENUM ('COMPLETED', 'BLOCKED', 'FAILED');
CREATE TYPE "CrossDocumentMatchTier" AS ENUM ('T0_EXACT_GLOBAL_ID', 'T1_EXACT_TAG', 'T2_EXACT_MANUFACTURER_MODEL', 'T2_EXACT_CLASSIFICATION', 'T2_EXACT_TYPE_NAME', 'T3_EXACT_ITEM_NUMBER', 'T4_LOCATION_SYSTEM_CORROBORATION', 'T5_TOKEN_SIMILARITY_SUGGESTION');
CREATE TYPE "CrossDocumentMatchClass" AS ENUM ('SAME_SUBJECT', 'AMBIGUOUS', 'SUGGESTION_ONLY', 'CONFLICT', 'NO_MATCH');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE "NormalizedEvidenceClaim" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "materializationId" TEXT NOT NULL,
  "materializedByRunId" TEXT,
  "sourceArtifactId" TEXT NOT NULL,
  "artifactSha256" TEXT NOT NULL,
  "sourceKind" "SourceArtifactKind" NOT NULL,
  "readingChannel" "CrossDocumentReadingChannel" NOT NULL,
  "subjectKeyNamespace" "CrossDocumentSubjectNamespace" NOT NULL,
  "subjectKeyValue" TEXT NOT NULL,
  "subjectMatchKey" TEXT NOT NULL,
  "subjectKeyBasis" "CrossDocumentSubjectKeyBasis" NOT NULL,
  "subjectLabel" TEXT,
  "predicate" "CrossDocumentClaimPredicate" NOT NULL,
  "comparisonPolicy" TEXT NOT NULL,
  "valueLiteral" TEXT NOT NULL,
  "valueNumber" DECIMAL(24,9),
  "valueNumberOrigin" TEXT,
  "unitLiteral" TEXT,
  "unitDeclared" BOOLEAN NOT NULL DEFAULT false,
  "unitDimension" "CrossDocumentUnitDimension",
  "quantityOrigin" "CrossDocumentQuantityOrigin",
  "locationKind" TEXT,
  "locationValue" TEXT,
  "systemValue" TEXT,
  "sectionValue" TEXT,
  "qualifiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceCoverage" "CrossDocumentCoverage" NOT NULL DEFAULT 'COMPLETE',
  "sourceQualifiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "locator" TEXT NOT NULL,
  "humanLocator" TEXT,
  "pageNumber" INTEGER,
  "citationId" TEXT,
  "rawRecordKind" TEXT,
  "rawRecordId" TEXT,
  "reliability" TEXT NOT NULL,
  "confidence" DECIMAL(5,4),
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceDocumentFamilyKey" TEXT,
  "observedRevisionLabel" TEXT,
  "revisionContext" "CrossDocumentRevisionContext" NOT NULL DEFAULT 'UNDETERMINED',
  "derivationFamilyRootArtifactId" TEXT NOT NULL,
  "lineageRole" "CrossDocumentLineageRole" NOT NULL DEFAULT 'STANDALONE',
  "derivationId" TEXT,
  "sourceFormat" TEXT,
  "derivedFormat" TEXT,
  "derivationMethod" TEXT,
  "converterId" TEXT,
  "converterVersion" TEXT,
  "fidelityLimitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "materializerVersion" TEXT NOT NULL,
  "engineVersion" TEXT NOT NULL,
  "comparisonScope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OBSERVED_NOT_APPROVED',
  "purpose" TEXT NOT NULL DEFAULT 'CROSS_DOCUMENT_COMPARISON_ONLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NormalizedEvidenceClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrossDocumentMaterialization" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "comparisonScopeId" TEXT NOT NULL,
  "sourceArtifactId" TEXT NOT NULL,
  "artifactSha256" TEXT NOT NULL,
  "sourceKind" "SourceArtifactKind" NOT NULL,
  "materializerVersion" TEXT NOT NULL,
  "readingChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "coverage" "CrossDocumentCoverage" NOT NULL DEFAULT 'COMPLETE',
  "claimCount" INTEGER NOT NULL DEFAULT 0,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "truncationReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrossDocumentMaterialization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComparisonScope" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "projectKey" TEXT,
  "revisionPolicy" "CrossDocumentRevisionPolicy" NOT NULL DEFAULT 'ACTIVE_ONLY',
  "predicateFilters" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "roleFilters" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lineageCollapse" BOOLEAN NOT NULL DEFAULT true,
  "policyBounds" JSONB NOT NULL,
  "comparisonScopeClass" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ComparisonScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComparisonScopeArtifact" (
  "id" TEXT NOT NULL,
  "comparisonScopeId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "documentRole" "CrossDocumentRole" NOT NULL DEFAULT 'UNKNOWN',
  "documentRoleSource" "CrossDocumentRoleSource" NOT NULL DEFAULT 'OBSERVED_FROM_CONTENT',
  "roleDeclaredByUserId" TEXT,
  "activeRevisionDecisionId" TEXT,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComparisonScopeArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComparisonRun" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "comparisonScopeId" TEXT NOT NULL,
  "engineVersion" TEXT NOT NULL,
  "matcherVersion" TEXT NOT NULL,
  "projectorVersion" TEXT NOT NULL,
  "materializerVersions" JSONB NOT NULL,
  "artifactStates" JSONB NOT NULL,
  "claimCount" INTEGER NOT NULL DEFAULT 0,
  "matchCount" INTEGER NOT NULL DEFAULT 0,
  "findingCount" INTEGER NOT NULL DEFAULT 0,
  "newFindingCount" INTEGER NOT NULL DEFAULT 0,
  "reproducedFindingCount" INTEGER NOT NULL DEFAULT 0,
  "notReproducedFindingCount" INTEGER NOT NULL DEFAULT 0,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "status" "CrossDocumentRunStatus" NOT NULL DEFAULT 'COMPLETED',
  "blockReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "actorUserId" TEXT NOT NULL,
  "inputDigest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComparisonRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubjectMatch" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "comparisonScopeId" TEXT NOT NULL,
  "comparisonRunId" TEXT NOT NULL,
  "leftClaimId" TEXT NOT NULL,
  "rightClaimId" TEXT NOT NULL,
  "leftArtifactId" TEXT NOT NULL,
  "rightArtifactId" TEXT NOT NULL,
  "tier" "CrossDocumentMatchTier" NOT NULL,
  "matchClass" "CrossDocumentMatchClass" NOT NULL,
  "subjectNamespace" "CrossDocumentSubjectNamespace" NOT NULL,
  "comparedKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "corroborators" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "blockers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "score" DECIMAL(6,4),
  "ambiguous" BOOLEAN NOT NULL DEFAULT false,
  "sameDerivationFamily" BOOLEAN NOT NULL DEFAULT false,
  "reliability" TEXT NOT NULL,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "matcherVersion" TEXT NOT NULL,
  "explanationVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubjectMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubjectCluster" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "comparisonScopeId" TEXT NOT NULL,
  "comparisonRunId" TEXT,
  "subjectNamespace" "CrossDocumentSubjectNamespace" NOT NULL,
  "matchKey" TEXT NOT NULL,
  "subjectKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "strongestTier" "CrossDocumentMatchTier",
  "ambiguous" BOOLEAN NOT NULL DEFAULT false,
  "comparable" BOOLEAN NOT NULL DEFAULT false,
  "blockers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reliability" TEXT NOT NULL,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "matcherVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubjectCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubjectClusterMember" (
  "id" TEXT NOT NULL,
  "subjectClusterId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "derivationFamilyRootArtifactId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubjectClusterMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrossDocumentFinding" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "comparisonScopeId" TEXT NOT NULL,
  "comparisonRunId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "findingKind" "CrossDocumentFindingKind" NOT NULL,
  "predicate" "CrossDocumentClaimPredicate",
  "subjectClusterId" TEXT,
  "subjectKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "participantFamilies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceSignature" JSONB NOT NULL,
  "statementTemplateKey" TEXT NOT NULL,
  "severity" "CrossDocumentSeverity" NOT NULL DEFAULT 'REVIEW',
  "reproduced" BOOLEAN NOT NULL DEFAULT false,
  "stale" BOOLEAN NOT NULL DEFAULT false,
  "staleReason" "CrossDocumentStaleReason",
  "evidenceChanged" BOOLEAN NOT NULL DEFAULT false,
  "lastReproducedRunId" TEXT,
  "lastReproducedAt" TIMESTAMP(3),
  "reviewState" "CrossDocumentReviewState" NOT NULL DEFAULT 'OPEN',
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "projectorVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrossDocumentFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FindingParticipant" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "sourceArtifactId" TEXT NOT NULL,
  "derivationFamilyRootArtifactId" TEXT NOT NULL,
  "documentRole" "CrossDocumentRole" NOT NULL DEFAULT 'UNKNOWN',
  "documentIdentityId" TEXT,
  "documentRevisionMembershipId" TEXT,
  "verbatimValue" TEXT NOT NULL,
  "sourceNumericView" DECIMAL(24,9),
  "unit" TEXT,
  "unitDeclared" BOOLEAN NOT NULL DEFAULT false,
  "quantityOrigin" "CrossDocumentQuantityOrigin",
  "locator" TEXT NOT NULL,
  "humanLocator" TEXT,
  "citationId" TEXT,
  "sourceKind" "SourceArtifactKind" NOT NULL,
  "readingChannel" "CrossDocumentReadingChannel" NOT NULL,
  "reliability" TEXT NOT NULL,
  "confidence" DECIMAL(5,4),
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FindingReviewEvent" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fromState" "CrossDocumentReviewState",
  "toState" "CrossDocumentReviewState" NOT NULL,
  "kind" "CrossDocumentReviewEventKind" NOT NULL DEFAULT 'TRANSITIONED',
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "explicit" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FindingReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentIdentity" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "kind" "CrossDocumentIdentityKind" NOT NULL DEFAULT 'UNRESOLVED',
  "label" TEXT NOT NULL,
  "observedFamilyKey" TEXT NOT NULL,
  "confirmedIdentityKey" TEXT,
  "identityBasis" "CrossDocumentIdentityBasis" NOT NULL DEFAULT 'EVIDENCE_SUGGESTED',
  "ambiguous" BOOLEAN NOT NULL DEFAULT false,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resolverVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentIdentityEvidence" (
  "id" TEXT NOT NULL,
  "documentIdentityId" TEXT NOT NULL,
  "evidenceKind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sourceArtifactId" TEXT NOT NULL,
  "claimId" TEXT,
  "locator" TEXT,
  "reliability" TEXT NOT NULL,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentIdentityEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentRevisionMembership" (
  "membershipId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentIdentityId" TEXT NOT NULL,
  "sourceArtifactId" TEXT NOT NULL,
  "artifactSha256" TEXT NOT NULL,
  "observedRevisionLabel" TEXT,
  "revisionClaimId" TEXT,
  "membershipBasis" "CrossDocumentMembershipBasis" NOT NULL DEFAULT 'IDENTITY_SUGGESTION',
  "documentRole" "CrossDocumentRole" NOT NULL DEFAULT 'UNKNOWN',
  "documentRoleSource" "CrossDocumentRoleSource" NOT NULL DEFAULT 'OBSERVED_FROM_CONTENT',
  "derivationFamilyRootArtifactId" TEXT NOT NULL,
  "lineageRole" "CrossDocumentLineageRole" NOT NULL DEFAULT 'STANDALONE',
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRevisionMembership_pkey" PRIMARY KEY ("membershipId")
);

CREATE TABLE "DocumentRelation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentIdentityId" TEXT NOT NULL,
  "relatedDocumentIdentityId" TEXT NOT NULL,
  "relationKind" "CrossDocumentRelationKind" NOT NULL,
  "relationBasis" "CrossDocumentRelationBasis" NOT NULL DEFAULT 'USER_DECLARED',
  "declaredByUserId" TEXT,
  "reason" TEXT NOT NULL,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRelation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentRelationEvidenceClaim" (
  "id" TEXT NOT NULL,
  "documentRelationId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRelationEvidenceClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActiveRevisionDecision" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "documentIdentityId" TEXT NOT NULL,
  "comparisonScopeId" TEXT,
  "decisionVersion" INTEGER NOT NULL,
  "status" "CrossDocumentActiveRevisionStatus" NOT NULL DEFAULT 'UNDECIDED',
  "actorUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "supersedesDecisionId" TEXT,
  "blockedReason" TEXT,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActiveRevisionDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActiveRevisionDecisionSelection" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActiveRevisionDecisionSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActiveRevisionDecisionEvidenceClaim" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActiveRevisionDecisionEvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "NormalizedEvidenceClaim_companyId_sourceArtifactId_idx" ON "NormalizedEvidenceClaim"("companyId", "sourceArtifactId");
CREATE INDEX "NormalizedEvidenceClaim_companyId_predicate_idx" ON "NormalizedEvidenceClaim"("companyId", "predicate");
CREATE INDEX "NormalizedEvidenceClaim_companyId_subjectMatchKey_idx" ON "NormalizedEvidenceClaim"("companyId", "subjectMatchKey");
CREATE INDEX "NormalizedEvidenceClaim_companyId_derivationFamilyRootArtifactId_idx" ON "NormalizedEvidenceClaim"("companyId", "derivationFamilyRootArtifactId");
CREATE INDEX "NormalizedEvidenceClaim_companyId_materializationId_idx" ON "NormalizedEvidenceClaim"("companyId", "materializationId");

CREATE UNIQUE INDEX "CrossDocumentMaterialization_companyId_sourceArtifactId_artifactSha256_materializerVersion_key" ON "CrossDocumentMaterialization"("companyId", "sourceArtifactId", "artifactSha256", "materializerVersion");
CREATE INDEX "CrossDocumentMaterialization_companyId_comparisonScopeId_idx" ON "CrossDocumentMaterialization"("companyId", "comparisonScopeId");

CREATE INDEX "ComparisonScope_companyId_createdAt_idx" ON "ComparisonScope"("companyId", "createdAt");

CREATE UNIQUE INDEX "ComparisonScopeArtifact_companyId_comparisonScopeId_artifactId_key" ON "ComparisonScopeArtifact"("companyId", "comparisonScopeId", "artifactId");
CREATE INDEX "ComparisonScopeArtifact_companyId_artifactId_idx" ON "ComparisonScopeArtifact"("companyId", "artifactId");

CREATE INDEX "ComparisonRun_companyId_comparisonScopeId_startedAt_idx" ON "ComparisonRun"("companyId", "comparisonScopeId", "startedAt");
CREATE INDEX "ComparisonRun_companyId_status_idx" ON "ComparisonRun"("companyId", "status");

CREATE UNIQUE INDEX "SubjectMatch_companyId_comparisonScopeId_leftClaimId_rightClaimId_tier_key" ON "SubjectMatch"("companyId", "comparisonScopeId", "leftClaimId", "rightClaimId", "tier");
CREATE INDEX "SubjectMatch_companyId_comparisonScopeId_idx" ON "SubjectMatch"("companyId", "comparisonScopeId");

CREATE UNIQUE INDEX "SubjectCluster_companyId_comparisonScopeId_subjectNamespace_matchKey_key" ON "SubjectCluster"("companyId", "comparisonScopeId", "subjectNamespace", "matchKey");
CREATE INDEX "SubjectCluster_companyId_comparisonScopeId_idx" ON "SubjectCluster"("companyId", "comparisonScopeId");

CREATE UNIQUE INDEX "SubjectClusterMember_subjectClusterId_claimId_key" ON "SubjectClusterMember"("subjectClusterId", "claimId");
CREATE INDEX "SubjectClusterMember_claimId_idx" ON "SubjectClusterMember"("claimId");

CREATE UNIQUE INDEX "CrossDocumentFinding_companyId_comparisonScopeId_fingerprint_key" ON "CrossDocumentFinding"("companyId", "comparisonScopeId", "fingerprint");
CREATE INDEX "CrossDocumentFinding_companyId_findingKind_idx" ON "CrossDocumentFinding"("companyId", "findingKind");
CREATE INDEX "CrossDocumentFinding_companyId_reviewState_idx" ON "CrossDocumentFinding"("companyId", "reviewState");
CREATE INDEX "CrossDocumentFinding_companyId_stale_idx" ON "CrossDocumentFinding"("companyId", "stale");
CREATE INDEX "CrossDocumentFinding_companyId_subjectClusterId_idx" ON "CrossDocumentFinding"("companyId", "subjectClusterId");

CREATE UNIQUE INDEX "FindingParticipant_findingId_claimId_key" ON "FindingParticipant"("findingId", "claimId");
CREATE INDEX "FindingParticipant_findingId_ordinal_idx" ON "FindingParticipant"("findingId", "ordinal");
CREATE INDEX "FindingParticipant_claimId_idx" ON "FindingParticipant"("claimId");

CREATE INDEX "FindingReviewEvent_findingId_createdAt_idx" ON "FindingReviewEvent"("findingId", "createdAt");
CREATE INDEX "FindingReviewEvent_companyId_findingId_idx" ON "FindingReviewEvent"("companyId", "findingId");

-- Deliberately NON-UNIQUE: an evidence-generated family key must never force two
-- uncertain documents into one identity.
CREATE INDEX "DocumentIdentity_companyId_observedFamilyKey_idx" ON "DocumentIdentity"("companyId", "observedFamilyKey");
CREATE INDEX "DocumentIdentity_companyId_identityBasis_idx" ON "DocumentIdentity"("companyId", "identityBasis");

CREATE INDEX "DocumentIdentityEvidence_documentIdentityId_idx" ON "DocumentIdentityEvidence"("documentIdentityId");
CREATE INDEX "DocumentIdentityEvidence_sourceArtifactId_idx" ON "DocumentIdentityEvidence"("sourceArtifactId");

CREATE UNIQUE INDEX "DocumentRevisionMembership_companyId_documentIdentityId_sourceArtifactId_observedRevisionLabel_key" ON "DocumentRevisionMembership"("companyId", "documentIdentityId", "sourceArtifactId", "observedRevisionLabel");
CREATE INDEX "DocumentRevisionMembership_companyId_sourceArtifactId_idx" ON "DocumentRevisionMembership"("companyId", "sourceArtifactId");
CREATE INDEX "DocumentRevisionMembership_companyId_documentIdentityId_idx" ON "DocumentRevisionMembership"("companyId", "documentIdentityId");

CREATE UNIQUE INDEX "DocumentRelation_companyId_documentIdentityId_relatedDocumentIdentityId_relationKind_key" ON "DocumentRelation"("companyId", "documentIdentityId", "relatedDocumentIdentityId", "relationKind");
CREATE INDEX "DocumentRelation_companyId_documentIdentityId_idx" ON "DocumentRelation"("companyId", "documentIdentityId");

CREATE UNIQUE INDEX "DocumentRelationEvidenceClaim_documentRelationId_claimId_key" ON "DocumentRelationEvidenceClaim"("documentRelationId", "claimId");
CREATE INDEX "DocumentRelationEvidenceClaim_claimId_idx" ON "DocumentRelationEvidenceClaim"("claimId");

CREATE UNIQUE INDEX "ActiveRevisionDecision_companyId_documentIdentityId_decisionVersion_key" ON "ActiveRevisionDecision"("companyId", "documentIdentityId", "decisionVersion");
CREATE INDEX "ActiveRevisionDecision_companyId_documentIdentityId_decidedAt_idx" ON "ActiveRevisionDecision"("companyId", "documentIdentityId", "decidedAt");

CREATE UNIQUE INDEX "ActiveRevisionDecisionSelection_decisionId_membershipId_key" ON "ActiveRevisionDecisionSelection"("decisionId", "membershipId");
CREATE INDEX "ActiveRevisionDecisionSelection_membershipId_idx" ON "ActiveRevisionDecisionSelection"("membershipId");

CREATE UNIQUE INDEX "ActiveRevisionDecisionEvidenceClaim_decisionId_claimId_key" ON "ActiveRevisionDecisionEvidenceClaim"("decisionId", "claimId");
CREATE INDEX "ActiveRevisionDecisionEvidenceClaim_claimId_idx" ON "ActiveRevisionDecisionEvidenceClaim"("claimId");

-- Uniqueness applies ONLY after governance confirms an identity. Until then the
-- key is NULL for every row, and Postgres permits any number of NULLs.
CREATE UNIQUE INDEX "DocumentIdentity_companyId_confirmedIdentityKey_partial_key" ON "DocumentIdentity"("companyId", "confirmedIdentityKey") WHERE "confirmedIdentityKey" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "NormalizedEvidenceClaim" ADD CONSTRAINT "NormalizedEvidenceClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NormalizedEvidenceClaim" ADD CONSTRAINT "NormalizedEvidenceClaim_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NormalizedEvidenceClaim" ADD CONSTRAINT "NormalizedEvidenceClaim_materializationId_fkey" FOREIGN KEY ("materializationId") REFERENCES "CrossDocumentMaterialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrossDocumentMaterialization" ADD CONSTRAINT "CrossDocumentMaterialization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossDocumentMaterialization" ADD CONSTRAINT "CrossDocumentMaterialization_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossDocumentMaterialization" ADD CONSTRAINT "CrossDocumentMaterialization_comparisonScopeId_fkey" FOREIGN KEY ("comparisonScopeId") REFERENCES "ComparisonScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComparisonScope" ADD CONSTRAINT "ComparisonScope_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComparisonScopeArtifact" ADD CONSTRAINT "ComparisonScopeArtifact_comparisonScopeId_fkey" FOREIGN KEY ("comparisonScopeId") REFERENCES "ComparisonScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComparisonScopeArtifact" ADD CONSTRAINT "ComparisonScopeArtifact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComparisonScopeArtifact" ADD CONSTRAINT "ComparisonScopeArtifact_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "SourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComparisonScopeArtifact" ADD CONSTRAINT "ComparisonScopeArtifact_activeRevisionDecisionId_fkey" FOREIGN KEY ("activeRevisionDecisionId") REFERENCES "ActiveRevisionDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ComparisonRun" ADD CONSTRAINT "ComparisonRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComparisonRun" ADD CONSTRAINT "ComparisonRun_comparisonScopeId_fkey" FOREIGN KEY ("comparisonScopeId") REFERENCES "ComparisonScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectMatch" ADD CONSTRAINT "SubjectMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectMatch" ADD CONSTRAINT "SubjectMatch_comparisonScopeId_fkey" FOREIGN KEY ("comparisonScopeId") REFERENCES "ComparisonScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectMatch" ADD CONSTRAINT "SubjectMatch_comparisonRunId_fkey" FOREIGN KEY ("comparisonRunId") REFERENCES "ComparisonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectMatch" ADD CONSTRAINT "SubjectMatch_leftClaimId_fkey" FOREIGN KEY ("leftClaimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectMatch" ADD CONSTRAINT "SubjectMatch_rightClaimId_fkey" FOREIGN KEY ("rightClaimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectCluster" ADD CONSTRAINT "SubjectCluster_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectCluster" ADD CONSTRAINT "SubjectCluster_comparisonScopeId_fkey" FOREIGN KEY ("comparisonScopeId") REFERENCES "ComparisonScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectClusterMember" ADD CONSTRAINT "SubjectClusterMember_subjectClusterId_fkey" FOREIGN KEY ("subjectClusterId") REFERENCES "SubjectCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectClusterMember" ADD CONSTRAINT "SubjectClusterMember_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrossDocumentFinding" ADD CONSTRAINT "CrossDocumentFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossDocumentFinding" ADD CONSTRAINT "CrossDocumentFinding_comparisonScopeId_fkey" FOREIGN KEY ("comparisonScopeId") REFERENCES "ComparisonScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossDocumentFinding" ADD CONSTRAINT "CrossDocumentFinding_comparisonRunId_fkey" FOREIGN KEY ("comparisonRunId") REFERENCES "ComparisonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossDocumentFinding" ADD CONSTRAINT "CrossDocumentFinding_subjectClusterId_fkey" FOREIGN KEY ("subjectClusterId") REFERENCES "SubjectCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FindingParticipant" ADD CONSTRAINT "FindingParticipant_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CrossDocumentFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingParticipant" ADD CONSTRAINT "FindingParticipant_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingParticipant" ADD CONSTRAINT "FindingParticipant_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingParticipant" ADD CONSTRAINT "FindingParticipant_documentIdentityId_fkey" FOREIGN KEY ("documentIdentityId") REFERENCES "DocumentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FindingParticipant" ADD CONSTRAINT "FindingParticipant_documentRevisionMembershipId_fkey" FOREIGN KEY ("documentRevisionMembershipId") REFERENCES "DocumentRevisionMembership"("membershipId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FindingReviewEvent" ADD CONSTRAINT "FindingReviewEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FindingReviewEvent" ADD CONSTRAINT "FindingReviewEvent_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CrossDocumentFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentIdentity" ADD CONSTRAINT "DocumentIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentIdentityEvidence" ADD CONSTRAINT "DocumentIdentityEvidence_documentIdentityId_fkey" FOREIGN KEY ("documentIdentityId") REFERENCES "DocumentIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentIdentityEvidence" ADD CONSTRAINT "DocumentIdentityEvidence_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentIdentityEvidence" ADD CONSTRAINT "DocumentIdentityEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentRevisionMembership" ADD CONSTRAINT "DocumentRevisionMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRevisionMembership" ADD CONSTRAINT "DocumentRevisionMembership_documentIdentityId_fkey" FOREIGN KEY ("documentIdentityId") REFERENCES "DocumentIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRevisionMembership" ADD CONSTRAINT "DocumentRevisionMembership_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "SourceArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRevisionMembership" ADD CONSTRAINT "DocumentRevisionMembership_revisionClaimId_fkey" FOREIGN KEY ("revisionClaimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentRelation" ADD CONSTRAINT "DocumentRelation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRelation" ADD CONSTRAINT "DocumentRelation_documentIdentityId_fkey" FOREIGN KEY ("documentIdentityId") REFERENCES "DocumentIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRelation" ADD CONSTRAINT "DocumentRelation_relatedDocumentIdentityId_fkey" FOREIGN KEY ("relatedDocumentIdentityId") REFERENCES "DocumentIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentRelationEvidenceClaim" ADD CONSTRAINT "DocumentRelationEvidenceClaim_documentRelationId_fkey" FOREIGN KEY ("documentRelationId") REFERENCES "DocumentRelation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRelationEvidenceClaim" ADD CONSTRAINT "DocumentRelationEvidenceClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActiveRevisionDecision" ADD CONSTRAINT "ActiveRevisionDecision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActiveRevisionDecision" ADD CONSTRAINT "ActiveRevisionDecision_documentIdentityId_fkey" FOREIGN KEY ("documentIdentityId") REFERENCES "DocumentIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActiveRevisionDecisionSelection" ADD CONSTRAINT "ActiveRevisionDecisionSelection_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ActiveRevisionDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActiveRevisionDecisionSelection" ADD CONSTRAINT "ActiveRevisionDecisionSelection_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "DocumentRevisionMembership"("membershipId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActiveRevisionDecisionEvidenceClaim" ADD CONSTRAINT "ActiveRevisionDecisionEvidenceClaim_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ActiveRevisionDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActiveRevisionDecisionEvidenceClaim" ADD CONSTRAINT "ActiveRevisionDecisionEvidenceClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "NormalizedEvidenceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
