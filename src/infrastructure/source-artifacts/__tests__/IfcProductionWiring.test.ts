import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  conflictingIfcModel,
  dwgBytes,
  fullIfcModel,
  largeIfcModel,
  malformedIfcProse,
  rvtBytes,
  zipBytes,
} from "./fixtures/ifcFixtures";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";

/**
 * Phase 2A-8 test matrix items 71-77: the BIM channel on the REAL production
 * inspection path.
 */

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  requirement: { upsert: vi.fn() },
  requirementCitation: { upsert: vi.fn() },
  quotation: { create: vi.fn() },
  quotationLine: { create: vi.fn() },
  supplier: { create: vi.fn() },
  procurementRequirement: { create: vi.fn() },
  productSelection: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PrismaSourceArtifactInspection } from "../PrismaSourceArtifactInspection";

const storage = new LocalSourceArtifactStorage();
let directory = "";
let previousStorageDir: string | undefined;
let ifcBytes: Buffer;
let ifcRef = "";

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "voka-ifc-"));
  previousStorageDir = process.env.VOKA_ARTIFACT_STORAGE_DIR;
  process.env.VOKA_ARTIFACT_STORAGE_DIR = directory;
  ifcBytes = Buffer.from(fullIfcModel(), "utf8");
  ifcRef = (await putBytes(ifcBytes)).storageRef;
});

afterAll(() => {
  if (previousStorageDir === undefined) delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
  else process.env.VOKA_ARTIFACT_STORAGE_DIR = previousStorageDir;
  rmSync(directory, { recursive: true, force: true });
});

async function putBytes(bytes: Buffer): Promise<{ hash: string; storageRef: string }> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const stored = await storage.put(bytes, hash);
  return { hash, storageRef: stored.storageRef };
}

function artifactRow(overrides: Partial<Record<string, unknown>> = {}, bytes: Buffer = ifcBytes) {
  return {
    id: "artifact-ifc",
    originalFilename: "seafront.ifc",
    mimeType: "application/x-step",
    kind: "IFC",
    processingState: "TEXT_EXTRACTED",
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    storageRef: ifcRef,
    citations: [],
    ...overrides,
  };
}

async function inspect(input: Record<string, unknown> = {}, artifact: Record<string, unknown> = {}, bytes: Buffer = ifcBytes) {
  prismaMock.sourceArtifact.findFirst.mockResolvedValue(artifactRow(artifact, bytes));
  const inspection = new PrismaSourceArtifactInspection(null, null, {});
  return inspection.inspect({
    companyId: "company-1",
    artifactId: "artifact-ifc",
    kind: "ATTACHMENT_INSPECTION",
    query: "what is in this model",
    locale: "en",
    ...input,
  } as never);
}

async function inspectBytes(bytes: Buffer, overrides: Partial<Record<string, unknown>> = {}) {
  const stored = await putBytes(bytes);
  return inspect(
    {},
    { storageRef: stored.storageRef, contentSha256: stored.hash, ...overrides },
    bytes,
  );
}

describe("IFC inspection on the production path", () => {
  it("71 inspects a real stored model and returns bounded structured evidence", async () => {
    const observation = await inspect();
    expect(observation.status).toBe("COMPLETED");
    expect(observation.artifactInspection?.kind).toBe("IFC");
    expect(observation.artifactInspection?.ifc.schema).toBe("IFC4");
    expect(observation.artifactInspection?.ifc.storeyCount).toBe(2);
    expect(observation.summary).toContain("schema IFC4");
  });

  it("72 routes to the BIM channel from the artifact kind, the MIME type, or the file name", async () => {
    const byMime = await inspect({}, { kind: "PDF", mimeType: "application/x-step" });
    expect(byMime.artifactInspection?.kind).toBe("IFC");
    const byName = await inspect({}, { kind: "PDF", mimeType: "application/octet-stream", originalFilename: "plan.ifc" });
    expect(byName.artifactInspection?.kind).toBe("IFC");
  });

  it("73 never reaches the requirement-creating text path for a model", async () => {
    const observation = await inspect();
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.requirementCitation.upsert).not.toHaveBeenCalled();
    expect(observation.requirementCandidates ?? []).toHaveLength(0);
    expect(observation.extractedText).toBeUndefined();
  });

  it("74 creates no quotation, supplier, procurement, or product-selection record", async () => {
    await inspect();
    expect(prismaMock.quotation.create).not.toHaveBeenCalled();
    expect(prismaMock.quotationLine.create).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    expect(prismaMock.procurementRequirement.create).not.toHaveBeenCalled();
    expect(prismaMock.productSelection.create).not.toHaveBeenCalled();
  });

  it("75 returns no artifact candidates from semantic candidates", async () => {
    const observation = await inspect();
    expect(observation.artifactInspection?.ifc.candidates.length).toBeGreaterThan(0);
    expect(observation.artifactCandidates ?? []).toHaveLength(0);
  });

  it("76 rejects RVT, ZIP, DWG, and prose truthfully on the production path", async () => {
    const rvt = await inspectBytes(rvtBytes(), { originalFilename: "model.ifc" });
    expect(rvt.status).toBe("UNAVAILABLE");
    expect(rvt.summary).toContain("Revit");
    const zip = await inspectBytes(zipBytes(), { originalFilename: "model.ifczip" });
    expect(zip.status).toBe("UNAVAILABLE");
    expect(zip.summary).toContain("ZIP");
    const dwg = await inspectBytes(dwgBytes(), { originalFilename: "model.ifc" });
    expect(dwg.status).toBe("UNAVAILABLE");
    expect(dwg.summary).toContain("DWG");
    const prose = await inspectBytes(malformedIfcProse(), { originalFilename: "notes.ifc" });
    expect(prose.status).toBe("UNAVAILABLE");
  });

  it("77 keeps conflicting readings visible and renders Arabic without inventing pages", async () => {
    const conflict = await inspectBytes(Buffer.from(conflictingIfcModel(), "utf8"));
    expect(conflict.summary).toContain("Smoke Detector");
    expect(conflict.summary).toContain("Heat Detector");
    expect(conflict.summary).toContain("did not prefer one over another");
    const arabic = await inspect({ locale: "ar" });
    expect(arabic.summary).toContain("لم يُحصر");
    expect(arabic.summary).not.toContain("BUILDING_STOREY");
    expect(arabic.artifactInspection?.pageCount).toBeNull();
    const large = await inspectBytes(Buffer.from(largeIfcModel(30), "utf8"), { originalFilename: "big.ifc" });
    expect(large.artifactInspection?.ifc.elementCount).toBe(30);
  });
});
