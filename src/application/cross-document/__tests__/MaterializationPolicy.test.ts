/**
 * Phase 2A-10 numeric and channel policy, proven over the real dispatcher and
 * the real accepted analyzers.
 *
 * The inviolable rules these tests protect:
 * - a PDF that writes "24" stated a LITERAL, and VOKA never persists 24 as the
 *   source's numeric view;
 * - a native reading and an OCR reading are separate claim generations and are
 *   never merged into one claim;
 * - drawing entity/dimension evidence never becomes a quantity claim;
 * - an IFC quantity is DECLARED MODEL evidence, and only then may a numeric
 *   view be persisted;
 * - an unreadable artifact yields no claim at all, plus an explicit limitation.
 */

import { describe, expect, it } from "vitest";
import { materializeArtifact } from "@/src/application/cross-document/materialization/DocumentMaterializer";
import type { AcceptedArtifactEvidence } from "@/src/application/cross-document/materialization/DocumentMaterializer";
import type { ArtifactPage, ObservedFact } from "@/src/domain/source-artifact";
import { analyzeDxfBytes } from "@/src/infrastructure/source-artifacts/dxf";
import { analyzeIfcBytes } from "@/src/infrastructure/source-artifacts/ifc";
import { fullDrawingBytes } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/dxfFixtures";
import { fullIfcBytes } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/ifcFixtures";
import { makeArtifact, standaloneLineage, TEST_NOW } from "./harness";

function observation(input: {
  type: ObservedFact["type"];
  value: string;
  lineNumber?: number;
  locator?: string;
  ocr?: boolean;
}): ObservedFact {
  const locator = input.locator ?? "page 3, line 12";
  return {
    type: input.type,
    value: input.value,
    status: "OBSERVED_NOT_APPROVED",
    pageNumber: 3,
    attribution: "PAGE_TREE",
    reliability: "MEDIUM",
    evidence: { snippet: input.value, locator, lineNumber: input.lineNumber ?? 12 },
    limitations: [],
    ...(input.ocr ? { origin: { textSource: "OCR" as const, engineId: "fixture-engine" } } : {}),
  };
}

const PAGE: ArtifactPage = { pageNumber: 3, text: "AHU-01  24 nos", characterCount: 15 };

function pdfEvidence(input: { native: ObservedFact[]; ocr: ObservedFact[] }): AcceptedArtifactEvidence {
  return {
    kind: "PDF",
    pages: [PAGE],
    nativeObservations: input.native,
    ocrObservations: input.ocr,
    ocrEngines: input.ocr.length ? ["fixture-engine"] : [],
    documentLimitations: [],
    truncated: false,
  };
}

describe("materialization policy", () => {
  it("keeps a PDF literal a literal and never persists it as the source numeric view", () => {
    const artifact = makeArtifact({ artifactId: "artifact-pdf", kind: "PDF" });
    const material = materializeArtifact({
      artifact,
      lineage: standaloneLineage(artifact),
      runId: "run-1",
      createdAt: TEST_NOW,
      evidence: pdfEvidence({
        native: [
          observation({ type: "EQUIPMENT_TAG", value: "AHU-01", lineNumber: 12 }),
          observation({ type: "QUANTITY", value: "24", lineNumber: 12 }),
          observation({ type: "UNIT", value: "nos", lineNumber: 12 }),
        ],
        ocr: [],
      }),
    });
    const quantity = material.claims.find((claim) => claim.assertion.predicate === "STATED_QUANTITY");
    expect(quantity).toBeDefined();
    expect(quantity!.assertion.valueLiteral).toBe("24");
    expect(quantity!.assertion.valueNumber).toBeNull();
    expect(quantity!.assertion.valueNumberOrigin).toBeNull();
    expect(quantity!.assertion.quantityOrigin).toBe("STATED");
    // The engine may read the literal ephemerally; nothing numeric is persisted.
    expect(typeof quantity!.assertion.valueLiteral).toBe("string");
  });

  it("keeps a native reading and an OCR reading as separate claim generations", () => {
    const artifact = makeArtifact({ artifactId: "artifact-ocr", kind: "PDF" });
    const nativeQuantity = observation({ type: "QUANTITY", value: "24", lineNumber: 12 });
    const ocrQuantity = observation({ type: "QUANTITY", value: "2A", lineNumber: 12, ocr: true });
    const material = materializeArtifact({
      artifact,
      lineage: standaloneLineage(artifact),
      runId: "run-1",
      createdAt: TEST_NOW,
      evidence: pdfEvidence({ native: [nativeQuantity], ocr: [ocrQuantity] }),
    });
    const quantities = material.claims.filter((claim) => claim.assertion.predicate === "STATED_QUANTITY");
    const channels = [...new Set(quantities.map((claim) => claim.readingChannel))].sort();
    expect(channels).toEqual(["PDF_NATIVE_TEXT", "PDF_OCR_TEXT"]);
    expect(new Set(quantities.map((claim) => claim.claimId)).size).toBe(quantities.length);
    const ocrClaim = quantities.find((claim) => claim.readingChannel === "PDF_OCR_TEXT")!;
    // The OCR reading is disclosed as OCR and never presented as hidden native text.
    expect(ocrClaim.context.sourceQualifiers).toContain("OCR_READING");
    expect(material.readingChannels).toContain("PDF_OCR_TEXT");
  });

  it("never turns DXF drawing evidence into a quantity", async () => {
    const artifact = makeArtifact({ artifactId: "artifact-dxf", kind: "DXF", filename: "drawing.dxf" });
    const analysis = analyzeDxfBytes(fullDrawingBytes(), { filename: "drawing.dxf", mimeType: "application/dxf" });
    const material = materializeArtifact({
      artifact,
      lineage: standaloneLineage(artifact),
      runId: "run-1",
      createdAt: TEST_NOW,
      evidence: { kind: "DXF", analysis },
    });
    expect(material.claims.every((claim) => claim.assertion.predicate !== "STATED_QUANTITY")).toBe(true);
    expect(material.claims.every((claim) => claim.assertion.quantityOrigin === null)).toBe(true);
    // Entity, insert, and symbol counts stayed ingestion metrics; the refusal is disclosed.
    expect(material.limitations.join(" ")).toMatch(/counts are ingestion metrics only/u);
  });

  it("materializes an IFC quantity as declared model evidence only", async () => {
    const artifact = makeArtifact({ artifactId: "artifact-ifc", kind: "IFC", filename: "model.ifc" });
    const analysis = analyzeIfcBytes(fullIfcBytes(), { filename: "model.ifc", mimeType: "application/octet-stream" });
    const material = materializeArtifact({
      artifact,
      lineage: standaloneLineage(artifact),
      runId: "run-1",
      createdAt: TEST_NOW,
      evidence: { kind: "IFC", analysis },
    });
    expect(material.claims.every((claim) => claim.assertion.predicate !== "STATED_QUANTITY")).toBe(true);
    for (const claim of material.claims) {
      // A quantity origin may only be DECLARED_MODEL on this channel, never STATED.
      expect([null, "DECLARED_MODEL"]).toContain(claim.assertion.quantityOrigin);
      if (claim.assertion.valueNumber !== null) {
        expect(claim.assertion.quantityOrigin).toBe("DECLARED_MODEL");
        expect(claim.assertion.valueNumberOrigin).toBe("SOURCE_SUPPLIED");
      }
      // A unit is declared only when the model itself carried a unit literal.
      if (claim.assertion.unitLiteral === null) expect(claim.assertion.unitDeclared).toBe(false);
    }
    expect(material.limitations.join(" ")).toMatch(/declared model evidence/u);
  });

  it("materializes no claim from an unreadable artifact and says so", () => {
    const artifact = makeArtifact({ artifactId: "artifact-rvt", kind: "RVT", filename: "model.rvt" });
    const material = materializeArtifact({
      artifact,
      lineage: { derivationFamilyRootArtifactId: artifact.artifactId, lineageRole: "ORIGINAL_PROPRIETARY", derivation: null },
      runId: "run-1",
      createdAt: TEST_NOW,
      evidence: { kind: "UNAVAILABLE", reason: "the retained bytes could not be verified" },
    });
    expect(material.claims).toHaveLength(0);
    expect(material.unavailable).toBe(true);
    expect(material.coverage).toBe("PARTIAL");
    expect(material.limitations.join(" ")).toContain("the retained bytes could not be verified");
  });
});
