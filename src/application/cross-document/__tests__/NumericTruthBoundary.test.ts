/**
 * Phase 2A-10 hardening: THE NUMERIC TRUTH BOUNDARY AND COMMERCIAL EXCLUSION.
 *
 * A number a document merely *shows* is a literal. VOKA only persists a numeric
 * view when the source supplied the number itself: an XLSX quantity cell, or an
 * IFC `DECLARED_MODEL` quantity set. A PDF "24" is a visual string, so its
 * persisted numeric view stays null even though the engine may read the literal
 * ephemerally to answer a comparison.
 *
 * Equally important: no engineering claim, finding, subject key, or participant
 * may be derived from rates, amounts, currency codes, prices, or FX. Rate and
 * amount columns are read only so they can be deliberately *not* published.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runCrossDocumentComparison } from "@/src/application/cross-document/ComparisonRunService";
import { materializeArtifact } from "@/src/application/cross-document/materialization/DocumentMaterializer";
import { analyzeXlsxBytes } from "@/src/infrastructure/source-artifacts/spreadsheet/SpreadsheetInspectionAnalyzer";
import { analyzeDxfBytes } from "@/src/infrastructure/source-artifacts/dxf";
import { analyzeIfcBytes } from "@/src/infrastructure/source-artifacts/ifc";
import { boqWorkbook, buildWorkbook, currencyWorkbook } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/xlsxFixtures";
import { fullIfcBytes } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/ifcFixtures";
import { fullDrawingBytes } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/dxfFixtures";
import { buildHarness, claimFor, makeArtifact, standaloneLineage, TEST_NOW } from "./harness";
import { compareStatedQuantities, isFormulaBackedQuantity } from "@/src/application/cross-document/ValueComparison";
import { PROHIBITED_FINDING_KINDS, QUANTITY_ORIGINS } from "@/src/domain/cross-document";
import type { ObservedFact } from "@/src/domain/source-artifact";

const SPEC = makeArtifact({ artifactId: "artifact-spec", kind: "PDF", filename: "spec.pdf" });

/** A BOQ whose quantity cell is itself a formula, with the cached result kept. */
function formulaQuantityWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    sheet.getCell("A1").value = "Description";
    sheet.getCell("B1").value = "Qty";
    sheet.getCell("C1").value = "Unit";
    sheet.getCell(2, 1).value = "Cable tray";
    sheet.getCell(2, 2).value = { formula: "12*2", result: 24 };
    sheet.getCell(2, 3).value = "m";
  });
}

function observation(input: { type: ObservedFact["type"]; value: string; lineNumber?: number }): ObservedFact {
  return {
    type: input.type,
    value: input.value,
    status: "OBSERVED_NOT_APPROVED",
    pageNumber: 3,
    attribution: "PAGE_TREE",
    reliability: "MEDIUM",
    evidence: { snippet: input.value, locator: "page 3, line 12", lineNumber: input.lineNumber ?? 12 },
    limitations: [],
  };
}

describe("numeric truth boundary", () => {
  it("persists a source-supplied numeric view for a real workbook quantity cell", async () => {
    const artifact = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });
    const analysis = await analyzeXlsxBytes(await boqWorkbook(), { filename: "boq.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const material = materializeArtifact({ artifact, lineage: standaloneLineage(artifact), runId: "run-1", createdAt: TEST_NOW, evidence: { kind: "XLSX", analysis } });
    const stated = material.claims.filter((claim) => claim.assertion.quantityOrigin === "STATED");
    expect(stated.length).toBeGreaterThan(0);
    for (const claim of stated) {
      expect(claim.assertion.valueNumber).not.toBeNull();
      expect(claim.assertion.valueNumberOrigin).toBe("SOURCE_SUPPLIED");
    }
    // The quantity origin vocabulary is closed: nothing may claim an approved
    // quantity origin, because approval is not a 2A-10 concept.
    expect(QUANTITY_ORIGINS).toEqual(["STATED", "DECLARED_MODEL"]);
    for (const claim of material.claims) {
      expect(claim.assertion.quantityOrigin === null || QUANTITY_ORIGINS.includes(claim.assertion.quantityOrigin)).toBe(true);
    }
  });

  it("persists a numeric view for a declared model quantity set in real IFC", () => {
    const artifact = makeArtifact({ artifactId: "artifact-ifc", kind: "IFC", filename: "model.ifc" });
    const analysis = analyzeIfcBytes(fullIfcBytes(), { filename: "model.ifc", mimeType: "application/octet-stream" });
    const material = materializeArtifact({ artifact, lineage: standaloneLineage(artifact), runId: "run-1", createdAt: TEST_NOW, evidence: { kind: "IFC", analysis } });
    for (const claim of material.claims) {
      // Only declared model evidence may carry a numeric view here.
      expect([null, "DECLARED_MODEL"]).toContain(claim.assertion.quantityOrigin);
      if (claim.assertion.valueNumber !== null) {
        expect(claim.assertion.quantityOrigin).toBe("DECLARED_MODEL");
        expect(claim.assertion.valueNumberOrigin).toBe("SOURCE_SUPPLIED");
      }
      expect(claim.assertion.quantityOrigin).not.toBe("STATED");
      expect(["STATED", "DECLARED_MODEL", null]).toContain(claim.assertion.quantityOrigin);
    }
  });

  it("never presents a real DXF count as a stated quantity", () => {
    const artifact = makeArtifact({ artifactId: "artifact-dxf", kind: "DXF", filename: "drawing.dxf" });
    const analysis = analyzeDxfBytes(fullDrawingBytes(), { filename: "drawing.dxf", mimeType: "application/dxf" });
    const material = materializeArtifact({ artifact, lineage: standaloneLineage(artifact), runId: "run-1", createdAt: TEST_NOW, evidence: { kind: "DXF", analysis } });
    expect(material.claims.length).toBeGreaterThan(0);
    for (const claim of material.claims) {
      expect(claim.assertion.predicate).not.toBe("STATED_QUANTITY");
      expect(claim.assertion.quantityOrigin).not.toBe("STATED");
      expect(["STATED", "DECLARED_MODEL", null]).toContain(claim.assertion.quantityOrigin);
    }
  });

  it("keeps a native PDF numeric literal a literal in the persisted claim", () => {
    const artifact = makeArtifact({ artifactId: "artifact-pdf", kind: "PDF", filename: "spec.pdf" });
    const material = materializeArtifact({
      artifact,
      lineage: standaloneLineage(artifact),
      runId: "run-1",
      createdAt: TEST_NOW,
      evidence: {
        kind: "PDF",
        pages: [{ pageNumber: 3, text: "CHL-001  24 nos", characterCount: 15 }],
        nativeObservations: [
          observation({ type: "EQUIPMENT_TAG", value: "CHL-001" }),
          observation({ type: "QUANTITY", value: "24" }),
          observation({ type: "UNIT", value: "nos" }),
        ],
        ocrObservations: [],
        ocrEngines: [],
        documentLimitations: [],
        truncated: false,
      },
    });
    const quantity = material.claims.find((claim) => claim.assertion.predicate === "STATED_QUANTITY")!;
    expect(quantity).toBeTruthy();
    expect(quantity.assertion.valueLiteral).toBe("24");
    // The persisted numeric view is null: the page showed a string.
    expect(quantity.assertion.valueNumber).toBeNull();
    expect(quantity.assertion.valueNumberOrigin).toBeNull();
  });

  it("excludes a formula-backed workbook quantity from strict numeric comparison", async () => {
    const XLSX = makeArtifact({ artifactId: "artifact-formula", kind: "XLSX", filename: "boq-formula.xlsx" });
    const analysis = await analyzeXlsxBytes(await formulaQuantityWorkbook(), { filename: "boq-formula.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const material = materializeArtifact({ artifact: XLSX, lineage: standaloneLineage(XLSX), runId: "run-1", createdAt: TEST_NOW, evidence: { kind: "XLSX", analysis } });
    const formulaBacked = material.claims.filter((claim) => claim.context.sourceQualifiers.includes("FORMULA_BACKED"));
    expect(formulaBacked.length).toBeGreaterThan(0);
    for (const claim of formulaBacked) {
      // The workbook's own cached result may be persisted as a source-supplied
      // view, but the claim is marked so the comparator can exclude it.
      expect(isFormulaBackedQuantity(claim)).toBe(true);
      expect(claim.assertion.quantityOrigin).toBe("STATED");
      expect(claim.provenance.limitations.some((limitation) => limitation.toLowerCase().includes("formula"))).toBe(true);
    }
    // Proof of the exclusion itself: even against a different value, a
    // formula-backed side yields no strict numeric finding.
    const otherSide = material.claims.map((claim) => ({
      ...claim,
      claimId: `${claim.claimId}-other`,
      context: { ...claim.context, sourceQualifiers: claim.context.sourceQualifiers.filter((qualifier) => qualifier !== "FORMULA_BACKED") },
      assertion: { ...claim.assertion, valueLiteral: "999", valueNumber: 999 },
    }))[0]!;
    const excluded = compareStatedQuantities(formulaBacked[0]!, otherSide);
    expect(excluded.outcome).toBe("NO_FINDING");
    if (excluded.outcome === "FINDING") throw new Error("unreachable");
    expect(excluded.reason).toMatch(/formula-backed/u);
    // And without the qualifier the same pair would compare strictly.
    const strict = compareStatedQuantities({ ...formulaBacked[0]!, context: { ...formulaBacked[0]!.context, sourceQualifiers: [] } }, otherSide);
    expect(strict.outcome).toBe("FINDING");
  });

  it("reads no Requirement quantity and writes no approval in the materializers", () => {
    const directory = "src/application/cross-document/materialization";
    const files = readdirSync(directory).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(directory, file), "utf8");
      expect(source, file).not.toMatch(/requirement\.quantity/iu);
      expect(source, file).not.toMatch(/QuantityApproval|APPROVED_QUANTITY/iu);
    }
  });
});

describe("commercial exclusion", () => {
  it("publishes no engineering claim from a real rate/amount column", async () => {
    const artifact = makeArtifact({ artifactId: "artifact-currency", kind: "XLSX", filename: "boq-with-rate.xlsx" });
    const analysis = await analyzeXlsxBytes(await currencyWorkbook(), { filename: "boq-with-rate.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const material = materializeArtifact({ artifact, lineage: standaloneLineage(artifact), runId: "run-1", createdAt: TEST_NOW, evidence: { kind: "XLSX", analysis } });
    expect(material.claims.length).toBeGreaterThan(0);
    for (const claim of material.claims) {
      expect(claim.assertion.predicate).not.toBe("RATE");
      expect(claim.assertion.predicate).not.toBe("AMOUNT");
      expect(claim.subject.subjectKeyNamespace).not.toMatch(/RATE|AMOUNT|CURRENCY|PRICE|FX/iu);
      expect(claim.assertion.valueLiteral).not.toMatch(/^\s*(?:SAR|USD|EUR|AED|GBP)\b/u);
      // The rate (5) and amount (50) columns were read and deliberately withheld.
      expect(claim.assertion.valueLiteral).not.toBe("5");
      expect(claim.assertion.valueLiteral).not.toBe("50");
    }
    // The exclusion is disclosed, not silent.
    expect(material.limitations.join(" ")).toMatch(/commercial rate, amount, and currency values/iu);
  });

  it("produces no commercial finding, subject cluster, or participant across a real run", async () => {
    const BOQ = makeArtifact({ artifactId: "artifact-boq", kind: "XLSX", filename: "boq.xlsx" });
    const harness = await buildHarness({
      artifacts: [BOQ, SPEC],
      factory: ({ artifact, lineage }) => ({
        artifact,
        lineage,
        materializationId: `mat_${artifact.artifactId}`,
        materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.pdf-native.v1",
        readingChannels: [artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "PDF_NATIVE_TEXT"],
        coverage: "COMPLETE",
        claims: [
          claimFor({
            artifact,
            lineage,
            predicate: "STATED_QUANTITY",
            subjectKeyNamespace: "ITEM_NUMBER",
            subjectKeyValue: "CHL-001",
            subjectMatchKey: "CHL001",
            valueLiteral: artifact.kind === "XLSX" ? "24" : "22",
            sourceSuppliedNumber: artifact.kind === "XLSX" ? 24 : 22,
            unit: "nos",
            quantityOrigin: artifact.kind === "XLSX" ? "STATED" : "DECLARED_MODEL",
            locator: artifact.kind === "XLSX" ? "row 12 column D" : "p. 3 row 4",
            readingChannel: artifact.kind === "XLSX" ? "WORKBOOK_STRUCTURED" : "PDF_NATIVE_TEXT",
            materializerVersion: artifact.kind === "XLSX" ? "2a-10.materializer.workbook.v1" : "2a-10.materializer.pdf-native.v1",
          }),
        ],
        truncated: false,
        truncationReasons: [],
        warnings: [],
        limitations: [],
        unavailable: false,
      }),
    });
    await runCrossDocumentComparison({ companyId: "company-1", comparisonScopeId: harness.scopeId, actorUserId: "user-1", dependencies: harness.dependencies });

    const findings = await harness.store.listFindings({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 200 });
    const clusters = await harness.store.listSubjectClusters({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 200 });
    const claims = await harness.store.listClaims({ companyId: "company-1", comparisonScopeId: harness.scopeId, limit: 200 });
    expect(findings.length).toBeGreaterThan(0);

    for (const finding of findings) {
      expect(PROHIBITED_FINDING_KINDS).not.toContain(finding.findingKind);
      expect(finding.findingKind).not.toMatch(/RATE|AMOUNT|CURRENCY|PRICE|FX|COST|COMMERCIAL/iu);
    }
    for (const cluster of clusters) {
      expect(JSON.stringify(cluster)).not.toMatch(/"subjectNamespace":\s*"(?:RATE|AMOUNT|CURRENCY|PRICE)[^"]*"/iu);
    }
    for (const claim of claims) {
      expect(claim.assertion.predicate).not.toBe("RATE");
      expect(claim.assertion.predicate).not.toBe("AMOUNT");
      expect(claim.subject.subjectKeyNamespace).not.toMatch(/RATE|AMOUNT|CURRENCY|PRICE|FX/iu);
    }
  });

  it("declares no commercial winner or price authority anywhere in the engine", () => {
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
    for (const root of ["src/domain/cross-document", "src/application/cross-document", "src/infrastructure/cross-document", "app/api/cross-document", "lib/cross-document"]) {
      for (const path of walk(root)) {
        scanned += 1;
        const source = readFileSync(path, "utf8");
        expect(source, `${path} must not declare a price authority`).not.toMatch(/PRICE_AUTHORITY|RATE_AUTHORITY|commercialAuthority|COMMERCIAL_WINNER/iu);
      }
    }
    expect(scanned).toBeGreaterThan(10);
  });
});
