import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Phase 2A-9 test matrix items 13-14 and 51-56: inspecting a proprietary
 * ORIGINAL never enters a semantic channel and returns truthful bounded
 * guidance in EN and AR; a derived DXF/IFC inspection projects bounded
 * lineage; no raw enum tokens leak into user-facing prose.
 */

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  artifactDerivation: { findFirst: vi.fn() },
  requirement: { upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import type { ArtifactInspectionSummary } from "@/src/application/source-artifacts";
import { PrismaSourceArtifactInspection } from "../PrismaSourceArtifactInspection";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";
import { minimalAsciiDxf } from "../conversion/DeterministicConversionProvider";

const storage = new LocalSourceArtifactStorage();
let directory = "";

const dwgBytes = Buffer.concat([Buffer.from("AC1027", "latin1"), Buffer.from([0x00, 0x11, 0x22]), Buffer.alloc(48, 0x77)]);
const rvtBytes = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(16, 0x00),
  Buffer.from(Array.from("BasicFileInfo").flatMap((character) => [character.charCodeAt(0), 0x00])),
  Buffer.alloc(16, 0x00),
]);

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "voka-proprietary-inspect-"));
  process.env.VOKA_ARTIFACT_STORAGE_DIR = directory;
  await storage.put(dwgBytes, createHash("sha256").update(dwgBytes).digest("hex"));
  await storage.put(rvtBytes, createHash("sha256").update(rvtBytes).digest("hex"));
});

afterAll(() => {
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
  rmSync(directory, { recursive: true, force: true });
});

/** The inspection port returns an optional summary; every 2A-9 path populates it. */
function summaryOf(observation: { artifactInspection?: ArtifactInspectionSummary }): ArtifactInspectionSummary {
  const summary = observation.artifactInspection;
  if (!summary) throw new Error("the inspection path must always populate artifactInspection");
  return summary;
}

function artifactRow(kind: "DWG" | "RVT", filename: string, bytes: Buffer, overrides: Partial<Record<string, unknown>> = {}) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return {
    id: `original-${kind.toLowerCase()}`,
    originalFilename: filename,
    mimeType: kind === "DWG" ? "image/vnd.dwg" : "application/vnd.revit.rvt",
    kind,
    processingState: "RECEIVED",
    contentSha256: hash,
    storageRef: `${hash.slice(0, 2)}/${hash}`,
    citations: [],
    extractedText: null,
    ...overrides,
  };
}

async function inspectKind(kind: "DWG" | "RVT", locale: "en" | "ar", overrides: Partial<Record<string, unknown>> = {}) {
  const bytes = kind === "DWG" ? dwgBytes : rvtBytes;
  const filename = kind === "DWG" ? "site.dwg" : "tower.rvt";
  const row = artifactRow(kind, filename, bytes, overrides);
  prismaMock.sourceArtifact.findFirst.mockResolvedValue(row);
  prismaMock.artifactDerivation.findFirst.mockResolvedValue(null);
  const inspection = new PrismaSourceArtifactInspection(null, null, {});
  return inspection.inspect({
    companyId: "company-1",
    artifactId: row.id,
    kind: "ATTACHMENT_INSPECTION",
    query: "what is this",
    locale,
  } as never);
}

describe("proprietary original inspection (2A-9)", () => {
  it("13 returns truthful DWG guidance with the version, and no semantic claims", async () => {
    const observation = await inspectKind("DWG", "en");
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("binary DWG drawing");
    expect(observation.summary).toContain("AC1027");
    expect(observation.summary).toContain("AutoCAD 2013");
    expect(observation.summary).toContain("Export it as ASCII DXF");
    expect(observation.summary).toContain("linked back to this retained original");
    // The guidance disclaims losslessness rather than promising it.
    expect(observation.summary).toContain("not guaranteed to be lossless");
    // No semantic evidence channel may fire from an original.
    expect(observation.requirementCandidates ?? []).toEqual([]);
    expect(observation.artifactCandidates).toEqual([]);
    expect(summaryOf(observation).dxf.used).toBe(false);
    expect(summaryOf(observation).ifc.used).toBe(false);
    expect(summaryOf(observation).proprietaryOriginal.used).toBe(false);
    expect(summaryOf(observation).proprietaryOriginal.versionCode).toBe("AC1027");
    expect(observation.citations).toEqual([]);
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });

  it("14 returns truthful RVT guidance and no semantic claims", async () => {
    const observation = await inspectKind("RVT", "en");
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("Revit project (RVT)");
    expect(observation.summary).toContain("Export it as IFC");
    expect(observation.summary).toContain("linked back to this retained original");
    expect(observation.requirementCandidates ?? []).toEqual([]);
    expect(summaryOf(observation).proprietaryOriginal.format).toBe("RVT");
    expect(summaryOf(observation).proprietaryOriginal.verified).toBe(true);
    expect(summaryOf(observation).dxf.used).toBe(false);
    expect(summaryOf(observation).ifc.used).toBe(false);
    expect(observation.citations).toEqual([]);
  });

  it("52 AR proprietary guidance is real Arabic, names the format, and leaks no English prose", async () => {
    for (const kind of ["DWG", "RVT"] as const) {
      const observation = await inspectKind(kind, "ar");
      expect(observation.summary).toContain("لا يقرأ VOKA");
      expect(observation.summary).toContain("صدّره");
      expect(observation.summary).toMatch(/[\u0600-\u06FF]/);
      if (kind === "DWG") expect(observation.summary).toContain("ASCII DXF");
      else expect(observation.summary).toContain("IFC");
      expect(observation.summary).not.toContain("Export it as");
      expect(observation.summary).not.toContain("does not parse");
    }
  });

  it("56 no raw enum token leaks into any proprietary-original brief", async () => {
    for (const locale of ["en", "ar"] as const) {
      for (const kind of ["DWG", "RVT"] as const) {
        const observation = await inspectKind(kind, locale);
        const prose = `${observation.summary} ${JSON.stringify(observation.artifactInspection)}`;
        for (const token of ["SOURCE_ARTIFACT_", "AUTOMATED_CONVERSION", "USER_PROVIDED_EXPORT", "NOT_CONFIGURED", "DWG_TO_DXF", "RVT_TO_IFC"]) {
          expect(prose).not.toContain(token);
        }
      }
    }
  });
});

describe("derived-artifact lineage projection (2A-9)", () => {
  it("51/54 projects bounded lineage onto a derived DXF inspection in English", async () => {
    const dxfBytes = Buffer.from(minimalAsciiDxf(), "utf8");
    const dxfHash = createHash("sha256").update(dxfBytes).digest("hex");
    await storage.put(dxfBytes, dxfHash);
    const row = {
      id: "derived-dxf",
      originalFilename: "site.dxf",
      mimeType: "image/vnd.dxf",
      kind: "DXF",
      processingState: "TEXT_EXTRACTED",
      contentSha256: dxfHash,
      storageRef: `${dxfHash.slice(0, 2)}/${dxfHash}`,
      citations: [],
      extractedText: minimalAsciiDxf(),
    };
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(row);
    prismaMock.artifactDerivation.findFirst.mockResolvedValue({
      derivationKind: "DWG_TO_DXF",
      derivationMethod: "USER_PROVIDED_EXPORT",
      originalArtifactId: "original-dwg",
      derivedArtifactId: "derived-dxf",
      sourceFormat: "DWG",
      derivedFormat: "DXF",
      fidelityLimitations: ["extended data (XDATA) attached to entities may be truncated or dropped by the conversion"],
      completedAt: new Date("2026-09-14T00:00:00Z"),
      status: "SUCCEEDED",
    });
    prismaMock.sourceArtifact.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce({ originalFilename: "site.dwg" });
    const inspection = new PrismaSourceArtifactInspection(null, null, {});
    const observation = await inspection.inspect({ companyId: "company-1", artifactId: "derived-dxf", kind: "ATTACHMENT_INSPECTION", query: "read this", locale: "en" } as never);
    expect(observation.summary).toContain("provided as an export derived from the original DWG drawing 'site.dwg'");
    expect(summaryOf(observation).derivationLineage).toMatchObject({ derived: true, originalArtifactId: "original-dwg", sourceFormat: "DWG", derivedFormat: "DXF" });
    expect(summaryOf(observation).derivationLineage!.limitations.length).toBeLessThanOrEqual(4);
    // Lineage AUGMENTS the DXF evidence; it does not replace it.
    expect(summaryOf(observation).kind).toBe("DXF");
  });

  it("55 projects bounded lineage onto a derived IFC inspection in Arabic", async () => {
    const ifcBytes = Buffer.from("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCPROJECT('0xScRe4drECQ4DMSqUj6IT',$,'P',$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n", "utf8");
    const hash = createHash("sha256").update(ifcBytes).digest("hex");
    await storage.put(ifcBytes, hash);
    const row = {
      id: "derived-ifc",
      originalFilename: "tower.ifc",
      mimeType: "application/x-step",
      kind: "IFC",
      processingState: "TEXT_EXTRACTED",
      contentSha256: hash,
      storageRef: `${hash.slice(0, 2)}/${hash}`,
      citations: [],
      extractedText: "ISO-10303-21;",
    };
    prismaMock.sourceArtifact.findFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ originalFilename: "tower.rvt" });
    prismaMock.artifactDerivation.findFirst.mockResolvedValue({
      derivationKind: "RVT_TO_IFC",
      derivationMethod: "AUTOMATED_CONVERSION",
      originalArtifactId: "original-rvt",
      derivedArtifactId: "derived-ifc",
      sourceFormat: "RVT",
      derivedFormat: "IFC",
      fidelityLimitations: ["MEP connectivity and system topology are not guaranteed to survive as IFC flow relationships"],
      completedAt: new Date("2026-09-14T00:00:00Z"),
      status: "SUCCEEDED",
    });
    const inspection = new PrismaSourceArtifactInspection(null, null, {});
    const observation = await inspection.inspect({ companyId: "company-1", artifactId: "derived-ifc", kind: "ATTACHMENT_INSPECTION", query: "read this", locale: "ar" } as never);
    expect(observation.summary).toContain("نموذج Revit الأصلي 'tower.rvt'");
    expect(observation.summary).toMatch(/[\u0600-\u06FF]/);
    expect(summaryOf(observation).derivationLineage).toMatchObject({ method: "AUTOMATED_CONVERSION", sourceFormat: "RVT" });
    expect(summaryOf(observation).ifc.used).toBe(true);
  });

  it("shows no lineage for an artifact that was never derived", async () => {
    const observation = await inspectKind("DWG", "en");
    expect(summaryOf(observation).derivationLineage).toBeNull();
  });
});
