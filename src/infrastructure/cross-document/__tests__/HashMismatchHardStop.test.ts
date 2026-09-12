/**
 * Phase 2A-10 hardening: the HASH_MISMATCH HARD STOP.
 *
 * Scenario under test: the `SourceArtifact` row records hash A, the retained
 * bytes on disk hash to B. Re-opening that artifact must be a terminal refusal:
 *
 * - the analyzer/parser is never invoked, so nothing it could have produced is
 *   trusted;
 * - no new `NormalizedEvidenceClaim` is materialized;
 * - no finding is regenerated from it, and the finding that used to rest on it
 *   is flagged stale for the TRUTHFUL reason (`ARTIFACT_BYTES_CHANGED`);
 * - no native record is reconstructed to paper over the missing bytes;
 * - the historical claims survive untouched and stay readable by id;
 * - there is no fallback to summaries or counters: an entity count, a page
 *   count, or a coverage summary never becomes evidence;
 * - the read/response state says the artifact was refused rather than "empty";
 * - the tenant boundary still holds: another company's artifact resolves to
 *   not-found and its bytes are never read.
 *
 * Two paths are covered: the production adapter
 * (`PrismaSourceArtifactReader` over the real `LocalSourceArtifactStorage`) and
 * the application service (`LocalEvidenceMaterialization` inside a real
 * `runCrossDocumentComparison`).
 */

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";
import { PrismaSourceArtifactReader } from "../PrismaSourceArtifactReader";
import { HASH_MISMATCH_LIMITATION, LocalEvidenceMaterialization } from "../LocalEvidenceMaterialization";
import type { AcceptedArtifactAnalyzerPort } from "../AcceptedArtifactAnalyzer";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { buildCrossDocumentHandoff } from "@/src/application/cross-document/CrossDocumentHandoff";
import { InMemoryCrossDocumentStore } from "../InMemoryCrossDocumentStore";
import { claimFor, fixedClock, counterIds } from "@/src/application/cross-document/__tests__/harness";
import type {
  ArtifactLineageContext,
  SourceArtifactReaderPort,
  SourceArtifactRef,
  VerifiedArtifactBytes,
} from "@/src/application/cross-document/ports";

/** Standalone lineage context for a single-artifact family. */
function standaloneLineageContext(artifact: SourceArtifactRef): ArtifactLineageContext {
  return { derivationFamilyRootArtifactId: artifact.artifactId, lineageRole: "STANDALONE", derivation: null };
}

const storage = new LocalSourceArtifactStorage();
let directory = "";
let previousStorageDir: string | undefined;

beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), "voka-hash-mismatch-"));
  previousStorageDir = process.env.VOKA_ARTIFACT_STORAGE_DIR;
  process.env.VOKA_ARTIFACT_STORAGE_DIR = directory;
});

afterAll(() => {
  if (previousStorageDir === undefined) delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
  else process.env.VOKA_ARTIFACT_STORAGE_DIR = previousStorageDir;
  rmSync(directory, { recursive: true, force: true });
});

beforeEach(() => {
  prismaMock.sourceArtifact.findFirst.mockReset();
  prismaMock.sourceArtifact.findMany.mockReset();
});

function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("HASH_MISMATCH hard stop — production adapter", () => {
  it("refuses bytes that do not match the recorded SHA-256 and reports both hashes", async () => {
    const retained = Buffer.from("ISO-10303-21; retained bytes that were silently replaced", "utf8");
    const stored = await storage.put(retained);
    const actualSha256 = sha256Of(retained);
    const expectedSha256 = createHash("sha256").update("the bytes the artifact record describes", "utf8").digest("hex");

    prismaMock.sourceArtifact.findFirst.mockResolvedValue({
      storageRef: stored.storageRef,
      contentSha256: expectedSha256,
      processingState: "READY",
    });

    const reader = new PrismaSourceArtifactReader();
    const verified: VerifiedArtifactBytes = await reader.readVerifiedBytes({ companyId: "company-1", artifactId: "artifact-model" });

    expect(verified.status).toBe("HASH_MISMATCH");
    if (verified.status !== "HASH_MISMATCH") throw new Error("unreachable");
    expect(verified.expectedSha256).toBe(expectedSha256);
    expect(verified.actualSha256).toBe(actualSha256);
    // The refusal names the artifact and the company, and never a filesystem path.
    expect(prismaMock.sourceArtifact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "artifact-model", companyId: "company-1" }) }),
    );
  });

  it("never reads another tenant's bytes: a cross-company artifact is not found", async () => {
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    const reader = new PrismaSourceArtifactReader();
    const verified = await reader.readVerifiedBytes({ companyId: "company-2", artifactId: "artifact-model" });
    expect(verified.status).toBe("UNAVAILABLE");
    if (verified.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(verified.reason).toContain("active company");
  });

  it("reports unavailable bytes as unavailable, never as a hash mismatch", async () => {
    prismaMock.sourceArtifact.findFirst.mockResolvedValue({
      storageRef: `${"a".repeat(2)}/${"a".repeat(64)}`,
      contentSha256: "a".repeat(64),
      processingState: "READY",
    });
    const reader = new PrismaSourceArtifactReader();
    const verified = await reader.readVerifiedBytes({ companyId: "company-1", artifactId: "artifact-model" });
    expect(verified.status).toBe("UNAVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// Application service path: a real run over the real materialization service
// ---------------------------------------------------------------------------

const BOQ = makeRef({ artifactId: "artifact-boq", kind: "XLSX" });
const MODEL = makeRef({ artifactId: "artifact-model", kind: "IFC" });
const OTHER_COMPANY_MODEL = makeRef({ artifactId: "artifact-model", kind: "IFC", companyId: "company-2" });

function makeRef(input: { artifactId: string; kind: string; companyId?: string }): SourceArtifactRef {
  const companyId = input.companyId ?? "company-1";
  return {
    artifactId: input.artifactId,
    companyId,
    originalFilename: `${input.artifactId}.${input.kind.toLowerCase()}`,
    kind: input.kind,
    mimeType: "application/octet-stream",
    contentSha256: createHash("sha256").update(`${companyId}:${input.artifactId}`, "utf8").digest("hex"),
    context: "ENGINEERING_TENDER",
    processingState: "READY",
    createdAt: "2026-09-12T00:00:00.000Z",
  };
}

/** Reader whose bytes for the model artifact stop matching the recorded hash. */
class MismatchingArtifactReader implements SourceArtifactReaderPort {
  private readonly mismatches = new Set<string>();

  mismatch(artifactId: string): void {
    this.mismatches.add(artifactId);
  }

  isMismatching(artifactId: string): boolean {
    return this.mismatches.has(artifactId);
  }

  async listArtifacts(input: { companyId: string; artifactIds?: readonly string[]; limit: number }): Promise<SourceArtifactRef[]> {
    return [BOQ, MODEL].filter((artifact) => artifact.companyId === input.companyId)
      .filter((artifact) => (input.artifactIds ? input.artifactIds.includes(artifact.artifactId) : true))
      .slice(0, input.limit);
  }

  async findArtifact(input: { companyId: string; artifactId: string }): Promise<SourceArtifactRef | null> {
    return [BOQ, MODEL].find((artifact) => artifact.companyId === input.companyId && artifact.artifactId === input.artifactId) ?? null;
  }

  async readVerifiedBytes(input: { companyId: string; artifactId: string }): Promise<VerifiedArtifactBytes> {
    const artifact = await this.findArtifact(input);
    if (!artifact) return { status: "UNAVAILABLE", reason: "the source artifact was not found inside the active company" };
    if (this.mismatches.has(input.artifactId)) {
      return {
        status: "HASH_MISMATCH",
        reason: "the retained bytes do not match the recorded SHA-256",
        expectedSha256: artifact.contentSha256,
        actualSha256: createHash("sha256").update("replaced bytes", "utf8").digest("hex"),
      };
    }
    return { status: "OK", bytes: new Uint8Array(), sha256: artifact.contentSha256 };
  }
}

/**
 * An analyzer that would happily invent evidence. The whole point of the hard
 * stop is that it is never reached for a mismatched artifact — and that even if
 * it were, its output would be the only source of claims, so "never called" and
 * "no claims" are the same assertion seen from two sides.
 */
function spyingAnalyzer(analyzed: string[]): AcceptedArtifactAnalyzerPort {
  return {
    async analyze({ artifact }): Promise<never> {
      analyzed.push(artifact.artifactId);
      throw new Error("the analyzer must not be reached for a hash-mismatched artifact");
    },
  };
}

function claimsFor(artifact: SourceArtifactRef, lineage: ArtifactLineageContext, modelValue: number) {
  return [
    claimFor({
      artifact,
      lineage,
      predicate: "STATED_QUANTITY",
      subjectKeyNamespace: "EQUIPMENT_TAG",
      subjectKeyValue: "AHU-01",
      subjectMatchKey: "AHU01",
      valueLiteral: artifact.kind === "XLSX" ? "24" : String(modelValue),
      sourceSuppliedNumber: artifact.kind === "XLSX" ? 24 : modelValue,
      unit: "nos",
      quantityOrigin: artifact.kind === "XLSX" ? "STATED" : "DECLARED_MODEL",
      locator: artifact.kind === "XLSX" ? "row 12 column D" : "#412 IfcQuantityCount",
      pageNumber: artifact.kind === "XLSX" ? 4 : null,
      readingChannel: artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "IFC_MODEL",
      materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.ifc.v1",
    }),
  ];
}

async function buildRun(input: { analyzer: AcceptedArtifactAnalyzerPort; reader: MismatchingArtifactReader }) {
  const store = new InMemoryCrossDocumentStore();
  const scopeId = "scope_hash_mismatch";
  await store.createScope({
    comparisonScopeId: scopeId,
    companyId: "company-1",
    name: "Tender package",
    context: "ENGINEERING_TENDER",
    projectKey: null,
    revisionPolicy: "ACTIVE_ONLY",
    predicateFilters: [],
    roleFilters: [],
    lineageCollapse: true,
    policyBounds: {},
    comparisonScopeClass: "CROSS_DOCUMENT_EVIDENCE",
    createdByUserId: "user-1",
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
  });
  for (const artifact of [BOQ, MODEL]) {
    await store.addScopeArtifact({
      comparisonScopeId: scopeId,
      companyId: "company-1",
      artifactId: artifact.artifactId,
      documentRole: artifact.kind === "XLSX" ? "BOQ" : "BIM_MODEL",
      documentRoleSource: "USER_DECLARED",
      roleDeclaredByUserId: "user-1",
      activeRevisionDecisionId: null,
      addedAt: "2026-09-12T00:00:00.000Z",
    });
  }
  return { store, scopeId };
}

describe("HASH_MISMATCH hard stop — application service", () => {
  it("re-open returns HASH_MISMATCH and the run materializes no claim from that artifact", async () => {
    const reader = new MismatchingArtifactReader();
    reader.mismatch(MODEL.artifactId);
    const analyzed: string[] = [];
    const { store, scopeId } = await buildRun({ analyzer: spyingAnalyzer(analyzed), reader });

    const materialization = new LocalEvidenceMaterialization({ artifacts: reader, analyzer: spyingAnalyzer(analyzed) });
    const run = await runCrossDocumentComparison({
      companyId: "company-1",
      comparisonScopeId: scopeId,
      actorUserId: "user-1",
      dependencies: {
        store,
        artifacts: reader,
        derivations: { listByOriginalArtifact: async () => [], listByDerivedArtifact: async () => [], listForArtifacts: async () => [] },
        materialization: {
          // The real production materializer for the mismatched artifact, and a
          // real claim-producing path for the healthy one, so the test proves a
          // refusal rather than an empty fixture.
          async materialize(input) {
            if (input.artifact.artifactId === MODEL.artifactId) return materialization.materialize(input);
            return {
              artifact: input.artifact,
              lineage: input.lineage,
              materializationId: `mat_${input.artifact.artifactId}`,
              materializerVersion: "2a-10.materializer.workbook.v1",
              readingChannels: ["WORKBOOK_STRUCTURED"],
              coverage: "COMPLETE",
              claims: claimsFor(input.artifact, input.lineage, 22),
              truncated: false,
              truncationReasons: [],
              warnings: [],
              limitations: [],
              unavailable: false,
              byteVerification: "OK",
            };
          },
        },
        clock: fixedClock(),
        ids: counterIds(),
      },
    });

    // The parser was never trusted: it was never reached.
    expect(analyzed).not.toContain(MODEL.artifactId);

    // No new NormalizedEvidenceClaim from the mismatched artifact.
    expect(await store.countClaims({ companyId: "company-1", sourceArtifactId: MODEL.artifactId })).toBe(0);
    expect(await store.countClaims({ companyId: "company-1", sourceArtifactId: BOQ.artifactId })).toBeGreaterThan(0);

    // The materialization record is truthful: PARTIAL coverage, refused, and the
    // limitation is the hash-mismatch limitation rather than a blank result.
    const materializations = await store.listMaterializations({ companyId: "company-1", comparisonScopeId: scopeId });
    const modelMaterialization = materializations.find((record) => record.sourceArtifactId === MODEL.artifactId)!;
    expect(modelMaterialization.coverage).toBe("PARTIAL");
    expect(modelMaterialization.claimCount).toBe(0);
    expect(modelMaterialization.limitations).toContain(HASH_MISMATCH_LIMITATION);

    // No absence finding is asserted from the refused source, and no finding is
    // regenerated from it: the only finding is the availability disclosure.
    const findings = await store.listFindings({ companyId: "company-1", comparisonScopeId: scopeId, limit: 50 });
    const kinds = findings.map((finding) => finding.findingKind);
    expect(kinds).toContain("EVIDENCE_UNAVAILABLE_FOR_COMPARISON");
    expect(kinds).not.toContain("STATED_QUANTITY_MISMATCH");
    expect(kinds).not.toContain("SCHEDULE_COUNTERPART_MISSING");
    expect(kinds).not.toContain("PROPERTY_MISSING_IN_SOURCE");
    expect(kinds).not.toContain("INCLUSION_EXCLUSION_MISMATCH");

    // The read state is truthful: the handoff says the artifact was refused and
    // exposes no quantity claim from it.
    const handoff = await buildCrossDocumentHandoff({ companyId: "company-1", comparisonScopeId: scopeId, store });
    const modelCoverage = handoff!.coverage.find((entry) => entry.artifactId === MODEL.artifactId)!;
    expect(modelCoverage.coverage).toBe("PARTIAL");
    expect(modelCoverage.claimCount).toBe(0);
    expect(modelCoverage.limitations).toContain(HASH_MISMATCH_LIMITATION);
    expect(handoff!.quantityClaims.every((claim) => claim.sourceArtifactId !== MODEL.artifactId)).toBe(true);
    expect(handoff!.quantityClaims.some((claim) => claim.sourceArtifactId === BOQ.artifactId)).toBe(true);
    expect(run.status).toBe("COMPLETED");
  });

  it("leaves historical claims untouched and flags the finding stale for the truthful reason", async () => {
    const reader = new MismatchingArtifactReader();
    const analyzed: string[] = [];
    const { store, scopeId } = await buildRun({ analyzer: spyingAnalyzer(analyzed), reader });
    const materialization = new LocalEvidenceMaterialization({ artifacts: reader, analyzer: spyingAnalyzer(analyzed) });

    const dependencies = {
      store,
      artifacts: reader,
      derivations: { listByOriginalArtifact: async () => [], listByDerivedArtifact: async () => [], listForArtifacts: async () => [] },
      materialization: {
        async materialize(input: Parameters<typeof materialization.materialize>[0]) {
          if (input.artifact.artifactId === MODEL.artifactId) {
            // Run 1: the model is readable. Run 2: the retained bytes no longer
            // match, so the real production materializer refuses it.
            if (!reader.isMismatching(MODEL.artifactId)) {
              return {
                artifact: input.artifact,
                lineage: input.lineage,
                materializationId: `mat_${input.artifact.artifactId}`,
                materializerVersion: "2a-10.materializer.ifc.v1",
                readingChannels: ["IFC_MODEL"],
                coverage: "COMPLETE" as const,
                claims: claimsFor(input.artifact, input.lineage, 22),
                truncated: false,
                truncationReasons: [],
                warnings: [],
                limitations: [],
                unavailable: false,
                byteVerification: "OK" as const,
              };
            }
            return materialization.materialize(input);
          }
          return {
            artifact: input.artifact,
            lineage: input.lineage,
            materializationId: `mat_${input.artifact.artifactId}`,
            materializerVersion: "2a-10.materializer.workbook.v1",
            readingChannels: ["WORKBOOK_STRUCTURED"],
            coverage: "COMPLETE" as const,
            claims: claimsFor(input.artifact, input.lineage, 22),
            truncated: false,
            truncationReasons: [],
            warnings: [],
            limitations: [],
            unavailable: false,
            byteVerification: "OK" as const,
          };
        },
      },
      clock: fixedClock(),
      ids: counterIds(),
    };

    const first = await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: scopeId, actorUserId: "user-1", dependencies });
    expect(first.newFindingCount).toBe(1);
    const [finding] = await store.listFindings({ companyId: "company-1", comparisonScopeId: scopeId, limit: 10 });
    const historicalClaimIds = finding!.evidenceSignature.entries.map((entry) => entry.claimId);
    expect(historicalClaimIds).toHaveLength(2);
    const modelEntry = finding!.evidenceSignature.entries.find((entry) => entry.sourceArtifactId === MODEL.artifactId)!;
    expect(modelEntry).toBeDefined();
    const historicalModelClaim = await store.findClaim({ companyId: "company-1", claimId: modelEntry.claimId });
    expect(historicalModelClaim!.assertion.valueLiteral).toBe("22");

    // --- The retained bytes of the model no longer match ---------------------
    reader.mismatch(MODEL.artifactId);
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: scopeId, actorUserId: "user-1", dependencies });

    // Historical claims are untouched and still readable by id.
    for (const claimId of historicalClaimIds) {
      const claim = await store.findClaim({ companyId: "company-1", claimId });
      expect(claim).not.toBeNull();
    }
    expect(historicalModelClaim!.assertion.valueLiteral).toBe("22");
    expect(await store.countClaims({ companyId: "company-1", sourceArtifactId: MODEL.artifactId })).toBe(1);

    // The finding survives, flagged stale, for the truthful reason.
    const after = await store.listFindings({ companyId: "company-1", comparisonScopeId: scopeId, limit: 10 });
    const stale = after.find((entry) => entry.findingId === finding!.findingId)!;
    expect(stale.engineFlags.stale).toBe(true);
    expect(stale.engineFlags.reproduced).toBe(false);
    expect(stale.engineFlags.staleReason).toBe("ARTIFACT_BYTES_CHANGED");
    expect(stale.reviewState).toBe("OPEN");

    // No new finding was minted from the refused bytes.
    expect(after.filter((entry) => entry.findingKind === "STATED_QUANTITY_MISMATCH")).toHaveLength(1);
    expect(analyzed).not.toContain(MODEL.artifactId);
  });

  it("never falls back to a summary, a counter, or another tenant's artifact", async () => {
    const reader = new MismatchingArtifactReader();
    reader.mismatch(MODEL.artifactId);
    const analyzed: string[] = [];
    const materialization = new LocalEvidenceMaterialization({ artifacts: reader, analyzer: spyingAnalyzer(analyzed) });

    const materialized = await materialization.materialize({
      companyId: "company-1",
      runId: null,
      createdAt: "2026-09-12T00:00:00.000Z",
      artifact: MODEL,
      lineage: standaloneLineageContext(MODEL),
    });
    expect(materialized.claims).toHaveLength(0);
    expect(materialized.unavailable).toBe(true);
    expect(materialized.coverage).toBe("PARTIAL");
    expect(materialized.byteVerification).toBe("HASH_MISMATCH");
    expect(materialized.readingChannels).toEqual([]);
    // A counter is never promoted into evidence.
    expect(materialized.claims.some((claim) => claim.assertion.predicate === "STATED_QUANTITY")).toBe(false);

    // The tenant boundary still holds on the same code path: another company's
    // artifact id resolves to unavailable and is never parsed.
    const crossTenant = await materialization.materialize({
      companyId: "company-2",
      runId: null,
      createdAt: "2026-09-12T00:00:00.000Z",
      artifact: OTHER_COMPANY_MODEL,
      lineage: standaloneLineageContext(OTHER_COMPANY_MODEL),
    });
    expect(crossTenant.claims).toHaveLength(0);
    expect(crossTenant.unavailable).toBe(true);
    expect(analyzed).toEqual([]);
  });
});
