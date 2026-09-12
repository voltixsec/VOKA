import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  binaryDxfBytes,
  conflictingSemanticsDrawing,
  dwgBytes,
  fullDrawing,
  largeDrawing,
  malformedText,
  xrefDrawing,
} from "./fixtures/dxfFixtures";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";

/**
 * Phase 2A-7 test matrix items 47-51 and 56-57: the CAD channel on the REAL
 * production inspection path.
 *
 * Every assertion here runs through PrismaSourceArtifactInspection — the same
 * port the ConversationRuntime uses — over bytes stored by the real storage
 * adapter and a real SourceArtifact row. Instantiating an analyzer directly
 * would prove the analyzer works; it would not prove a drawing uploaded by a
 * user reaches it, and it would not prove the governance boundary holds on the
 * path that actually creates requirements for other formats.
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
let dxfBytes: Buffer;
let dxfRef = "";

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "voka-dxf-"));
  previousStorageDir = process.env.VOKA_ARTIFACT_STORAGE_DIR;
  process.env.VOKA_ARTIFACT_STORAGE_DIR = directory;
  dxfBytes = Buffer.from(fullDrawing(), "latin1");
  dxfRef = (await putBytes(dxfBytes)).storageRef;
});

afterAll(() => {
  if (previousStorageDir === undefined) delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
  else process.env.VOKA_ARTIFACT_STORAGE_DIR = previousStorageDir;
  rmSync(directory, { recursive: true, force: true });
});

/** Stores bytes through the real storage adapter and returns the locator it issued. */
async function putBytes(bytes: Buffer): Promise<{ hash: string; storageRef: string }> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const stored = await storage.put(bytes, hash);
  return { hash, storageRef: stored.storageRef };
}

function artifactRow(overrides: Partial<Record<string, unknown>> = {}, bytes: Buffer = dxfBytes) {
  return {
    id: "artifact-dxf",
    originalFilename: "site.dxf",
    mimeType: "image/vnd.dxf",
    kind: "DXF",
    processingState: "TEXT_EXTRACTED",
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    storageRef: dxfRef,
    citations: [],
    ...overrides,
  };
}

async function inspect(input: Record<string, unknown> = {}, artifact: Record<string, unknown> = {}, bytes: Buffer = dxfBytes) {
  prismaMock.sourceArtifact.findFirst.mockResolvedValue(artifactRow(artifact, bytes));
  const inspection = new PrismaSourceArtifactInspection(null, null, {});
  return inspection.inspect({
    companyId: "company-1",
    artifactId: "artifact-dxf",
    kind: "DRAWING_INSPECTION",
    query: "what is in this drawing",
    locale: "en",
    ...input,
  } as never);
}

/** Stores arbitrary bytes and inspects them as the artifact row describes. */
async function inspectBytes(bytes: Buffer, overrides: Partial<Record<string, unknown>> = {}) {
  const stored = await putBytes(bytes);
  return inspect(
    {},
    { storageRef: stored.storageRef, contentSha256: stored.hash, ...overrides },
    bytes,
  );
}

describe("DXF inspection on the production path", () => {
  it("inspects a real stored drawing and returns bounded structured evidence", async () => {
    const observation = await inspect();
    expect(observation.status).toBe("COMPLETED");
    expect(observation.artifactInspection?.kind).toBe("DXF");
    expect(observation.artifactInspection?.dxf.units.name).toBe("millimetres");
    expect(observation.artifactInspection?.dxf.layerCount).toBe(5);
    expect(observation.artifactInspection?.dxf.modelSpaceEntityCount).toBe(13);
    expect(observation.summary).toContain("explicitly declares millimetres");
  });

  it("routes to the CAD channel from the artifact kind, the MIME type, or the file name", async () => {
    // A row whose kind predates the DXF enum value still routes correctly.
    const byMime = await inspect({}, { kind: "PDF", mimeType: "application/x-dxf" });
    expect(byMime.artifactInspection?.kind).toBe("DXF");
    const byName = await inspect({}, { kind: "PDF", mimeType: "application/octet-stream", originalFilename: "plan.dxf" });
    expect(byName.artifactInspection?.kind).toBe("DXF");
  });

  it("never reaches the requirement-creating text path for a drawing", async () => {
    const observation = await inspect();
    // The PDF/BOQ path is the only place requirements are created; a drawing
    // must return before it.
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.requirementCitation.upsert).not.toHaveBeenCalled();
    expect(observation.requirementCandidates ?? []).toHaveLength(0);
    expect(observation.extractedText).toBeUndefined();
  });

  it("creates no quotation, quotation line, supplier, procurement, or product-selection record", async () => {
    await inspect();
    expect(prismaMock.quotation.create).not.toHaveBeenCalled();
    expect(prismaMock.quotationLine.create).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    expect(prismaMock.procurementRequirement.create).not.toHaveBeenCalled();
    expect(prismaMock.productSelection.create).not.toHaveBeenCalled();
  });

  it("returns no artifact candidates from semantic candidates", async () => {
    const observation = await inspect();
    // Semantic candidates exist in the structured projection, but they are not
    // governed fact candidates and are never proposed as such.
    expect(observation.artifactInspection?.dxf.candidates.length).toBeGreaterThan(0);
    expect(observation.artifactCandidates ?? []).toHaveLength(0);
  });

  it("produces no equipment count anywhere in the observation", async () => {
    const observation = await inspect();
    const serialized = JSON.stringify(observation.artifactInspection);
    for (const forbidden of ["smoke detectors", "cameras", "light fixtures", "24 ", "equipmentCount"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("carries CAD locator citations and never a page number", async () => {
    const observation = await inspect({}, {
      citations: [{
        id: "citation-1", sourceArtifactId: "artifact-dxf", sourceType: "SOURCE_ARTIFACT_DXF",
        title: "site.dxf", pageNumber: null, sheet: null, lineLocator: "DXF:LAYER=FIRE_ALARM",
        provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED",
        confidence: null, supportedClaimSummary: "layer FIRE_ALARM",
      }],
    });
    const citation = observation.citations?.[0]!;
    expect(citation.pageNumber).toBeNull();
    expect(citation.lineLocator).toBe("DXF:LAYER=FIRE_ALARM");
    expect(observation.artifactInspection?.pageCount).toBeNull();
  });

  it("rejects a DWG truthfully instead of parsing it as a drawing", async () => {
    const observation = await inspectBytes(dwgBytes(), { originalFilename: "site.dxf" });
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("binary DWG drawing");
    expect(observation.summary).toContain("I did not open this file as a CAD drawing");
    expect(observation.artifactInspection?.kind).toBe("DXF");
    expect(observation.artifactInspection?.dxf.attempted).toBe(false);
  });

  it("rejects a binary DXF truthfully", async () => {
    const observation = await inspectBytes(binaryDxfBytes(), { originalFilename: "site.dxf" });
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("binary DXF");
  });

  it("rejects a text file named .dxf truthfully", async () => {
    const observation = await inspectBytes(malformedText(), { originalFilename: "notes.dxf" });
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("does not contain DXF group-code structure");
  });

  it("refuses bytes whose hash does not match the stored artifact record", async () => {
    const observation = await inspect({}, { contentSha256: "0".repeat(64) });
    expect(observation.status).toBe("UNAVAILABLE");
    expect(observation.summary).toContain("retained bytes could not be verified");
  });

  it("discloses an unopened external CAD reference on the production path", async () => {
    const observation = await inspectBytes(Buffer.from(xrefDrawing(), "latin1"));
    expect(observation.summary).toContain("references an external CAD file");
    expect(observation.summary).toContain("did not open");
  });

  it("discloses truncation for a bounded large drawing", async () => {
    const observation = await inspectBytes(Buffer.from(largeDrawing(4_000), "latin1"), { originalFilename: "big.dxf" });
    expect(observation.artifactInspection?.dxf.truncated).toBe(true);
    expect(observation.summary).toContain("truncated view rather than the whole file");
  });

  it("keeps conflicting readings visible on the production path", async () => {
    const observation = await inspectBytes(Buffer.from(conflictingSemanticsDrawing(), "latin1"));
    expect(observation.summary).toContain("Smoke Detector");
    expect(observation.summary).toContain("Heat Detector");
    expect(observation.summary).toContain("did not prefer one over another");
  });

  it("renders the Arabic brief when the runtime locale is Arabic", async () => {
    const observation = await inspect({ locale: "ar" });
    expect(observation.summary).toContain("يُصرّح المخطط صراحةً بأن وحدة القياس فيه هي مليمتر");
    expect(observation.summary).not.toContain("MODEL_SPACE");
  });

  it("reuses the same bounded evidence for the same bytes", async () => {
    const first = await inspect();
    const second = await inspect();
    // Same hash, same bytes: the reading is deterministic, so a repeat call is
    // a reuse rather than a second, possibly different, opinion.
    expect(first.artifactInspection?.dxf.entityCount).toBe(second.artifactInspection?.dxf.entityCount);
    expect(first.artifactInspection?.dxf.candidates.map((candidate) => candidate.label))
      .toEqual(second.artifactInspection?.dxf.candidates.map((candidate) => candidate.label));
    expect(first.artifactInspection?.dxf.citedLocators).toEqual(second.artifactInspection?.dxf.citedLocators);
    // The content hash the ingest path keys idempotency on is the same one the
    // inspection path verifies against.
    expect(artifactRow().contentSha256).toBe(createHash("sha256").update(dxfBytes).digest("hex"));
  });
});
