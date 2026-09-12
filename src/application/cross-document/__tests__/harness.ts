/**
 * Phase 2A-10 test harness.
 *
 * It builds REAL claims through the real `buildClaim` helper, drives the REAL
 * engine, and persists through the in-memory `CrossDocumentStore`. Only the
 * bytes layer is stubbed, because a comparison test must be deterministic and
 * fast; the byte layer has its own integration tests over real fixtures.
 */

import { createHash } from "node:crypto";
import { materializeArtifact } from "@/src/application/cross-document/materialization/DocumentMaterializer";
import { buildClaim, type ClaimDraftInput } from "@/src/application/cross-document/materialization/ClaimBuilder";
import type {
  ClockPort,
  ComparisonScopeArtifactRecord,
  DerivationReadModel,
  DerivationReaderPort,
  EvidenceMaterializationPort,
  IdPort,
  MaterializedArtifact,
  SourceArtifactReaderPort,
  SourceArtifactRef,
  VerifiedArtifactBytes,
} from "@/src/application/cross-document/ports";
import type { ComparisonDependencies } from "@/src/application/cross-document/ComparisonRunService";
import type { AcceptedArtifactEvidence } from "@/src/application/cross-document/materialization/DocumentMaterializer";
import { InMemoryCrossDocumentStore } from "@/src/infrastructure/cross-document/InMemoryCrossDocumentStore";

export const TEST_NOW = "2026-09-12T00:00:00.000Z";

export function makeArtifact(input: {
  artifactId: string;
  companyId?: string;
  kind?: string;
  filename?: string;
  context?: string;
}): SourceArtifactRef {
  const companyId = input.companyId ?? "company-1";
  const kind = input.kind ?? "PDF";
  const filename = input.filename ?? `${input.artifactId}.pdf`;
  return {
    artifactId: input.artifactId,
    companyId,
    originalFilename: filename,
    kind,
    mimeType: "application/octet-stream",
    contentSha256: createHash("sha256").update(`${companyId}:${input.artifactId}`, "utf8").digest("hex"),
    context: input.context ?? "ENGINEERING_TENDER",
    processingState: "READY",
    createdAt: TEST_NOW,
  };
}

export function fixedClock(now = TEST_NOW): ClockPort {
  return { now: () => now };
}

export function counterIds(prefixStart = 1): IdPort {
  let counter = prefixStart;
  return {
    next: (prefix: string) => {
      counter += 1;
      return `${prefix}_${String(counter).padStart(4, "0")}`;
    },
  };
}

export class MemoryArtifactReader implements SourceArtifactReaderPort {
  constructor(private readonly artifacts: readonly SourceArtifactRef[]) {}

  async listArtifacts(input: { companyId: string; artifactIds?: readonly string[]; limit: number }): Promise<SourceArtifactRef[]> {
    return this.artifacts
      .filter((artifact) => artifact.companyId === input.companyId)
      .filter((artifact) => (input.artifactIds ? input.artifactIds.includes(artifact.artifactId) : true))
      .slice(0, input.limit);
  }

  async findArtifact(input: { companyId: string; artifactId: string }): Promise<SourceArtifactRef | null> {
    return this.artifacts.find((artifact) => artifact.companyId === input.companyId && artifact.artifactId === input.artifactId) ?? null;
  }

  async readVerifiedBytes(input: { companyId: string; artifactId: string }): Promise<VerifiedArtifactBytes> {
    const artifact = await this.findArtifact(input);
    if (!artifact) return { status: "UNAVAILABLE", reason: "not found" };
    return { status: "OK", bytes: new Uint8Array(), sha256: artifact.contentSha256 };
  }
}

export class MemoryDerivationReader implements DerivationReaderPort {
  constructor(private readonly derivations: readonly DerivationReadModel[] = []) {}

  async listByOriginalArtifact(input: { companyId: string; originalArtifactId: string }): Promise<DerivationReadModel[]> {
    return this.derivations.filter((row) => row.companyId === input.companyId && row.originalArtifactId === input.originalArtifactId);
  }

  async listByDerivedArtifact(input: { companyId: string; derivedArtifactId: string }): Promise<DerivationReadModel[]> {
    return this.derivations.filter((row) => row.companyId === input.companyId && row.derivedArtifactId === input.derivedArtifactId);
  }

  async listForArtifacts(input: { companyId: string; artifactIds: readonly string[] }): Promise<DerivationReadModel[]> {
    return this.derivations.filter((row) => row.companyId === input.companyId && (input.artifactIds.includes(row.originalArtifactId) || (row.derivedArtifactId ? input.artifactIds.includes(row.derivedArtifactId) : false)));
  }
}

export type ChannelPlan = Record<string, { evidence: AcceptedArtifactEvidence; materializerVersion?: string }>;

/** A materialization factory, so a test can drive the engine with exact claims. */
export type MaterializationFactory = (input: {
  artifact: SourceArtifactRef;
  lineage: MaterializedArtifact["lineage"];
  runId: string | null;
  createdAt: string;
}) => MaterializedArtifact;

export class FactoryMaterialization implements EvidenceMaterializationPort {
  constructor(private readonly factory: MaterializationFactory) {}

  async materialize(input: Parameters<EvidenceMaterializationPort["materialize"]>[0]): Promise<MaterializedArtifact> {
    return this.factory(input);
  }
}

/**
 * Deterministic byte-layer stub: each artifact resolves to a channel plan, and
 * the REAL dispatcher turns it into claims.
 */
export class StubMaterialization implements EvidenceMaterializationPort {
  constructor(private readonly plans: ChannelPlan | ((artifactId: string) => AcceptedArtifactEvidence | null)) {}

  async materialize(input: Parameters<EvidenceMaterializationPort["materialize"]>[0]): Promise<MaterializedArtifact> {
    const evidence = typeof this.plans === "function" ? this.plans(input.artifact.artifactId) : (this.plans[input.artifact.artifactId]?.evidence ?? null);
    if (!evidence) {
      return materializeArtifact({
        artifact: input.artifact,
        lineage: input.lineage,
        runId: input.runId,
        createdAt: input.createdAt,
        evidence: { kind: "UNAVAILABLE", reason: "no channel plan was supplied for this artifact" },
      });
    }
    return materializeArtifact({ artifact: input.artifact, lineage: input.lineage, runId: input.runId, createdAt: input.createdAt, evidence });
  }
}

/** Claim builder with sane defaults, so a test states only what it is about. */
export function claimFor(input: {
  artifact: SourceArtifactRef;
  lineage: MaterializedArtifact["lineage"];
  materializationId?: string;
  predicate: ClaimDraftInput["predicate"];
  subjectKeyNamespace: ClaimDraftInput["subjectKeyNamespace"];
  subjectKeyValue: string;
  subjectMatchKey?: string;
  valueLiteral: string;
  sourceSuppliedNumber?: number | null;
  unit?: string | null;
  quantityOrigin?: ClaimDraftInput["quantityOrigin"];
  locator?: string;
  pageNumber?: number | null;
  readingChannel?: ClaimDraftInput["readingChannel"];
  materializerVersion?: string;
  coverage?: ClaimDraftInput["coverage"];
  limitations?: readonly string[];
  subjectLabel?: string | null;
  observedRevisionLabel?: string | null;
}) {
  const unit = input.unit === undefined || input.unit === null ? null : input.unit;
  return buildClaim({
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: input.materializationId ?? `mat_for_${input.artifact.artifactId}`,
    runId: null,
    readingChannel: input.readingChannel ?? "PDF_NATIVE_TEXT",
    materializerVersion: input.materializerVersion ?? "2a-10.materializer.pdf-native.v1",
    coverage: input.coverage ?? "COMPLETE",
    createdAt: TEST_NOW,
    predicate: input.predicate,
    subjectKeyNamespace: input.subjectKeyNamespace,
    subjectKeyValue: input.subjectKeyValue,
    subjectMatchKey: input.subjectMatchKey ?? input.subjectKeyValue.toUpperCase().replace(/\s+/gu, ""),
    subjectKeyBasis: "SOURCE_IDENTIFIER",
    subjectLabel: input.subjectLabel ?? input.subjectKeyValue,
    valueLiteral: input.valueLiteral,
    sourceSuppliedNumber: input.sourceSuppliedNumber ?? null,
    unit: unit === null ? null : { unitLiteral: unit, unitDeclared: true, unitDimension: null },
    quantityOrigin: input.quantityOrigin ?? null,
    locator: input.locator ?? "p. 1",
    pageNumber: input.pageNumber ?? 1,
    reliability: "MEDIUM",
    limitations: input.limitations ?? [],
    observedRevisionLabel: input.observedRevisionLabel ?? null,
  });
}

/** A materialization whose claims are supplied directly, for tests that need one claim set. */
export function materializationOf(input: {
  artifact: SourceArtifactRef;
  lineage: MaterializedArtifact["lineage"];
  claims: MaterializedArtifact["claims"];
  coverage?: "COMPLETE" | "PARTIAL";
  unavailable?: boolean;
  warnings?: string[];
  limitations?: string[];
  materializerVersion?: string;
}): MaterializedArtifact {
  return {
    artifact: input.artifact,
    lineage: input.lineage,
    materializationId: `mat_for_${input.artifact.artifactId}`,
    materializerVersion: input.materializerVersion ?? "2a-10.materializer.pdf-native.v1",
    readingChannels: ["PDF_NATIVE_TEXT"],
    coverage: input.coverage ?? "COMPLETE",
    claims: input.claims,
    truncated: input.coverage === "PARTIAL",
    truncationReasons: input.coverage === "PARTIAL" ? ["the accepted inspection was truncated"] : [],
    warnings: input.warnings ?? [],
    limitations: input.limitations ?? [],
    unavailable: input.unavailable ?? false,
  };
}

export type Harness = {
  store: InMemoryCrossDocumentStore;
  dependencies: ComparisonDependencies;
  artifacts: SourceArtifactRef[];
  scopeId: string;
};

/** Builds a scope over the supplied artifacts and registers its memberships. */
export async function buildHarness(input: {
  artifacts: readonly SourceArtifactRef[];
  evidence?: ChannelPlan | ((artifactId: string) => AcceptedArtifactEvidence | null);
  factory?: MaterializationFactory;
  derivations?: readonly DerivationReadModel[];
  revisionPolicy?: string;
  roles?: Record<string, ComparisonScopeArtifactRecord["documentRole"]>;
  materializerVersion?: string;
}): Promise<Harness> {
  const store = new InMemoryCrossDocumentStore();
  const scopeId = "scope_test_0001";
  await store.createScope({
    comparisonScopeId: scopeId,
    companyId: "company-1",
    name: "Tender package",
    context: "ENGINEERING_TENDER",
    projectKey: null,
    revisionPolicy: input.revisionPolicy ?? "ACTIVE_ONLY",
    predicateFilters: [],
    roleFilters: [],
    lineageCollapse: true,
    policyBounds: {},
    comparisonScopeClass: "CROSS_DOCUMENT_EVIDENCE",
    createdByUserId: "user-1",
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
  for (const artifact of input.artifacts) {
    await store.addScopeArtifact({
      comparisonScopeId: scopeId,
      companyId: "company-1",
      artifactId: artifact.artifactId,
      documentRole: input.roles?.[artifact.artifactId] ?? "UNKNOWN",
      documentRoleSource: "USER_DECLARED",
      roleDeclaredByUserId: "user-1",
      activeRevisionDecisionId: null,
      addedAt: TEST_NOW,
    });
  }
  const dependencies: ComparisonDependencies = {
    store,
    artifacts: new MemoryArtifactReader(input.artifacts),
    derivations: new MemoryDerivationReader(input.derivations ?? []),
    materialization: input.factory
      ? new FactoryMaterialization(input.factory)
      : new StubMaterialization(input.evidence ?? (() => null)),
    clock: fixedClock(),
    ids: counterIds(),
  };
  return { store, dependencies, artifacts: [...input.artifacts], scopeId };
}

export function standaloneLineage(artifact: SourceArtifactRef) {
  return { derivationFamilyRootArtifactId: artifact.artifactId, lineageRole: "STANDALONE" as const, derivation: null };
}

export function derivedLineage(artifact: SourceArtifactRef, familyRoot: string, derivation: DerivationReadModel) {
  return {
    derivationFamilyRootArtifactId: familyRoot,
    lineageRole: (derivation.originalArtifactId === artifact.artifactId ? "ORIGINAL_PROPRIETARY" : "DERIVED_INSPECTED") as "ORIGINAL_PROPRIETARY" | "DERIVED_INSPECTED",
    derivation,
  };
}

export function derivationRow(input: {
  derivationId: string;
  originalArtifactId: string;
  derivedArtifactId: string;
  warnings?: string[];
  fidelityLimitations?: string[];
  kind?: string;
}): DerivationReadModel {
  return {
    derivationId: input.derivationId,
    companyId: "company-1",
    originalArtifactId: input.originalArtifactId,
    derivedArtifactId: input.derivedArtifactId,
    derivationKind: input.kind ?? "RVT_TO_IFC",
    derivationMethod: "AUTOMATED_CONVERSION",
    sourceFormat: "RVT",
    derivedFormat: "IFC",
    sourceHash: "source-hash",
    derivedHash: "derived-hash",
    converterId: "converter",
    converterVersion: "1.0",
    warnings: input.warnings ?? [],
    fidelityLimitations: input.fidelityLimitations ?? [],
    status: "SUCCEEDED",
    optionsFingerprint: "options",
    createdAt: TEST_NOW,
    completedAt: TEST_NOW,
  };
}
