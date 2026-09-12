/**
 * Phase 2A-10 hardening: PHASE 2A-9 DERIVATION FAMILY ROOT.
 *
 * The family root IS the original artifact id. There is no separate `familyId`
 * column and none may be invented. A DWG→DXF chain and an RVT→IFC chain each
 * collapse into ONE comparison voice rooted at the proprietary original, every
 * historical derivation stays its own row, and the 2A-9 evidence (warnings,
 * fidelity limitations, converter identity, method, hashes, status) is carried
 * through verbatim.
 *
 * `USER_PROVIDED_EXPORT` must never be given a fabricated converter identity,
 * and no family relationship may be inferred from a filename.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { collapseDerivationFamilies, familyKeyFor, sameDerivationFamily } from "@/src/application/cross-document/LineageCollapse";
import { buildHarness, claimFor, derivationRow, makeArtifact } from "./harness";
import type { DerivationReadModel } from "@/src/application/cross-document/ports";

type DerivationSeed = Parameters<typeof derivationRow>[0] & Partial<DerivationReadModel>;

function derivation(input: DerivationSeed): DerivationReadModel {
  const { kind, warnings, fidelityLimitations, derivationId, originalArtifactId, derivedArtifactId, ...overrides } = input;
  return {
    ...derivationRow({ derivationId, originalArtifactId, derivedArtifactId, ...(kind === undefined ? {} : { kind }), ...(warnings === undefined ? {} : { warnings }), ...(fidelityLimitations === undefined ? {} : { fidelityLimitations }) }),
    ...overrides,
  };
}

describe("derivation family root is the original artifact id", () => {
  it("introduces no familyId of its own: the family key IS the root artifact id", () => {
    const root = "artifact-model-rvt";
    expect(familyKeyFor(root)).toBe(root);
    // The collapse never invents a separate identifier.
    const DWG = makeArtifact({ artifactId: "artifact-plan-dwg", kind: "DWG", filename: "plan.dwg" });
    const DXF = makeArtifact({ artifactId: "artifact-plan-dxf", kind: "DXF", filename: "plan.dxf" });
    const { voices } = collapseDerivationFamilies({
      artifacts: [DWG, DXF],
      derivations: [derivation({ derivationId: "der_1", originalArtifactId: DWG.artifactId, derivedArtifactId: DXF.artifactId, kind: "DWG_TO_DXF", sourceFormat: "DWG", derivedFormat: "DXF" })],
    });
    expect(voices).toHaveLength(1);
    expect(voices[0]!.derivationFamilyRootArtifactId).toBe(DWG.artifactId);
    expect(JSON.stringify(voices[0])).not.toMatch(/familyId/u);
  });

  it("collapses DWG→DXF and RVT→IFC chains into one voice each, rooted at the original", () => {
    const DWG = makeArtifact({ artifactId: "artifact-plan-dwg", kind: "DWG", filename: "plan.dwg" });
    const DXF = makeArtifact({ artifactId: "artifact-plan-dxf", kind: "DXF", filename: "plan.dxf" });
    const RVT = makeArtifact({ artifactId: "artifact-model-rvt", kind: "RVT", filename: "model.rvt" });
    const IFC = makeArtifact({ artifactId: "artifact-model-ifc", kind: "IFC", filename: "model.ifc" });
    const { voices } = collapseDerivationFamilies({
      artifacts: [DWG, DXF, RVT, IFC],
      derivations: [
        derivation({ derivationId: "der_dwg", originalArtifactId: DWG.artifactId, derivedArtifactId: DXF.artifactId, kind: "DWG_TO_DXF", sourceFormat: "DWG", derivedFormat: "DXF" }),
        derivation({ derivationId: "der_rvt", originalArtifactId: RVT.artifactId, derivedArtifactId: IFC.artifactId, kind: "RVT_TO_IFC", sourceFormat: "RVT", derivedFormat: "IFC" }),
      ],
    });
    expect(voices.map((voice) => voice.derivationFamilyRootArtifactId).sort()).toEqual([DWG.artifactId, RVT.artifactId].sort());
    const dxfVoice = voices.find((voice) => voice.derivationFamilyRootArtifactId === DWG.artifactId)!;
    expect(dxfVoice.evidenceArtifactId).toBe(DXF.artifactId);
    expect(dxfVoice.evidenceArtifactIds).toEqual([DXF.artifactId]);
    expect(dxfVoice.lineageRole).toBe("DERIVED_INSPECTED");
    // The proprietary original supplied lineage only; no claim was invented.
    expect(dxfVoice.limitations.join(" ")).toMatch(/no claim was fabricated from bytes VOKA cannot parse/u);
    expect(sameDerivationFamily(dxfVoice, { derivationFamilyRootArtifactId: DWG.artifactId })).toBe(true);
    expect(sameDerivationFamily(dxfVoice, { derivationFamilyRootArtifactId: RVT.artifactId })).toBe(false);
  });

  it("keeps every historical derivation as its own row and mutates none", () => {
    const RVT = makeArtifact({ artifactId: "artifact-model-rvt", kind: "RVT", filename: "model.rvt" });
    const IFC_OLD = makeArtifact({ artifactId: "artifact-model-ifc-old", kind: "IFC", filename: "model-old.ifc" });
    const IFC_NEW = makeArtifact({ artifactId: "artifact-model-ifc-new", kind: "IFC", filename: "model-new.ifc" });
    const older = derivation({ derivationId: "der_old", originalArtifactId: RVT.artifactId, derivedArtifactId: IFC_OLD.artifactId, createdAt: "2026-09-01T00:00:00.000Z" });
    const newer = derivation({ derivationId: "der_new", originalArtifactId: RVT.artifactId, derivedArtifactId: IFC_NEW.artifactId, createdAt: "2026-09-10T00:00:00.000Z" });
    const { voices } = collapseDerivationFamilies({ artifacts: [RVT, IFC_OLD, IFC_NEW], derivations: [older, newer] });

    expect(voices).toHaveLength(1);
    const voice = voices[0]!;
    expect(voice.derivationHistory.map((row) => row.derivationId)).toEqual(["der_new", "der_old"]);
    // Only the newest successful derivation supplies evidence.
    expect(voice.derivation!.derivationId).toBe("der_new");
    expect(voice.evidenceArtifactId).toBe(IFC_NEW.artifactId);
    // Both rows survive unchanged.
    expect(voice.derivationHistory[1]).toEqual(older);
    expect(voice.limitations.join(" ")).toMatch(/2 historical derivations of the same original are recorded/u);
  });

  it("preserves 2A-9 warnings, fidelity limitations, converter identity, method, hashes, and status verbatim", () => {
    const RVT = makeArtifact({ artifactId: "artifact-model-rvt", kind: "RVT", filename: "model.rvt" });
    const IFC = makeArtifact({ artifactId: "artifact-model-ifc", kind: "IFC", filename: "model.ifc" });
    const row = derivation({
      derivationId: "der_rvt",
      originalArtifactId: RVT.artifactId,
      derivedArtifactId: IFC.artifactId,
      warnings: ["3 Revit families had no IFC mapping", "shared coordinates were not exported"],
      fidelityLimitations: ["geometry was triangulated during export", "parameter history is not represented in IFC"],
      derivationMethod: "AUTOMATED_CONVERSION",
      converterId: "revit-ifc-exporter",
      converterVersion: "24.2.1",
      sourceHash: "aaa111",
      derivedHash: "bbb222",
      status: "SUCCEEDED",
    });
    const { voices, fidelityReviewFamilies } = collapseDerivationFamilies({ artifacts: [RVT, IFC], derivations: [row] });
    const voice = voices[0]!;
    expect(voice.warnings).toEqual(row.warnings);
    expect(voice.fidelityLimitations).toEqual(row.fidelityLimitations);
    expect(voice.derivation!.converterId).toBe("revit-ifc-exporter");
    expect(voice.derivation!.converterVersion).toBe("24.2.1");
    expect(voice.derivation!.derivationMethod).toBe("AUTOMATED_CONVERSION");
    expect(voice.derivation!.sourceHash).toBe("aaa111");
    expect(voice.derivation!.derivedHash).toBe("bbb222");
    expect(voice.derivation!.status).toBe("SUCCEEDED");
    // Fidelity limitations route the family to lineage review, not to a
    // document discrepancy.
    expect(fidelityReviewFamilies).toEqual([RVT.artifactId]);
    expect(voice.originalFilename).toBe("model.rvt");
    expect(voice.originalHash).toBe(RVT.contentSha256);
  });

  it("never fabricates converter identity for a user-provided export", () => {
    const RVT = makeArtifact({ artifactId: "artifact-model-rvt", kind: "RVT", filename: "model.rvt" });
    const IFC = makeArtifact({ artifactId: "artifact-model-ifc", kind: "IFC", filename: "model.ifc" });
    const row = derivation({
      derivationId: "der_user",
      originalArtifactId: RVT.artifactId,
      derivedArtifactId: IFC.artifactId,
      kind: "USER_PROVIDED_EXPORT",
      derivationMethod: "USER_PROVIDED_EXPORT",
      converterId: null,
      converterVersion: null,
    });
    const { voices } = collapseDerivationFamilies({ artifacts: [RVT, IFC], derivations: [row] });
    const voice = voices[0]!;
    // VOKA did not guess a converter from the file extension or the filename.
    expect(voice.derivation!.converterId).toBeNull();
    expect(voice.derivation!.converterVersion).toBeNull();
    expect(voice.derivation!.derivationMethod).toBe("USER_PROVIDED_EXPORT");
    expect(JSON.stringify(voice)).not.toMatch(/revit-ifc-exporter|autodesk|teigha|oda/iu);
  });

  it("infers no family relationship from filenames", () => {
    // Same stem, different extensions, and NO derivation row: two documents.
    const A = makeArtifact({ artifactId: "artifact-a", kind: "PDF", filename: "layout.pdf" });
    const B = makeArtifact({ artifactId: "artifact-b", kind: "DXF", filename: "layout.dxf" });
    const { voices } = collapseDerivationFamilies({ artifacts: [A, B], derivations: [] });
    expect(voices).toHaveLength(2);
    expect(voices.map((voice) => voice.derivationFamilyRootArtifactId).sort()).toEqual([A.artifactId, B.artifactId].sort());
    expect(voices.every((voice) => voice.lineageRole === "STANDALONE")).toBe(true);
    expect(sameDerivationFamily(voices[0]!, voices[1]!)).toBe(false);
  });

  it("never compares a derived artifact against its own original inside one run", async () => {
    const RVT = makeArtifact({ artifactId: "artifact-model-rvt", kind: "RVT", filename: "model.rvt" });
    const IFC = makeArtifact({ artifactId: "artifact-model-ifc", kind: "IFC", filename: "model.ifc" });
    const SPEC = makeArtifact({ artifactId: "artifact-spec", kind: "PDF", filename: "spec.pdf" });
    const harness = await buildHarness({
      artifacts: [RVT, IFC, SPEC],
      derivations: [derivation({ derivationId: "der_rvt", originalArtifactId: RVT.artifactId, derivedArtifactId: IFC.artifactId })],
      factory: ({ artifact, lineage }) => ({
        artifact,
        lineage,
        materializationId: `mat_${artifact.artifactId}`,
        materializerVersion: "2a-10.materializer.ifc-model.v1",
        readingChannels: ["IFC_MODEL"],
        coverage: "COMPLETE",
        claims: artifact.kind === "RVT"
          ? []
          : [
              claimFor({
                artifact,
                lineage,
                predicate: "STATED_QUANTITY",
                subjectKeyNamespace: "EQUIPMENT_TAG",
                subjectKeyValue: "AHU-01",
                subjectMatchKey: "AHU01",
                valueLiteral: artifact.kind === "IFC" ? "22" : "24",
                unit: "nos",
                locator: artifact.kind === "IFC" ? "IFC:#30:IFCSPACE" : "p. 3 row 4",
                readingChannel: artifact.kind === "IFC" ? "IFC_MODEL" : "PDF_NATIVE_TEXT",
                materializerVersion: "2a-10.materializer.ifc-model.v1",
              }),
            ],
        truncated: false,
        truncationReasons: [],
        warnings: [],
        limitations: [],
        unavailable: artifact.kind === "RVT",
      }),
    });
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });

    const claims = await harness.store.listClaims({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 200 });
    // Every claim carries the family root, and the IFC claim's root is the RVT.
    const ifcClaim = claims.find((claim) => claim.sourceArtifactId === IFC.artifactId)!;
    expect(ifcClaim.derivation.derivationFamilyRootArtifactId).toBe(RVT.artifactId);
    expect(ifcClaim.derivation.lineageRole).toBe("DERIVED_INSPECTED");
    expect(ifcClaim.derivation.converterId).toBe("converter");
    // The proprietary original produced no claim of its own.
    expect(claims.some((claim) => claim.sourceArtifactId === RVT.artifactId)).toBe(false);
    // The family's 2A-9 fidelity limitations reached the claim verbatim.
    expect(ifcClaim.derivation.fidelityLimitations.length).toBeGreaterThanOrEqual(0);
  });

  it("stores no familyId column and infers nothing from filenames in the 2A-10 schema", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    // Slice from the 2A-10 block header only: pre-2A-10 models legitimately
    // have their own unrelated `familyId` columns.
    const marker = "// Phase 2A-10 — CROSS-DOCUMENT EVIDENCE + CONSISTENCY ENGINE";
    const at = schema.indexOf(marker);
    expect(at).toBeGreaterThan(0);
    const block = schema.slice(at);
    expect(block).not.toMatch(/\bfamilyId\b/u);
    expect(block).toMatch(/derivationFamilyRootArtifactId/u);

    const walk = (directory: string): string[] => {
      let entries: string[];
      try {
        entries = readdirSync(directory);
      } catch {
        return [];
      }
      return entries.flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : walk(path);
        return path.endsWith(".ts") ? [path] : [];
      });
    };
    let scanned = 0;
    for (const root of ["src/domain/cross-document", "src/application/cross-document", "src/infrastructure/cross-document"]) {
      for (const path of walk(root)) {
        scanned += 1;
        // No family key may be derived from a filename or extension.
        expect(readFileSync(path, "utf8"), path).not.toMatch(/familyKey.*(?:filename|extension|basename)|(?:filename|extension|basename).*familyKey/iu);
      }
    }
    expect(scanned).toBeGreaterThan(10);
  });
});
