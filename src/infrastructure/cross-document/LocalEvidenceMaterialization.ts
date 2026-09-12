/**
 * Phase 2A-10: the production materialization service.
 *
 * Governed re-open: the retained bytes come through the accepted storage
 * abstraction and are verified against the recorded SHA-256 BEFORE anything is
 * parsed. A mismatch is a hard stop — VOKA never compares bytes it cannot prove
 * are the bytes the artifact record describes, and it never fabricates a native
 * record to paper over a missing file.
 */

import { createHash } from "node:crypto";
import type { EvidenceMaterializationPort, MaterializedArtifact, SourceArtifactReaderPort } from "@/src/application/cross-document/ports";
import { materializeArtifact, type AcceptedArtifactEvidence } from "@/src/application/cross-document/materialization/DocumentMaterializer";
import { UNAVAILABLE_MATERIALIZER_VERSION, buildMaterializationId } from "@/src/domain/cross-document";
import type { AcceptedArtifactAnalyzerPort } from "./AcceptedArtifactAnalyzer";

export const HASH_MISMATCH_LIMITATION =
  "the retained bytes do not match the SHA-256 recorded for this artifact, so the comparison was refused for it rather than run over unverified content";

export const BYTES_UNAVAILABLE_LIMITATION =
  "the retained bytes of this artifact are not available, so it contributed no comparison evidence";

export type LocalEvidenceMaterializationDependencies = {
  artifacts: SourceArtifactReaderPort;
  analyzer: AcceptedArtifactAnalyzerPort;
};

export class LocalEvidenceMaterialization implements EvidenceMaterializationPort {
  constructor(private readonly dependencies: LocalEvidenceMaterializationDependencies) {}

  async materialize(input: Parameters<EvidenceMaterializationPort["materialize"]>[0]): Promise<MaterializedArtifact> {
    const { artifact, lineage, runId, createdAt, companyId } = input;
    const verified = await this.dependencies.artifacts.readVerifiedBytes({ companyId, artifactId: artifact.artifactId });

    let evidence: AcceptedArtifactEvidence;
    let readerLimitations: string[] = [];
    if (verified.status === "OK") {
      const actual = createHash("sha256").update(verified.bytes).digest("hex");
      if (verified.sha256 !== actual) {
        evidence = { kind: "UNAVAILABLE", reason: "the storage layer returned bytes whose digest differs from the digest it reported" };
        readerLimitations = [HASH_MISMATCH_LIMITATION];
      } else {
        try {
          evidence = await this.dependencies.analyzer.analyze({ artifact, bytes: verified.bytes });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "unknown analysis failure";
          evidence = { kind: "UNAVAILABLE", reason: `the accepted reading channels refused this artifact (${reason})` };
        }
      }
    } else if (verified.status === "HASH_MISMATCH") {
      evidence = {
        kind: "UNAVAILABLE",
        reason: `the retained bytes hash to ${verified.actualSha256.slice(0, 12)}… but the artifact record records ${verified.expectedSha256.slice(0, 12)}…`,
      };
      readerLimitations = [HASH_MISMATCH_LIMITATION];
    } else {
      evidence = { kind: "UNAVAILABLE", reason: verified.reason };
      readerLimitations = [BYTES_UNAVAILABLE_LIMITATION];
    }

    return materializeArtifact({ artifact, lineage, runId, createdAt, evidence, readerLimitations });
  }
}

/** Materialization identity for a coverage-only record, exposed for tests and diagnostics. */
export function unavailableMaterializationId(input: { companyId: string; artifactId: string; sha256: string }): string {
  return buildMaterializationId({
    companyId: input.companyId,
    sourceArtifactId: input.artifactId,
    artifactSha256: input.sha256,
    materializerVersion: UNAVAILABLE_MATERIALIZER_VERSION,
  });
}
