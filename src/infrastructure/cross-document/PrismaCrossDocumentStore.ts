/**
 * Phase 2A-10: the Prisma `CrossDocumentStore`.
 *
 * Invariants this adapter enforces (and that the migration also enforces in the
 * database, so an application bug cannot silently win):
 *
 * - every read and write is company-scoped: a record from another tenant is
 *   reported as not found, never returned;
 * - claims are IMMUTABLE. `saveClaims` never updates an existing row: it counts
 *   what already exists and creates only what does not, so a historical claim
 *   can never be rewritten in place;
 * - the observed document family key is NOT unique. Two uncertain documents may
 *   share it, and the adapter never merges them. Only a
 *   governance-confirmed identity key is unique, and the adapter refuses a
 *   collision before the database has to;
 * - core memberships are relational: decision selections, decision evidence
 *   claims, relation evidence claims, identity evidence, cluster members, and
 *   finding participants are join rows, not string arrays;
 * - the engine-owned flags and the human review state are written by SEPARATE
 *   methods, so the comparison engine has no path to the review state.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CROSS_DOCUMENT_BOUNDS } from "@/src/domain/cross-document";
import type {
  ComparisonScopeArtifactRecord,
  ComparisonScopeRecord,
  ComparisonRunRecord,
  CrossDocumentStore,
  DocumentIdentityRecord,
  DocumentRelationRecord,
  FindingEvidenceObservationEntryRecord,
  FindingEvidenceObservationRecord,
  FindingEvidenceObservationView,
  MaterializationRecordFixture,
} from "@/src/application/cross-document/ports";
import type { SubjectClusterRecord, SubjectMatchRecord } from "@/src/application/cross-document/matching-types";
import type {
  ActiveRevisionDecisionRecord,
  CrossDocumentFindingRecord,
  DocumentRevisionMembership,
  EvidenceSignature,
  FindingEngineFlags,
  FindingParticipant,
  FindingReviewEvent,
  NormalizedEvidenceClaim,
  ReviewState,
} from "@/src/domain/cross-document";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

type ClaimRow = Record<string, unknown>;

export function toClaimRow(claim: NormalizedEvidenceClaim): Record<string, unknown> {
  return {
    id: claim.claimId,
    companyId: claim.companyId,
    materializationId: claim.materializationId,
    materializedByRunId: claim.materializedByRunId,
    sourceArtifactId: claim.sourceArtifactId,
    artifactSha256: claim.artifactSha256,
    sourceKind: claim.sourceKind as never,
    readingChannel: claim.readingChannel as never,
    subjectKeyNamespace: claim.subject.subjectKeyNamespace as never,
    subjectKeyValue: claim.subject.subjectKeyValue,
    subjectMatchKey: claim.subject.subjectMatchKey,
    subjectKeyBasis: claim.subject.subjectKeyBasis as never,
    subjectLabel: claim.subject.subjectLabel,
    predicate: claim.assertion.predicate as never,
    comparisonPolicy: claim.assertion.comparisonPolicy,
    valueLiteral: claim.assertion.valueLiteral,
    valueNumber: claim.assertion.valueNumber,
    valueNumberOrigin: claim.assertion.valueNumberOrigin,
    unitLiteral: claim.assertion.unitLiteral,
    unitDeclared: claim.assertion.unitDeclared,
    unitDimension: claim.assertion.unitDimension as never,
    quantityOrigin: claim.assertion.quantityOrigin as never,
    locationKind: claim.context.locationKind,
    locationValue: claim.context.locationValue,
    systemValue: claim.context.systemValue,
    sectionValue: claim.context.sectionValue,
    qualifiers: [...claim.context.qualifiers],
    sourceCoverage: claim.context.sourceCoverage as never,
    sourceQualifiers: [...claim.context.sourceQualifiers],
    locator: claim.provenance.locator,
    humanLocator: claim.provenance.humanLocator,
    pageNumber: claim.provenance.pageNumber,
    citationId: claim.provenance.citationId,
    rawRecordKind: claim.provenance.rawRecordKind,
    rawRecordId: claim.provenance.rawRecordId,
    reliability: claim.provenance.reliability,
    confidence: claim.provenance.confidence,
    limitations: [...claim.provenance.limitations],
    evidenceDocumentFamilyKey: claim.document.evidenceDocumentFamilyKey,
    observedRevisionLabel: claim.document.observedRevisionLabel,
    revisionContext: claim.document.revisionContext as never,
    derivationFamilyRootArtifactId: claim.derivation.derivationFamilyRootArtifactId,
    lineageRole: claim.derivation.lineageRole as never,
    derivationId: claim.derivation.derivationId,
    sourceFormat: claim.derivation.sourceFormat,
    derivedFormat: claim.derivation.derivedFormat,
    derivationMethod: claim.derivation.derivationMethod,
    converterId: claim.derivation.converterId,
    converterVersion: claim.derivation.converterVersion,
    fidelityLimitations: [...claim.derivation.fidelityLimitations],
    materializerVersion: claim.engine.materializerVersion,
    engineVersion: claim.engine.engineVersion,
    comparisonScope: claim.engine.comparisonScope,
    status: claim.status,
    purpose: claim.purpose,
    createdAt: new Date(claim.engine.createdAt),
  };
}

export function fromClaimRow(row: ClaimRow): NormalizedEvidenceClaim {
  const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
  return {
    claimId: String(row.id),
    companyId: String(row.companyId),
    materializationId: String(row.materializationId),
    materializedByRunId: (row.materializedByRunId as string | null) ?? null,
    sourceArtifactId: String(row.sourceArtifactId),
    artifactSha256: String(row.artifactSha256),
    sourceKind: String(row.sourceKind) as NormalizedEvidenceClaim["sourceKind"],
    readingChannel: row.readingChannel as NormalizedEvidenceClaim["readingChannel"],
    subject: {
      subjectKeyNamespace: row.subjectKeyNamespace as NormalizedEvidenceClaim["subject"]["subjectKeyNamespace"],
      subjectKeyValue: String(row.subjectKeyValue),
      subjectMatchKey: String(row.subjectMatchKey),
      subjectKeyBasis: row.subjectKeyBasis as NormalizedEvidenceClaim["subject"]["subjectKeyBasis"],
      subjectLabel: (row.subjectLabel as string | null) ?? null,
    },
    assertion: {
      predicate: row.predicate as NormalizedEvidenceClaim["assertion"]["predicate"],
      comparisonPolicy: String(row.comparisonPolicy),
      valueLiteral: String(row.valueLiteral),
      valueNumber: numberOrNull(row.valueNumber),
      valueNumberOrigin: (row.valueNumberOrigin as NormalizedEvidenceClaim["assertion"]["valueNumberOrigin"]) ?? null,
      unitLiteral: (row.unitLiteral as string | null) ?? null,
      unitDeclared: Boolean(row.unitDeclared),
      unitDimension: (row.unitDimension as NormalizedEvidenceClaim["assertion"]["unitDimension"]) ?? null,
      quantityOrigin: (row.quantityOrigin as NormalizedEvidenceClaim["assertion"]["quantityOrigin"]) ?? null,
    },
    context: {
      locationKind: (row.locationKind as string | null) ?? null,
      locationValue: (row.locationValue as string | null) ?? null,
      systemValue: (row.systemValue as string | null) ?? null,
      sectionValue: (row.sectionValue as string | null) ?? null,
      qualifiers: (row.qualifiers as string[] | null) ?? [],
      sourceCoverage: row.sourceCoverage as NormalizedEvidenceClaim["context"]["sourceCoverage"],
      sourceQualifiers: (row.sourceQualifiers as string[] | null) ?? [],
    },
    provenance: {
      locator: String(row.locator),
      humanLocator: (row.humanLocator as string | null) ?? null,
      pageNumber: row.pageNumber === null || row.pageNumber === undefined ? null : Number(row.pageNumber),
      citationId: (row.citationId as string | null) ?? null,
      rawRecordKind: (row.rawRecordKind as string | null) ?? null,
      rawRecordId: (row.rawRecordId as string | null) ?? null,
      reliability: String(row.reliability) as NormalizedEvidenceClaim["provenance"]["reliability"],
      confidence: numberOrNull(row.confidence),
      limitations: (row.limitations as string[] | null) ?? [],
    },
    document: {
      evidenceDocumentFamilyKey: (row.evidenceDocumentFamilyKey as string | null) ?? null,
      observedRevisionLabel: (row.observedRevisionLabel as string | null) ?? null,
      revisionContext: row.revisionContext as NormalizedEvidenceClaim["document"]["revisionContext"],
    },
    derivation: {
      derivationFamilyRootArtifactId: String(row.derivationFamilyRootArtifactId),
      lineageRole: row.lineageRole as NormalizedEvidenceClaim["derivation"]["lineageRole"],
      derivationId: (row.derivationId as string | null) ?? null,
      sourceFormat: (row.sourceFormat as string | null) ?? null,
      derivedFormat: (row.derivedFormat as string | null) ?? null,
      derivationMethod: (row.derivationMethod as string | null) ?? null,
      converterId: (row.converterId as string | null) ?? null,
      converterVersion: (row.converterVersion as string | null) ?? null,
      fidelityLimitations: (row.fidelityLimitations as string[] | null) ?? [],
    },
    engine: {
      materializerVersion: String(row.materializerVersion),
      engineVersion: String(row.engineVersion),
      comparisonScope: row.comparisonScope as NormalizedEvidenceClaim["engine"]["comparisonScope"],
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
    },
    status: row.status as NormalizedEvidenceClaim["status"],
    purpose: row.purpose as NormalizedEvidenceClaim["purpose"],
  };
}

function toFindingRow(record: CrossDocumentFindingRecord): Record<string, unknown> {
  return {
    id: record.findingId,
    companyId: record.companyId,
    comparisonScopeId: record.comparisonScopeId,
    comparisonRunId: record.comparisonRunId,
    fingerprint: record.fingerprint,
    findingKind: record.findingKind as never,
    predicate: (record.predicate ?? null) as never,
    subjectClusterId: record.subjectClusterId,
    subjectKeys: [...record.subjectKeys],
    participantFamilies: [...record.participantFamilies],
    evidenceSignature: record.evidenceSignature as never,
    statementTemplateKey: record.statementTemplateKey,
    severity: record.severity as never,
    reproduced: record.engineFlags.reproduced,
    stale: record.engineFlags.stale,
    staleReason: (record.engineFlags.staleReason ?? null) as never,
    evidenceChanged: record.engineFlags.evidenceChanged,
    lastReproducedRunId: record.engineFlags.lastReproducedRunId,
    lastReproducedAt: record.engineFlags.lastReproducedAt ? new Date(record.engineFlags.lastReproducedAt) : null,
    reviewState: record.reviewState as never,
    limitations: [...record.limitations],
    truncated: record.truncated,
    projectorVersion: record.projectorVersion,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function fromFindingRow(row: ClaimRow, participantIds: string[]): CrossDocumentFindingRecord {
  return {
    findingId: String(row.id),
    companyId: String(row.companyId),
    comparisonScopeId: String(row.comparisonScopeId),
    comparisonRunId: String(row.comparisonRunId),
    fingerprint: String(row.fingerprint),
    findingKind: row.findingKind as CrossDocumentFindingRecord["findingKind"],
    predicate: (row.predicate as CrossDocumentFindingRecord["predicate"]) ?? null,
    subjectClusterId: (row.subjectClusterId as string | null) ?? null,
    subjectKeys: (row.subjectKeys as string[] | null) ?? [],
    participantFamilies: (row.participantFamilies as string[] | null) ?? [],
    evidenceSignature: row.evidenceSignature as EvidenceSignature,
    statementTemplateKey: String(row.statementTemplateKey),
    severity: row.severity as CrossDocumentFindingRecord["severity"],
    engineFlags: {
      reproduced: Boolean(row.reproduced),
      stale: Boolean(row.stale),
      staleReason: (row.staleReason as FindingEngineFlags["staleReason"]) ?? null,
      evidenceChanged: Boolean(row.evidenceChanged),
      lastReproducedRunId: (row.lastReproducedRunId as string | null) ?? null,
      lastReproducedAt: row.lastReproducedAt ? new Date(row.lastReproducedAt as string | Date).toISOString() : null,
    },
    reviewState: row.reviewState as ReviewState,
    participantIds,
    limitations: (row.limitations as string[] | null) ?? [],
    truncated: Boolean(row.truncated),
    projectorVersion: String(row.projectorVersion),
    createdAt: new Date(row.createdAt as string | Date).toISOString(),
    updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PrismaCrossDocumentStore implements CrossDocumentStore {
  async createScope(record: ComparisonScopeRecord): Promise<ComparisonScopeRecord> {
    await prisma.comparisonScope.create({
      data: {
        id: record.comparisonScopeId,
        companyId: record.companyId,
        name: record.name,
        context: record.context,
        projectKey: record.projectKey,
        revisionPolicy: record.revisionPolicy as never,
        predicateFilters: [...record.predicateFilters],
        roleFilters: [...record.roleFilters],
        lineageCollapse: true,
        policyBounds: record.policyBounds as never,
        comparisonScopeClass: record.comparisonScopeClass,
        createdByUserId: record.createdByUserId,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    });
    return record;
  }

  async findScope(input: { companyId: string; comparisonScopeId: string }): Promise<ComparisonScopeRecord | null> {
    const row = await prisma.comparisonScope.findFirst({ where: { id: input.comparisonScopeId, companyId: input.companyId } });
    return row ? fromScopeRow(row as ClaimRow) : null;
  }

  async listScopes(input: { companyId: string; limit: number }): Promise<ComparisonScopeRecord[]> {
    const rows = await prisma.comparisonScope.findMany({
      where: { companyId: input.companyId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 100)),
    });
    return rows.map((row: ClaimRow) => fromScopeRow(row));
  }

  async updateScopeRevisionPolicy(input: { companyId: string; comparisonScopeId: string; revisionPolicy: string; updatedAt: string }): Promise<ComparisonScopeRecord | null> {
    const existing = await prisma.comparisonScope.findFirst({ where: { id: input.comparisonScopeId, companyId: input.companyId } });
    if (!existing) return null;
    await prisma.comparisonScope.update({
      where: { id: input.comparisonScopeId },
      data: { revisionPolicy: input.revisionPolicy as never, updatedAt: new Date(input.updatedAt) },
    });
    const row = await prisma.comparisonScope.findFirst({ where: { id: input.comparisonScopeId, companyId: input.companyId } });
    return row ? fromScopeRow(row as ClaimRow) : null;
  }

  async addScopeArtifact(record: ComparisonScopeArtifactRecord): Promise<ComparisonScopeArtifactRecord> {
    // The artifact must belong to the same company, or the link is refused here
    // instead of becoming a cross-tenant row.
    const artifact = await prisma.sourceArtifact.findFirst({ where: { id: record.artifactId, companyId: record.companyId }, select: { id: true } });
    if (!artifact) throw new Error("a comparison scope may only include artifacts of the active company");
    await prisma.comparisonScopeArtifact.upsert({
      where: { companyId_comparisonScopeId_artifactId: { companyId: record.companyId, comparisonScopeId: record.comparisonScopeId, artifactId: record.artifactId } },
      create: {
        comparisonScopeId: record.comparisonScopeId,
        companyId: record.companyId,
        artifactId: record.artifactId,
        documentRole: record.documentRole as never,
        documentRoleSource: record.documentRoleSource as never,
        roleDeclaredByUserId: record.roleDeclaredByUserId,
        activeRevisionDecisionId: record.activeRevisionDecisionId,
        addedAt: new Date(record.addedAt),
      },
      update: {},
    });
    return record;
  }

  async listScopeArtifacts(input: { companyId: string; comparisonScopeId: string }): Promise<ComparisonScopeArtifactRecord[]> {
    const rows = await prisma.comparisonScopeArtifact.findMany({
      where: { companyId: input.companyId, comparisonScopeId: input.comparisonScopeId },
      orderBy: [{ addedAt: "asc" }, { artifactId: "asc" }],
      take: 200,
    });
    return rows.map((row: ClaimRow) => ({
      comparisonScopeId: String(row.comparisonScopeId),
      companyId: String(row.companyId),
      artifactId: String(row.artifactId),
      documentRole: row.documentRole as ComparisonScopeArtifactRecord["documentRole"],
      documentRoleSource: row.documentRoleSource as ComparisonScopeArtifactRecord["documentRoleSource"],
      roleDeclaredByUserId: (row.roleDeclaredByUserId as string | null) ?? null,
      activeRevisionDecisionId: (row.activeRevisionDecisionId as string | null) ?? null,
      addedAt: new Date(row.addedAt as string | Date).toISOString(),
    }));
  }

  async updateScopeArtifactRole(input: {
    companyId: string;
    comparisonScopeId: string;
    artifactId: string;
    documentRole: ComparisonScopeArtifactRecord["documentRole"];
    documentRoleSource: ComparisonScopeArtifactRecord["documentRoleSource"];
    declaredByUserId: string | null;
  }): Promise<ComparisonScopeArtifactRecord | null> {
    const existing = await prisma.comparisonScopeArtifact.findFirst({
      where: { companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, artifactId: input.artifactId },
    });
    if (!existing) return null;
    await prisma.comparisonScopeArtifact.update({
      where: { companyId_comparisonScopeId_artifactId: { companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, artifactId: input.artifactId } },
      data: { documentRole: input.documentRole as never, documentRoleSource: input.documentRoleSource as never, roleDeclaredByUserId: input.declaredByUserId },
    });
    const rows = await this.listScopeArtifacts({ companyId: input.companyId, comparisonScopeId: input.comparisonScopeId });
    return rows.find((row) => row.artifactId === input.artifactId) ?? null;
  }

  async saveMaterialization(record: MaterializationRecordFixture): Promise<void> {
    await prisma.crossDocumentMaterialization.upsert({
      where: {
        companyId_sourceArtifactId_artifactSha256_materializerVersion: {
          companyId: record.companyId,
          sourceArtifactId: record.sourceArtifactId,
          artifactSha256: record.artifactSha256,
          materializerVersion: record.materializerVersion,
        },
      },
      create: {
        id: record.materializationId,
        companyId: record.companyId,
        comparisonScopeId: record.comparisonScopeId,
        sourceArtifactId: record.sourceArtifactId,
        artifactSha256: record.artifactSha256,
        sourceKind: record.sourceKind as never,
        materializerVersion: record.materializerVersion,
        readingChannels: [...record.readingChannels],
        coverage: record.coverage as never,
        claimCount: record.claimCount,
        truncated: record.truncated,
        truncationReasons: [...record.truncationReasons],
        warnings: [...record.warnings],
        limitations: [...record.limitations],
        createdAt: new Date(record.createdAt),
      },
      update: {
        comparisonScopeId: record.comparisonScopeId,
        coverage: record.coverage as never,
        claimCount: record.claimCount,
        truncated: record.truncated,
        truncationReasons: [...record.truncationReasons],
        warnings: [...record.warnings],
        limitations: [...record.limitations],
      },
    });
  }

  async listMaterializations(input: { companyId: string; comparisonScopeId: string }): Promise<MaterializationRecordFixture[]> {
    const rows = await prisma.crossDocumentMaterialization.findMany({
      where: { companyId: input.companyId, comparisonScopeId: input.comparisonScopeId },
      orderBy: [{ sourceArtifactId: "asc" }],
      take: 200,
    });
    return rows.map((row: ClaimRow) => ({
      materializationId: String(row.id),
      companyId: String(row.companyId),
      comparisonScopeId: String(row.comparisonScopeId),
      sourceArtifactId: String(row.sourceArtifactId),
      artifactSha256: String(row.artifactSha256),
      sourceKind: String(row.sourceKind),
      materializerVersion: String(row.materializerVersion),
      readingChannels: (row.readingChannels as string[] | null) ?? [],
      coverage: row.coverage as "COMPLETE" | "PARTIAL",
      claimCount: Number(row.claimCount ?? 0),
      truncated: Boolean(row.truncated),
      truncationReasons: (row.truncationReasons as string[] | null) ?? [],
      warnings: (row.warnings as string[] | null) ?? [],
      limitations: (row.limitations as string[] | null) ?? [],
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
    }));
  }

  async saveClaims(claims: readonly NormalizedEvidenceClaim[]): Promise<{ inserted: number; existing: number }> {
    if (!claims.length) return { inserted: 0, existing: 0 };
    const ids = claims.map((claim) => claim.claimId);
    const existingRows = await prisma.normalizedEvidenceClaim.findMany({ where: { companyId: claims[0]!.companyId, id: { in: ids } }, select: { id: true } });
    const existingIds = new Set(existingRows.map((row: { id: string }) => row.id));
    const pending = claims.filter((claim) => !existingIds.has(claim.claimId));
    if (pending.length) {
      await prisma.normalizedEvidenceClaim.createMany({ data: pending.map(toClaimRow) as never, skipDuplicates: true });
    }
    // An existing claim is never updated: immutability is enforced here, not by
    // convention.
    return { inserted: pending.length, existing: existingIds.size };
  }

  async listClaims(input: {
    companyId: string;
    comparisonScopeId?: string;
    sourceArtifactId?: string;
    predicate?: string;
    subjectMatchKey?: string;
    documentIdentityId?: string;
    limit: number;
  }): Promise<NormalizedEvidenceClaim[]> {
    let artifactIds: string[] | null = null;
    if (input.documentIdentityId) {
      const memberships = await prisma.documentRevisionMembership.findMany({
        where: { companyId: input.companyId, documentIdentityId: input.documentIdentityId },
        select: { sourceArtifactId: true },
        take: 200,
      });
      const scopedIds: string[] = memberships.map((row: { sourceArtifactId: string }) => row.sourceArtifactId);
      if (!scopedIds.length) return [];
      artifactIds = scopedIds;
    }
    const rows = await prisma.normalizedEvidenceClaim.findMany({
      where: {
        companyId: input.companyId,
        ...(input.comparisonScopeId ? { materialization: { comparisonScopeId: input.comparisonScopeId } } : {}),
        ...(input.sourceArtifactId ? { sourceArtifactId: input.sourceArtifactId } : {}),
        ...(artifactIdScope(artifactIds)),
        ...(input.predicate ? { predicate: input.predicate as never } : {}),
        ...(input.subjectMatchKey ? { subjectMatchKey: input.subjectMatchKey } : {}),
      },
      orderBy: [{ id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 5000)),
    });
    return rows.map((row: ClaimRow) => fromClaimRow(row));
  }

  async findClaim(input: { companyId: string; claimId: string }): Promise<NormalizedEvidenceClaim | null> {
    const row = await prisma.normalizedEvidenceClaim.findFirst({ where: { id: input.claimId, companyId: input.companyId } });
    return row ? fromClaimRow(row as ClaimRow) : null;
  }

  async countClaims(input: { companyId: string; comparisonScopeId?: string; sourceArtifactId?: string }): Promise<number> {
    return prisma.normalizedEvidenceClaim.count({
      where: {
        companyId: input.companyId,
        ...(input.comparisonScopeId ? { materialization: { comparisonScopeId: input.comparisonScopeId } } : {}),
        ...(input.sourceArtifactId ? { sourceArtifactId: input.sourceArtifactId } : {}),
      },
    });
  }

  async saveSubjectMatches(matches: readonly SubjectMatchRecord[]): Promise<void> {
    for (const match of matches) {
      await prisma.subjectMatch.upsert({
        where: { companyId_comparisonScopeId_leftClaimId_rightClaimId_tier: {
          companyId: match.companyId,
          comparisonScopeId: match.comparisonScopeId,
          leftClaimId: match.leftClaimId,
          rightClaimId: match.rightClaimId,
          tier: match.tier as never,
        } },
        create: {
          id: match.subjectMatchId,
          companyId: match.companyId,
          comparisonScopeId: match.comparisonScopeId,
          comparisonRunId: match.comparisonRunId,
          leftClaimId: match.leftClaimId,
          rightClaimId: match.rightClaimId,
          leftArtifactId: match.leftArtifactId,
          rightArtifactId: match.rightArtifactId,
          tier: match.tier as never,
          matchClass: match.matchClass as never,
          subjectNamespace: match.namespace as never,
          comparedKeys: [...match.comparedKeys],
          corroborators: [...match.corroborators],
          blockers: [...match.blockers],
          reasons: [...match.reasons],
          score: match.score,
          ambiguous: match.ambiguous,
          sameDerivationFamily: match.sameDerivationFamily,
          reliability: match.reliability,
          limitations: [...match.limitations],
          matcherVersion: match.matcherVersion,
          explanationVersion: match.explanationVersion,
          createdAt: new Date(match.createdAt),
        },
        update: {
          comparisonRunId: match.comparisonRunId,
          matchClass: match.matchClass as never,
          comparedKeys: [...match.comparedKeys],
          corroborators: [...match.corroborators],
          blockers: [...match.blockers],
          reasons: [...match.reasons],
          score: match.score,
          ambiguous: match.ambiguous,
          sameDerivationFamily: match.sameDerivationFamily,
          reliability: match.reliability,
          limitations: [...match.limitations],
          explanationVersion: match.explanationVersion,
        },
      });
    }
  }

  async listSubjectMatches(input: { companyId: string; comparisonScopeId: string; limit: number }): Promise<SubjectMatchRecord[]> {
    const rows = await prisma.subjectMatch.findMany({
      where: { companyId: input.companyId, comparisonScopeId: input.comparisonScopeId },
      orderBy: [{ id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 2000)),
    });
    return rows.map((row: ClaimRow) => ({
      subjectMatchId: String(row.id),
      companyId: String(row.companyId),
      comparisonScopeId: String(row.comparisonScopeId),
      comparisonRunId: String(row.comparisonRunId),
      leftClaimId: String(row.leftClaimId),
      rightClaimId: String(row.rightClaimId),
      leftArtifactId: String(row.leftArtifactId),
      rightArtifactId: String(row.rightArtifactId),
      tier: row.tier as SubjectMatchRecord["tier"],
      matchClass: row.matchClass as SubjectMatchRecord["matchClass"],
      namespace: row.subjectNamespace as SubjectMatchRecord["namespace"],
      comparedKeys: (row.comparedKeys as string[] | null) ?? [],
      corroborators: (row.corroborators as SubjectMatchRecord["corroborators"] | null) ?? [],
      blockers: (row.blockers as SubjectMatchRecord["blockers"] | null) ?? [],
      reasons: (row.reasons as string[] | null) ?? [],
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      ambiguous: Boolean(row.ambiguous),
      sameDerivationFamily: Boolean(row.sameDerivationFamily),
      reliability: String(row.reliability) as SubjectMatchRecord["reliability"],
      limitations: (row.limitations as string[] | null) ?? [],
      matcherVersion: String(row.matcherVersion),
      explanationVersion: String(row.explanationVersion),
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
    }));
  }

  async saveSubjectClusters(clusters: readonly SubjectClusterRecord[]): Promise<void> {
    for (const cluster of clusters) {
      await prisma.subjectCluster.upsert({
        where: {
          companyId_comparisonScopeId_subjectNamespace_matchKey: {
            companyId: cluster.companyId,
            comparisonScopeId: cluster.comparisonScopeId,
            subjectNamespace: cluster.namespace as never,
            matchKey: cluster.matchKey,
          },
        },
        create: {
          id: cluster.subjectClusterId,
          companyId: cluster.companyId,
          comparisonScopeId: cluster.comparisonScopeId,
          comparisonRunId: null,
          subjectNamespace: cluster.namespace as never,
          matchKey: cluster.matchKey,
          subjectKeys: [...cluster.subjectKeys],
          strongestTier: (cluster.strongestTier ?? null) as never,
          ambiguous: cluster.ambiguous,
          comparable: cluster.comparable,
          blockers: [...cluster.blockers],
          reliability: cluster.reliability,
          limitations: [...cluster.limitations],
          matcherVersion: cluster.matcherVersion,
          createdAt: new Date(cluster.createdAt),
          updatedAt: new Date(cluster.updatedAt),
        },
        update: {
          comparisonRunId: null,
          subjectKeys: [...cluster.subjectKeys],
          strongestTier: (cluster.strongestTier ?? null) as never,
          ambiguous: cluster.ambiguous,
          comparable: cluster.comparable,
          blockers: [...cluster.blockers],
          reliability: cluster.reliability,
          limitations: [...cluster.limitations],
          updatedAt: new Date(cluster.updatedAt),
        },
      });
      // Membership is relational: a claim joins a cluster through a join row.
      const existing = await prisma.subjectClusterMember.findMany({ where: { subjectClusterId: cluster.subjectClusterId }, select: { claimId: true }, take: 500 });
      const existingIds = new Set(existing.map((row: { claimId: string }) => row.claimId));
      const pending = cluster.memberClaimIds.filter((claimId) => !existingIds.has(claimId));
      if (pending.length) {
        await prisma.subjectClusterMember.createMany({
          data: pending.map((claimId) => ({
            subjectClusterId: cluster.subjectClusterId,
            claimId,
            derivationFamilyRootArtifactId: cluster.derivationFamilyRootIds[0] ?? cluster.companyId,
            addedAt: new Date(cluster.updatedAt),
          })) as never,
          skipDuplicates: true,
        });
      }
    }
  }

  async listSubjectClusters(input: { companyId: string; comparisonScopeId: string; limit: number }): Promise<SubjectClusterRecord[]> {
    const rows = await prisma.subjectCluster.findMany({
      where: { companyId: input.companyId, comparisonScopeId: input.comparisonScopeId },
      orderBy: [{ id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 2000)),
    });
    const out: SubjectClusterRecord[] = [];
    for (const row of rows) out.push(await this.clusterWithMembers(row as ClaimRow));
    return out;
  }

  async findSubjectCluster(input: { companyId: string; subjectClusterId: string }): Promise<SubjectClusterRecord | null> {
    const row = await prisma.subjectCluster.findFirst({ where: { id: input.subjectClusterId, companyId: input.companyId } });
    return row ? this.clusterWithMembers(row as ClaimRow) : null;
  }

  private async clusterWithMembers(row: ClaimRow): Promise<SubjectClusterRecord> {
    const members = (await prisma.subjectClusterMember.findMany({
      where: { subjectClusterId: String(row.id) },
      select: { claimId: true, derivationFamilyRootArtifactId: true },
      orderBy: [{ claimId: "asc" }],
      take: 500,
    })) as Array<{ claimId: string; derivationFamilyRootArtifactId: string }>;
    return {
      subjectClusterId: String(row.id),
      companyId: String(row.companyId),
      comparisonScopeId: String(row.comparisonScopeId),
      namespace: row.subjectNamespace as SubjectClusterRecord["namespace"],
      matchKey: String(row.matchKey),
      subjectKeys: (row.subjectKeys as string[] | null) ?? [],
      memberClaimIds: members.map((member: { claimId: string }) => member.claimId),
      derivationFamilyRootIds: [...new Set(members.map((member: { derivationFamilyRootArtifactId: string }) => member.derivationFamilyRootArtifactId))],
      strongestTier: (row.strongestTier as SubjectClusterRecord["strongestTier"]) ?? null,
      ambiguous: Boolean(row.ambiguous),
      comparable: Boolean(row.comparable),
      blockers: (row.blockers as SubjectClusterRecord["blockers"] | null) ?? [],
      reliability: String(row.reliability) as SubjectClusterRecord["reliability"],
      limitations: (row.limitations as string[] | null) ?? [],
      matcherVersion: String(row.matcherVersion),
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
      updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
    };
  }

  async findFindingByFingerprint(input: { companyId: string; comparisonScopeId: string; fingerprint: string }): Promise<CrossDocumentFindingRecord | null> {
    const row = await prisma.crossDocumentFinding.findFirst({
      where: { companyId: input.companyId, comparisonScopeId: input.comparisonScopeId, fingerprint: input.fingerprint },
    });
    if (!row) return null;
    return this.withParticipants(row as ClaimRow);
  }

  async saveFinding(record: CrossDocumentFindingRecord): Promise<void> {
    await prisma.crossDocumentFinding.upsert({
      where: { companyId_comparisonScopeId_fingerprint: { companyId: record.companyId, comparisonScopeId: record.comparisonScopeId, fingerprint: record.fingerprint } },
      create: toFindingRow(record) as never,
      // Updating an existing row through this path preserves the human review
      // state: it is not part of the update payload.
      update: {
        comparisonRunId: record.comparisonRunId,
        subjectClusterId: record.subjectClusterId,
        subjectKeys: [...record.subjectKeys],
        participantFamilies: [...record.participantFamilies],
        evidenceSignature: record.evidenceSignature as never,
        statementTemplateKey: record.statementTemplateKey,
        severity: record.severity as never,
        reproduced: record.engineFlags.reproduced,
        stale: record.engineFlags.stale,
        staleReason: (record.engineFlags.staleReason ?? null) as never,
        evidenceChanged: record.engineFlags.evidenceChanged,
        lastReproducedRunId: record.engineFlags.lastReproducedRunId,
        lastReproducedAt: record.engineFlags.lastReproducedAt ? new Date(record.engineFlags.lastReproducedAt) : null,
        limitations: [...record.limitations],
        truncated: record.truncated,
        updatedAt: new Date(record.updatedAt),
      },
    });
  }

  async updateFindingEngineFlags(input: {
    companyId: string;
    findingId: string;
    engineFlags: FindingEngineFlags;
    evidenceSignature: EvidenceSignature;
    comparisonRunId: string;
    projectorVersion: string;
    updatedAt: string;
  }): Promise<void> {
    const existing = await prisma.crossDocumentFinding.findFirst({ where: { id: input.findingId, companyId: input.companyId }, select: { id: true } });
    if (!existing) return;
    // reviewState is deliberately NOT in this payload.
    await prisma.crossDocumentFinding.update({
      where: { id: input.findingId },
      data: {
        evidenceSignature: input.evidenceSignature as never,
        comparisonRunId: input.comparisonRunId,
        reproduced: input.engineFlags.reproduced,
        stale: input.engineFlags.stale,
        staleReason: (input.engineFlags.staleReason ?? null) as never,
        evidenceChanged: input.engineFlags.evidenceChanged,
        lastReproducedRunId: input.engineFlags.lastReproducedRunId,
        lastReproducedAt: input.engineFlags.lastReproducedAt ? new Date(input.engineFlags.lastReproducedAt) : null,
        projectorVersion: input.projectorVersion,
        updatedAt: new Date(input.updatedAt),
      },
    });
  }

  async markFindingReviewState(input: { companyId: string; findingId: string; reviewState: ReviewState; updatedAt: string }): Promise<void> {
    const existing = await prisma.crossDocumentFinding.findFirst({ where: { id: input.findingId, companyId: input.companyId }, select: { id: true } });
    if (!existing) return;
    await prisma.crossDocumentFinding.update({
      where: { id: input.findingId },
      data: { reviewState: input.reviewState as never, updatedAt: new Date(input.updatedAt) },
    });
  }

  async listFindings(input: {
    companyId: string;
    comparisonScopeId?: string;
    findingKind?: string;
    reviewState?: string;
    stale?: boolean;
    subjectClusterId?: string;
    limit: number;
  }): Promise<CrossDocumentFindingRecord[]> {
    const rows = await prisma.crossDocumentFinding.findMany({
      where: {
        companyId: input.companyId,
        ...(input.comparisonScopeId ? { comparisonScopeId: input.comparisonScopeId } : {}),
        ...(input.findingKind ? { findingKind: input.findingKind as never } : {}),
        ...(input.reviewState ? { reviewState: input.reviewState as never } : {}),
        ...(input.stale === undefined ? {} : { stale: input.stale }),
        ...(input.subjectClusterId ? { subjectClusterId: input.subjectClusterId } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 500)),
    });
    const out: CrossDocumentFindingRecord[] = [];
    for (const row of rows) out.push(await this.withParticipants(row as ClaimRow));
    return out;
  }

  async findFinding(input: { companyId: string; findingId: string }): Promise<CrossDocumentFindingRecord | null> {
    const row = await prisma.crossDocumentFinding.findFirst({ where: { id: input.findingId, companyId: input.companyId } });
    return row ? this.withParticipants(row as ClaimRow) : null;
  }

  private async withParticipants(row: ClaimRow): Promise<CrossDocumentFindingRecord> {
    const participants = await prisma.findingParticipant.findMany({
      where: { findingId: String(row.id) },
      select: { id: true, claimId: true },
      orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      take: 64,
    });
    return fromFindingRow(row, participants.map((participant: { id: string }) => participant.id));
  }

  /**
   * Rewrites the participant set of each finding supplied.
   *
   * The set is the finding's CURRENT evidence projection: a two-source
   * disagreement must never render as three sides because an earlier run stated
   * a different value. Setting rather than appending loses nothing — claims are
   * immutable, so every claim this finding ever rested on remains queryable by
   * id, and `engineFlags.evidenceChanged` records that the signature moved.
   *
   * The tenant is proven through the finding before anything is written.
   */
  /**
   * Rewrites the participant set of each finding supplied.
   *
   * The set is the finding's CURRENT evidence projection: a two-source
   * disagreement must never render as three sides because an earlier run stated
   * a different value. Setting rather than appending loses nothing — claims are
   * immutable, so every claim this finding ever rested on remains queryable by
   * id, and `engineFlags.evidenceChanged` records that the signature moved.
   *
   * The tenant is proven through the finding before anything is written.
   */
  async saveParticipants(input: { companyId: string; participants: readonly FindingParticipant[] }): Promise<void> {
    const byFinding = new Map<string, FindingParticipant[]>();
    for (const participant of input.participants) {
      const list = byFinding.get(participant.findingId) ?? [];
      list.push(participant);
      byFinding.set(participant.findingId, list);
    }
    for (const [findingId, participants] of byFinding) {
      // Same `any` on the transaction client the accepted Prisma repositories use
      // while the generated client is absent from this checkout.
      await prisma.$transaction(async (tx: any) => {
        // Fails closed across tenants: another company's finding yields no write.
        const finding = await tx.crossDocumentFinding.findFirst({ where: { id: findingId, companyId: input.companyId }, select: { id: true } });
        if (!finding) return;
        await tx.findingParticipant.deleteMany({ where: { findingId } });
        await tx.findingParticipant.createMany({
          data: participants.map((participant) => ({
            id: participant.participantId,
            findingId: participant.findingId,
            claimId: participant.claimId,
            ordinal: participant.ordinal,
            sourceArtifactId: participant.sourceArtifactId,
            derivationFamilyRootArtifactId: participant.derivationFamilyRootArtifactId,
            documentRole: participant.documentRole as never,
            documentIdentityId: participant.documentIdentityId,
            documentRevisionMembershipId: participant.documentRevisionMembershipId,
            verbatimValue: participant.verbatimValue,
            sourceNumericView: participant.sourceNumericView,
            unit: participant.unit,
            unitDeclared: participant.unitDeclared,
            quantityOrigin: participant.quantityOrigin as never,
            locator: participant.locator,
            humanLocator: participant.humanLocator,
            citationId: participant.citationId,
            sourceKind: participant.sourceKind as never,
            readingChannel: participant.readingChannel as never,
            reliability: participant.reliability,
            confidence: participant.confidence,
            limitations: [...participant.limitations],
          })),
        });
      });
    }
  }

  async listParticipants(input: { companyId: string; findingId: string }): Promise<FindingParticipant[]> {
    // Company scope is proven through the finding the participants belong to.
    const finding = await prisma.crossDocumentFinding.findFirst({ where: { id: input.findingId, companyId: input.companyId }, select: { id: true } });
    if (!finding) return [];
    const rows = await prisma.findingParticipant.findMany({
      where: { findingId: input.findingId },
      orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      take: 64,
    });
    return rows.map((row: ClaimRow) => ({
      participantId: String(row.id),
      findingId: String(row.findingId),
      ordinal: Number(row.ordinal),
      claimId: String(row.claimId),
      sourceArtifactId: String(row.sourceArtifactId),
      derivationFamilyRootArtifactId: String(row.derivationFamilyRootArtifactId),
      documentRole: String(row.documentRole),
      documentIdentityId: (row.documentIdentityId as string | null) ?? null,
      documentRevisionMembershipId: (row.documentRevisionMembershipId as string | null) ?? null,
      verbatimValue: String(row.verbatimValue),
      sourceNumericView: row.sourceNumericView === null || row.sourceNumericView === undefined ? null : Number(row.sourceNumericView),
      unit: (row.unit as string | null) ?? null,
      unitDeclared: Boolean(row.unitDeclared),
      quantityOrigin: (row.quantityOrigin as FindingParticipant["quantityOrigin"]) ?? null,
      locator: String(row.locator),
      humanLocator: (row.humanLocator as string | null) ?? null,
      citationId: (row.citationId as string | null) ?? null,
      sourceKind: String(row.sourceKind),
      readingChannel: String(row.readingChannel),
      reliability: String(row.reliability) as FindingParticipant["reliability"],
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      limitations: (row.limitations as string[] | null) ?? [],
    }));
  }

  async saveFindingEvidenceObservation(input: {
    record: FindingEvidenceObservationRecord;
    entries: readonly FindingEvidenceObservationEntryRecord[];
  }): Promise<void> {
    const { record } = input;
    await prisma.$transaction(async (tx: any) => {
      // Fails closed across tenants: another company's finding yields no write.
      const finding = await tx.crossDocumentFinding.findFirst({ where: { id: record.findingId, companyId: record.companyId }, select: { id: true } });
      if (!finding) return;
      // Append-only: one observation per (finding, run). A re-run of the same run
      // collides with itself instead of rewriting an earlier observation.
      const existing = await tx.findingEvidenceObservation.findFirst({
        where: { findingId: record.findingId, comparisonRunId: record.comparisonRunId },
        select: { id: true },
      });
      if (existing) return;
      const entries = input.entries.filter((entry) => entry.claimId);
      await tx.findingEvidenceObservation.create({
        data: {
          id: record.observationId,
          companyId: record.companyId,
          findingId: record.findingId,
          comparisonRunId: record.comparisonRunId,
          fingerprint: record.fingerprint,
          evidenceSignatureHash: record.evidenceSignatureHash,
          evidenceChanged: record.evidenceChanged,
          entryCount: entries.length,
          observedAt: new Date(record.observedAt),
        },
      });
      if (!entries.length) return;
      await tx.findingEvidenceObservationEntry.createMany({
        data: entries.map((entry) => ({
          id: `feoe_${createHash("sha256")
            .update(["voka:2a-10:observation-entry:v1", record.observationId, entry.claimId].join("\u0000"), "utf8")
            .digest("hex")
            .slice(0, 40)}`,
          companyId: entry.companyId,
          observationId: record.observationId,
          findingId: record.findingId,
          comparisonRunId: record.comparisonRunId,
          claimId: entry.claimId,
          ordinal: entry.ordinal,
        })),
      });
    });
  }

  async listFindingEvidenceObservations(input: {
    companyId: string;
    findingId?: string;
    findingIds?: readonly string[];
    limit: number;
  }): Promise<FindingEvidenceObservationView[]> {
    const findingIds = input.findingId ? [input.findingId] : [...(input.findingIds ?? [])];
    if (!findingIds.length) return [];
    const limit = Math.max(1, Math.min(input.limit, CROSS_DOCUMENT_BOUNDS.maxEvidenceObservationsPerRead));
    // Company scope is enforced on the observation row itself, and the finding
    // ids are additionally verified to belong to the caller's company.
    const scopedFindings = await prisma.crossDocumentFinding.findMany({
      where: { companyId: input.companyId, id: { in: findingIds } },
      select: { id: true },
      take: findingIds.length,
    });
    const allowed = new Set(scopedFindings.map((row: ClaimRow) => String(row.id)));
    const wanted = findingIds.filter((findingId) => allowed.has(findingId));
    if (!wanted.length) return [];
    const rows = await prisma.findingEvidenceObservation.findMany({
      where: { companyId: input.companyId, findingId: { in: wanted } },
      orderBy: [{ observedAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    if (!rows.length) return [];
    const observationIds = rows.map((row: ClaimRow) => String(row.id));
    const entryRows = await prisma.findingEvidenceObservationEntry.findMany({
      where: { companyId: input.companyId, observationId: { in: observationIds } },
      orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      take: observationIds.length * CROSS_DOCUMENT_BOUNDS.maxEvidenceObservationEntries,
    });
    const claimIds = [...new Set(entryRows.map((row: ClaimRow) => String(row.claimId)))];
    const claimRows = claimIds.length
      ? await prisma.normalizedEvidenceClaim.findMany({ where: { companyId: input.companyId, id: { in: claimIds } }, take: claimIds.length })
      : [];
    const claimById = new Map<string, NormalizedEvidenceClaim>(claimRows.map((row: ClaimRow) => [String(row.id), fromClaimRow(row)]));
    const entriesByObservation = new Map<string, Array<{ claimId: string; ordinal: number; claim: NormalizedEvidenceClaim | null }>>();
    for (const row of entryRows) {
      const observationId = String(row.observationId);
      const list = entriesByObservation.get(observationId) ?? [];
      list.push({ claimId: String(row.claimId), ordinal: Number(row.ordinal), claim: claimById.get(String(row.claimId)) ?? null });
      entriesByObservation.set(observationId, list);
    }
    return rows.map((row: ClaimRow) => ({
      observationId: String(row.id),
      companyId: String(row.companyId),
      findingId: String(row.findingId),
      comparisonRunId: String(row.comparisonRunId),
      fingerprint: String(row.fingerprint),
      evidenceSignatureHash: String(row.evidenceSignatureHash),
      evidenceChanged: Boolean(row.evidenceChanged),
      entryCount: Number(row.entryCount),
      observedAt: new Date(row.observedAt as string | Date).toISOString(),
      entries: entriesByObservation.get(String(row.id)) ?? [],
    }));
  }

  async appendReviewEvent(event: FindingReviewEvent): Promise<void> {
    await prisma.findingReviewEvent.create({
      data: {
        id: event.eventId,
        findingId: event.findingId,
        companyId: event.companyId,
        fromState: event.fromState as never,
        toState: event.toState as never,
        kind: event.kind as never,
        actorUserId: event.actorUserId,
        reason: event.reason,
        explicit: event.explicit,
        createdAt: new Date(event.createdAt),
      },
    });
  }

  async listReviewEvents(input: { companyId: string; findingId: string; limit: number }): Promise<FindingReviewEvent[]> {
    const rows = await prisma.findingReviewEvent.findMany({
      where: { companyId: input.companyId, findingId: input.findingId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(input.limit, 200)),
    });
    return rows.map((row: ClaimRow) => ({
      eventId: String(row.id),
      findingId: String(row.findingId),
      companyId: String(row.companyId),
      fromState: (row.fromState as FindingReviewEvent["fromState"]) ?? null,
      toState: row.toState as ReviewState,
      kind: row.kind as FindingReviewEvent["kind"],
      actorUserId: String(row.actorUserId),
      reason: String(row.reason),
      explicit: Boolean(row.explicit),
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
    }));
  }

  async upsertDocumentIdentity(record: DocumentIdentityRecord): Promise<DocumentIdentityRecord> {
    if (record.confirmedIdentityKey) {
      const collision = await prisma.documentIdentity.findFirst({
        where: { companyId: record.companyId, confirmedIdentityKey: record.confirmedIdentityKey, NOT: { id: record.documentIdentityId } },
        select: { id: true },
      });
      if (collision) throw new Error("a governance-confirmed identity key must be unique inside one company");
    }
    const existing = await prisma.documentIdentity.findFirst({ where: { id: record.documentIdentityId, companyId: record.companyId }, select: { id: true } });
    const data = {
      companyId: record.companyId,
      kind: record.kind as never,
      label: record.label,
      observedFamilyKey: record.observedFamilyKey,
      confirmedIdentityKey: record.confirmedIdentityKey,
      identityBasis: record.identityBasis as never,
      ambiguous: record.ambiguous,
      limitations: [...record.limitations],
      resolverVersion: record.resolverVersion,
      updatedAt: new Date(record.updatedAt),
    };
    if (existing) {
      await prisma.documentIdentity.update({ where: { id: record.documentIdentityId }, data });
    } else {
      await prisma.documentIdentity.create({ data: { id: record.documentIdentityId, ...data, createdAt: new Date(record.createdAt) } });
    }
    // Identity evidence is relational and append-only: an existing evidence row
    // is never rewritten.
    for (const evidence of record.evidence) {
      const duplicate = await prisma.documentIdentityEvidence.findFirst({
        where: { documentIdentityId: record.documentIdentityId, evidenceKind: evidence.kind, value: evidence.value, sourceArtifactId: evidence.sourceArtifactId, claimId: evidence.claimId },
        select: { id: true },
      });
      if (duplicate) continue;
      await prisma.documentIdentityEvidence.create({
        data: {
          documentIdentityId: record.documentIdentityId,
          evidenceKind: evidence.kind,
          value: evidence.value,
          sourceArtifactId: evidence.sourceArtifactId,
          claimId: evidence.claimId,
          locator: evidence.locator,
          reliability: evidence.reliability,
          limitations: [...evidence.limitations],
          createdAt: new Date(record.updatedAt),
        },
      });
    }
    const saved = await prisma.documentIdentity.findFirst({ where: { id: record.documentIdentityId, companyId: record.companyId } });
    return saved ? fromIdentityRow(saved as ClaimRow, record.evidence, record) : record;
  }

  async findDocumentIdentity(input: { companyId: string; documentIdentityId: string }): Promise<DocumentIdentityRecord | null> {
    const row = await prisma.documentIdentity.findFirst({ where: { id: input.documentIdentityId, companyId: input.companyId } });
    if (!row) return null;
    const evidence = await this.identityEvidence(String((row as ClaimRow).id));
    return fromIdentityRow(row as ClaimRow, evidence, null);
  }

  async listDocumentIdentities(input: { companyId: string; observedFamilyKey?: string; limit: number }): Promise<DocumentIdentityRecord[]> {
    const rows = await prisma.documentIdentity.findMany({
      where: { companyId: input.companyId, ...(input.observedFamilyKey ? { observedFamilyKey: input.observedFamilyKey } : {}) },
      orderBy: [{ id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 200)),
    });
    const out: DocumentIdentityRecord[] = [];
    for (const row of rows) out.push(fromIdentityRow(row as ClaimRow, await this.identityEvidence(String((row as ClaimRow).id)), null));
    return out;
  }

  private async identityEvidence(documentIdentityId: string): Promise<DocumentIdentityRecord["evidence"]> {
    const rows = await prisma.documentIdentityEvidence.findMany({ where: { documentIdentityId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 64 });
    return rows.map((row: ClaimRow) => ({
      kind: String(row.evidenceKind),
      value: String(row.value),
      sourceArtifactId: String(row.sourceArtifactId),
      claimId: (row.claimId as string | null) ?? null,
      locator: (row.locator as string | null) ?? null,
      reliability: String(row.reliability),
      limitations: (row.limitations as string[] | null) ?? [],
    }));
  }

  async saveRevisionMembership(membership: DocumentRevisionMembership): Promise<void> {
    await prisma.documentRevisionMembership.upsert({
      where: { membershipId: membership.membershipId },
      create: {
        membershipId: membership.membershipId,
        companyId: membership.companyId,
        documentIdentityId: membership.documentIdentityId,
        sourceArtifactId: membership.sourceArtifactId,
        artifactSha256: membership.artifactSha256,
        observedRevisionLabel: membership.observedRevisionLabel,
        revisionClaimId: membership.revisionClaimId,
        membershipBasis: membership.membershipBasis as never,
        documentRole: membership.documentRole as never,
        documentRoleSource: membership.documentRoleSource as never,
        derivationFamilyRootArtifactId: membership.derivationFamilyRootArtifactId,
        lineageRole: membership.lineageRole as never,
        limitations: [...membership.limitations],
        createdAt: new Date(membership.createdAt),
      },
      update: {
        artifactSha256: membership.artifactSha256,
        observedRevisionLabel: membership.observedRevisionLabel,
        revisionClaimId: membership.revisionClaimId,
        membershipBasis: membership.membershipBasis as never,
        documentRole: membership.documentRole as never,
        documentRoleSource: membership.documentRoleSource as never,
        derivationFamilyRootArtifactId: membership.derivationFamilyRootArtifactId,
        lineageRole: membership.lineageRole as never,
        limitations: [...membership.limitations],
      },
    });
  }

  async listRevisionMemberships(input: { companyId: string; documentIdentityId?: string; sourceArtifactId?: string; limit: number }): Promise<DocumentRevisionMembership[]> {
    const rows = await prisma.documentRevisionMembership.findMany({
      where: {
        companyId: input.companyId,
        ...(input.documentIdentityId ? { documentIdentityId: input.documentIdentityId } : {}),
        ...(input.sourceArtifactId ? { sourceArtifactId: input.sourceArtifactId } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { membershipId: "asc" }],
      take: Math.max(1, Math.min(input.limit, 200)),
    });
    return rows.map((row: ClaimRow) => ({
      membershipId: String(row.membershipId),
      companyId: String(row.companyId),
      documentIdentityId: String(row.documentIdentityId),
      sourceArtifactId: String(row.sourceArtifactId),
      artifactSha256: String(row.artifactSha256),
      observedRevisionLabel: (row.observedRevisionLabel as string | null) ?? null,
      revisionClaimId: (row.revisionClaimId as string | null) ?? null,
      membershipBasis: row.membershipBasis as DocumentRevisionMembership["membershipBasis"],
      documentRole: row.documentRole as DocumentRevisionMembership["documentRole"],
      documentRoleSource: row.documentRoleSource as DocumentRevisionMembership["documentRoleSource"],
      derivationFamilyRootArtifactId: String(row.derivationFamilyRootArtifactId),
      lineageRole: row.lineageRole as DocumentRevisionMembership["lineageRole"],
      limitations: (row.limitations as string[] | null) ?? [],
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
    }));
  }

  async saveDocumentRelation(relation: DocumentRelationRecord): Promise<void> {
    if (relation.documentIdentityId === relation.relatedDocumentIdentityId) {
      throw new Error("a document relation must connect two different document identities");
    }
    const both = await prisma.documentIdentity.findMany({
      where: { companyId: relation.companyId, id: { in: [relation.documentIdentityId, relation.relatedDocumentIdentityId] } },
      select: { id: true },
      take: 4,
    });
    if (both.length < 2) throw new Error("both document identities of a relation must belong to the active company");
    await prisma.documentRelation.upsert({
      where: {
        companyId_documentIdentityId_relatedDocumentIdentityId_relationKind: {
          companyId: relation.companyId,
          documentIdentityId: relation.documentIdentityId,
          relatedDocumentIdentityId: relation.relatedDocumentIdentityId,
          relationKind: relation.relationKind as never,
        },
      },
      create: {
        id: relation.documentRelationId,
        companyId: relation.companyId,
        documentIdentityId: relation.documentIdentityId,
        relatedDocumentIdentityId: relation.relatedDocumentIdentityId,
        relationKind: relation.relationKind as never,
        relationBasis: relation.relationBasis as never,
        declaredByUserId: relation.declaredByUserId,
        reason: relation.reason,
        limitations: [...relation.limitations],
        createdAt: new Date(relation.createdAt),
      },
      update: {
        relationBasis: relation.relationBasis as never,
        declaredByUserId: relation.declaredByUserId,
        reason: relation.reason,
        limitations: [...relation.limitations],
      },
    });
    for (const claimId of relation.evidenceClaimIds) {
      const duplicate = await prisma.documentRelationEvidenceClaim.findFirst({ where: { documentRelationId: relation.documentRelationId, claimId }, select: { id: true } });
      if (duplicate) continue;
      await prisma.documentRelationEvidenceClaim.create({ data: { documentRelationId: relation.documentRelationId, claimId, addedAt: new Date(relation.createdAt) } });
    }
  }

  async listDocumentRelations(input: { companyId: string; documentIdentityId?: string; limit: number }): Promise<DocumentRelationRecord[]> {
    const rows = await prisma.documentRelation.findMany({
      where: {
        companyId: input.companyId,
        ...(input.documentIdentityId ? { OR: [{ documentIdentityId: input.documentIdentityId }, { relatedDocumentIdentityId: input.documentIdentityId }] } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 200)),
    });
    const out: DocumentRelationRecord[] = [];
    for (const row of rows) {
      const evidence = await prisma.documentRelationEvidenceClaim.findMany({ where: { documentRelationId: String((row as ClaimRow).id) }, select: { claimId: true }, take: 64 });
      out.push({
        documentRelationId: String((row as ClaimRow).id),
        companyId: String((row as ClaimRow).companyId),
        documentIdentityId: String((row as ClaimRow).documentIdentityId),
        relatedDocumentIdentityId: String((row as ClaimRow).relatedDocumentIdentityId),
        relationKind: (row as ClaimRow).relationKind as DocumentRelationRecord["relationKind"],
        relationBasis: (row as ClaimRow).relationBasis as DocumentRelationRecord["relationBasis"],
        evidenceClaimIds: evidence.map((item: { claimId: string }) => item.claimId),
        declaredByUserId: ((row as ClaimRow).declaredByUserId as string | null) ?? null,
        reason: String((row as ClaimRow).reason),
        limitations: ((row as ClaimRow).limitations as string[] | null) ?? [],
        createdAt: new Date((row as ClaimRow).createdAt as string | Date).toISOString(),
      });
    }
    return out;
  }

  async appendActiveRevisionDecision(record: ActiveRevisionDecisionRecord): Promise<void> {
    const duplicate = await prisma.activeRevisionDecision.findFirst({
      where: { companyId: record.companyId, documentIdentityId: record.documentIdentityId, decisionVersion: record.decisionVersion },
      select: { id: true },
    });
    if (duplicate) throw new Error("an active-revision decision version is append-only and may not be replaced");
    await prisma.activeRevisionDecision.create({
      data: {
        id: record.decisionId,
        companyId: record.companyId,
        documentIdentityId: record.documentIdentityId,
        comparisonScopeId: record.comparisonScopeId,
        decisionVersion: record.decisionVersion,
        status: record.status as never,
        actorUserId: record.actorUserId,
        reason: record.reason,
        decidedAt: new Date(record.decidedAt),
        supersedesDecisionId: record.supersedesDecisionId,
        blockedReason: record.blockedReason,
        limitations: [...record.limitations],
      },
    });
    for (const membershipId of record.selectedMembershipIds) {
      await prisma.activeRevisionDecisionSelection.create({ data: { decisionId: record.decisionId, membershipId, addedAt: new Date(record.decidedAt) } });
    }
    for (const claimId of record.evidenceClaimIds) {
      await prisma.activeRevisionDecisionEvidenceClaim.create({ data: { decisionId: record.decisionId, claimId, addedAt: new Date(record.decidedAt) } });
    }
  }

  async latestActiveRevisionDecision(input: { companyId: string; documentIdentityId: string }): Promise<ActiveRevisionDecisionRecord | null> {
    const row = await prisma.activeRevisionDecision.findFirst({
      where: { companyId: input.companyId, documentIdentityId: input.documentIdentityId },
      orderBy: [{ decisionVersion: "desc" }],
    });
    return row ? this.decisionWithLinks(row as ClaimRow) : null;
  }

  async listActiveRevisionDecisions(input: { companyId: string; documentIdentityId: string; limit: number }): Promise<ActiveRevisionDecisionRecord[]> {
    const rows = await prisma.activeRevisionDecision.findMany({
      where: { companyId: input.companyId, documentIdentityId: input.documentIdentityId },
      orderBy: [{ decisionVersion: "asc" }],
      take: Math.max(1, Math.min(input.limit, 200)),
    });
    const out: ActiveRevisionDecisionRecord[] = [];
    for (const row of rows) out.push(await this.decisionWithLinks(row as ClaimRow));
    return out;
  }

  private async decisionWithLinks(row: ClaimRow): Promise<ActiveRevisionDecisionRecord> {
    const [selections, evidence] = await Promise.all([
      prisma.activeRevisionDecisionSelection.findMany({ where: { decisionId: String(row.id) }, select: { membershipId: true }, take: 64 }),
      prisma.activeRevisionDecisionEvidenceClaim.findMany({ where: { decisionId: String(row.id) }, select: { claimId: true }, take: 128 }),
    ]);
    return {
      decisionId: String(row.id),
      companyId: String(row.companyId),
      documentIdentityId: String(row.documentIdentityId),
      decisionVersion: Number(row.decisionVersion),
      status: row.status as ActiveRevisionDecisionRecord["status"],
      selectedMembershipIds: selections.map((item: { membershipId: string }) => item.membershipId),
      actorUserId: String(row.actorUserId),
      reason: String(row.reason),
      decidedAt: new Date(row.decidedAt as string | Date).toISOString(),
      evidenceClaimIds: evidence.map((item: { claimId: string }) => item.claimId),
      supersedesDecisionId: (row.supersedesDecisionId as string | null) ?? null,
      blockedReason: (row.blockedReason as string | null) ?? null,
      comparisonScopeId: (row.comparisonScopeId as string | null) ?? null,
      limitations: (row.limitations as string[] | null) ?? [],
    };
  }

  async saveRun(record: ComparisonRunRecord): Promise<void> {
    await prisma.comparisonRun.upsert({
      where: { id: record.comparisonRunId },
      create: {
        id: record.comparisonRunId,
        companyId: record.companyId,
        comparisonScopeId: record.comparisonScopeId,
        engineVersion: record.engineVersion,
        matcherVersion: record.matcherVersion,
        projectorVersion: record.projectorVersion,
        materializerVersions: record.materializerVersions as never,
        artifactStates: record.artifactStates as never,
        claimCount: record.claimCount,
        matchCount: record.matchCount,
        findingCount: record.findingCount,
        newFindingCount: record.newFindingCount,
        reproducedFindingCount: record.reproducedFindingCount,
        notReproducedFindingCount: record.notReproducedFindingCount,
        truncated: record.truncated,
        limitations: [...record.limitations],
        startedAt: new Date(record.startedAt),
        finishedAt: new Date(record.finishedAt),
        status: record.status as never,
        blockReasons: [...record.blockReasons],
        actorUserId: record.actorUserId,
        inputDigest: record.inputDigest,
      },
      update: {
        claimCount: record.claimCount,
        matchCount: record.matchCount,
        findingCount: record.findingCount,
        newFindingCount: record.newFindingCount,
        reproducedFindingCount: record.reproducedFindingCount,
        notReproducedFindingCount: record.notReproducedFindingCount,
        truncated: record.truncated,
        limitations: [...record.limitations],
        finishedAt: new Date(record.finishedAt),
        status: record.status as never,
        blockReasons: [...record.blockReasons],
        inputDigest: record.inputDigest,
      },
    });
  }

  async findRun(input: { companyId: string; comparisonRunId: string }): Promise<ComparisonRunRecord | null> {
    const row = await prisma.comparisonRun.findFirst({ where: { id: input.comparisonRunId, companyId: input.companyId } });
    return row ? fromRunRow(row as ClaimRow) : null;
  }

  async listRuns(input: { companyId: string; comparisonScopeId?: string; limit: number }): Promise<ComparisonRunRecord[]> {
    const rows = await prisma.comparisonRun.findMany({
      where: { companyId: input.companyId, ...(input.comparisonScopeId ? { comparisonScopeId: input.comparisonScopeId } : {}) },
      orderBy: [{ startedAt: "desc" }, { id: "asc" }],
      take: Math.max(1, Math.min(input.limit, 100)),
    });
    return rows.map((row: ClaimRow) => fromRunRow(row));
  }
}

function artifactIdScope(artifactIds: string[] | null): Record<string, unknown> {
  return artifactIds ? { sourceArtifactId: { in: artifactIds } } : {};
}

function fromScopeRow(row: ClaimRow): ComparisonScopeRecord {
  return {
    comparisonScopeId: String(row.id),
    companyId: String(row.companyId),
    name: String(row.name),
    context: String(row.context),
    projectKey: (row.projectKey as string | null) ?? null,
    revisionPolicy: String(row.revisionPolicy),
    predicateFilters: (row.predicateFilters as string[] | null) ?? [],
    roleFilters: (row.roleFilters as string[] | null) ?? [],
    lineageCollapse: true,
    policyBounds: (row.policyBounds as Record<string, number> | null) ?? {},
    comparisonScopeClass: String(row.comparisonScopeClass),
    createdByUserId: String(row.createdByUserId),
    createdAt: new Date(row.createdAt as string | Date).toISOString(),
    updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
  };
}

function fromIdentityRow(row: ClaimRow, evidence: DocumentIdentityRecord["evidence"], fallback: DocumentIdentityRecord | null): DocumentIdentityRecord {
  return {
    documentIdentityId: String(row.id),
    companyId: String(row.companyId),
    kind: String(row.kind),
    label: String(row.label),
    observedFamilyKey: String(row.observedFamilyKey),
    confirmedIdentityKey: (row.confirmedIdentityKey as string | null) ?? null,
    identityBasis: row.identityBasis as DocumentIdentityRecord["identityBasis"],
    ambiguous: Boolean(row.ambiguous),
    evidence: evidence.length ? evidence : (fallback?.evidence ?? []),
    limitations: (row.limitations as string[] | null) ?? [],
    resolverVersion: String(row.resolverVersion),
    createdAt: new Date(row.createdAt as string | Date).toISOString(),
    updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
  };
}

function fromRunRow(row: ClaimRow): ComparisonRunRecord {
  return {
    comparisonRunId: String(row.id),
    companyId: String(row.companyId),
    comparisonScopeId: String(row.comparisonScopeId),
    engineVersion: String(row.engineVersion),
    matcherVersion: String(row.matcherVersion),
    projectorVersion: String(row.projectorVersion),
    materializerVersions: (row.materializerVersions as Record<string, string> | null) ?? {},
    artifactStates: (row.artifactStates as ComparisonRunRecord["artifactStates"] | null) ?? [],
    claimCount: Number(row.claimCount ?? 0),
    matchCount: Number(row.matchCount ?? 0),
    findingCount: Number(row.findingCount ?? 0),
    newFindingCount: Number(row.newFindingCount ?? 0),
    reproducedFindingCount: Number(row.reproducedFindingCount ?? 0),
    notReproducedFindingCount: Number(row.notReproducedFindingCount ?? 0),
    truncated: Boolean(row.truncated),
    limitations: (row.limitations as string[] | null) ?? [],
    startedAt: new Date(row.startedAt as string | Date).toISOString(),
    finishedAt: new Date(row.finishedAt as string | Date).toISOString(),
    status: row.status as ComparisonRunRecord["status"],
    blockReasons: (row.blockReasons as string[] | null) ?? [],
    actorUserId: String(row.actorUserId),
    inputDigest: String(row.inputDigest),
  };
}
