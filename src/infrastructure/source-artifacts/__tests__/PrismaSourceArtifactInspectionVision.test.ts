import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OcrPort, VisualInspectionPort } from "@/src/application/source-artifacts/ports";
import type { OcrPageRequest, VisualInspectionRequest } from "@/src/domain/source-artifact";
import { deterministicVisionProvider } from "../vision/DeterministicVisionProvider";
import { unavailableVisionProvider } from "../vision/UnavailableVisionProvider";
import { deterministicOcrEngine } from "../ocr/DeterministicOcrEngine";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";
import { PNG_BYTES } from "./fixtures/imageFixtures";
import { SCANNED_SHEET, buildPdf } from "./fixtures/pdfFixtures";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  requirement: { upsert: vi.fn() },
  requirementCitation: { upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PrismaSourceArtifactInspection } from "../PrismaSourceArtifactInspection";

const SITE_PHOTO = [
  { type: "IMAGE_TYPE_HINT", description: "site photo", confidence: 0.95 },
  { type: "VISIBLE_OBJECT", description: "wall-mounted grey enclosure with a hinged door", confidence: 0.88, region: "center" },
  { type: "VISUAL_CONTEXT", description: "electrical room wall with conduit running overhead", confidence: 0.8 },
];

function trackingVision(provider: VisualInspectionPort): { calls: VisualInspectionRequest[]; provider: VisualInspectionPort } {
  const calls: VisualInspectionRequest[] = [];
  return {
    calls,
    provider: {
      providerId: provider.providerId,
      inspect: async (request) => {
        calls.push(request);
        return provider.inspect(request);
      },
    },
  };
}

function countingOcr(engine: OcrPort): { calls: OcrPageRequest[]; port: OcrPort } {
  const calls: OcrPageRequest[] = [];
  return {
    calls,
    port: {
      engineId: engine.engineId,
      recognize: async (request) => {
        calls.push(request);
        return engine.recognize(request);
      },
    },
  };
}

let storageDir: string;
let storage: LocalSourceArtifactStorage;

beforeAll(() => {
  storageDir = mkdtempSync(path.join(tmpdir(), "voka-vision-inspection-"));
  process.env.VOKA_ARTIFACT_STORAGE_DIR = storageDir;
  storage = new LocalSourceArtifactStorage();
});

afterAll(() => {
  rmSync(storageDir, { recursive: true, force: true });
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
});

function resetPrisma() {
  prismaMock.sourceArtifact.findFirst.mockReset();
  prismaMock.requirement.upsert.mockReset();
  prismaMock.requirementCitation.upsert.mockReset();
}

async function imageRow(bytes: Buffer, overrides: Record<string, unknown> = {}) {
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const stored = await storage.put(bytes, contentSha256);
  return {
    id: "artifact-1",
    companyId: "company-1",
    originalFilename: "panel.jpg",
    mimeType: "image/jpeg",
    sizeBytes: bytes.byteLength,
    contentSha256,
    kind: "IMAGE",
    storageRef: stored.storageRef,
    context: "SALES_ASSISTANT",
    processingState: "STORED_PENDING_VISION",
    extractedText: null,
    extractedPages: null,
    citations: [],
    ...overrides,
  };
}

const baseInput = {
  companyId: "company-1",
  artifactId: "artifact-1",
  kind: "ATTACHMENT_INSPECTION" as const,
  query: "What is in this image?",
  locale: "en" as const,
};

describe("production inspection path with vision (2A-3)", () => {
  it("reaches visual inspection for a standalone image and projects the result", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1": SITE_PHOTO }));
    const observation = await new PrismaSourceArtifactInspection(null, provider).inspect(baseInput);
    expect(calls).toHaveLength(1);
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).toContain("I inspected the image visually.");
    expect(observation.summary).toContain("Observed visually:");
    expect(observation.artifactInspection?.vision).toMatchObject({ attempted: true, used: true });
    expect(observation.artifactInspection?.observations).toHaveLength(3);
    // Every visual observation keeps null page provenance and vision attribution only.
    for (const item of observation.artifactInspection?.observations ?? []) {
      expect(item.pageNumber).toBeNull();
      expect(item.visualOrigin).toMatchObject({ source: "VISION" });
      expect(item.origin).toBeUndefined();
    }
    // Visual candidates are observation-only: no governed key, no promotion path.
    for (const candidate of observation.artifactCandidates ?? []) {
      expect(candidate).toMatchObject({ status: "OBSERVED_PENDING_APPROVAL", factKey: null, pageNumber: null });
      expect(candidate.visualOrigin).toMatchObject({ source: "VISION" });
    }
    // Nothing commercial is created from vision output.
    expect(observation.requirementCandidates).toBeUndefined();
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });

  it("reaches visual inspection for a screenshot", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES, { originalFilename: "screenshot.png", mimeType: "image/png" }));
    const observation = await new PrismaSourceArtifactInspection(
      null,
      deterministicVisionProvider({ "artifact-1": [{ type: "IMAGE_TYPE_HINT", description: "screenshot", confidence: 0.95 }] }),
    ).inspect(baseInput);
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).toContain("image type: screenshot (image)");
  });

  it("reports truthfully when the vision provider is unavailable", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const observation = await new PrismaSourceArtifactInspection(null, unavailableVisionProvider("no key")).inspect(baseInput);
    expect(observation.status).toBe("STORED_PENDING_VISION");
    expect(observation.summary).toContain("could not produce usable visual observations");
    expect(observation.artifactInspection?.vision).toMatchObject({ attempted: true, used: false });
  });

  it("reports truthfully when vision is not configured at all", async () => {
    resetPrisma();
    const saved = process.env.VOKA_VISION_PROVIDER;
    delete process.env.VOKA_VISION_PROVIDER;
    try {
      prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
      const observation = await new PrismaSourceArtifactInspection(null).inspect(baseInput);
      expect(observation.status).toBe("STORED_PENDING_VISION");
      expect(observation.summary).toContain("visual inspection is not available");
      expect(observation.artifactInspection?.vision).toMatchObject({ attempted: false, used: false });
    } finally {
      if (saved === undefined) delete process.env.VOKA_VISION_PROVIDER;
      else process.env.VOKA_VISION_PROVIDER = saved;
    }
  });

  it("never reports a vision failure as inspected", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const failing: VisualInspectionPort = {
      providerId: "failing",
      inspect: async () => { throw new Error("worker down"); },
    };
    const observation = await new PrismaSourceArtifactInspection(null, failing).inspect(baseInput);
    expect(observation.status).toBe("STORED_PENDING_VISION");
    expect(observation.summary).toContain("could not produce usable visual observations");
    expect(JSON.stringify(observation)).not.toContain("\"COMPLETED\"");
    expect(JSON.stringify(observation)).not.toContain("\"INSPECTED\"");
  });

  it("propagates low-confidence visual output with an explicit review limitation", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const observation = await new PrismaSourceArtifactInspection(
      null,
      deterministicVisionProvider({ "artifact-1": [{ type: "VISIBLE_MODEL_REFERENCE", description: "marking that looks like FP-200", confidence: 0.2 }] }),
    ).inspect(baseInput);
    expect(observation.status).toBe("COMPLETED");
    expect(observation.artifactInspection?.vision).toMatchObject({ used: true, lowConfidence: true });
    expect(observation.summary).toContain("Some visual observations have low confidence; verify them against the image itself.");
  });

  it("renders the real vision brief in Arabic", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const observation = await new PrismaSourceArtifactInspection(
      null,
      deterministicVisionProvider({ "artifact-1": SITE_PHOTO }),
    ).inspect({ ...baseInput, locale: "ar" });
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).toContain("فحصت الصورة بصرياً");
    expect(observation.summary).toContain("ما رُصد بصرياً:");
    expect(observation.summary).not.toContain("Observed visually:");
  });

  it("keeps OCR text and visual observations separately attributed", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    const stored = await storage.put(bytes, contentSha256);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue({
      id: "artifact-1", companyId: "company-1", originalFilename: "scan.pdf", mimeType: "application/pdf",
      sizeBytes: bytes.byteLength, contentSha256, kind: "PDF", storageRef: stored.storageRef,
      context: "SALES_ASSISTANT", processingState: "STORED_PENDING_VISION", extractedText: null, extractedPages: null, citations: [],
    });
    const { calls: ocrCalls, port: ocr } = countingOcr(deterministicOcrEngine({ "page:1": "BILL OF QUANTITIES\nITEM DESCRIPTION QTY UNIT\n1.1 Pump set 2 nos" }));
    const { calls: visionCalls, provider: vision } = trackingVision(deterministicVisionProvider({ "artifact-1": SITE_PHOTO }));
    const observation = await new PrismaSourceArtifactInspection(ocr, vision).inspect(baseInput);
    expect(observation.status).toBe("COMPLETED");
    expect(ocrCalls).toHaveLength(1);
    // PDF pages never reach the vision provider in 2A-3.
    expect(visionCalls).toHaveLength(0);
    expect(observation.artifactInspection?.vision).toMatchObject({ attempted: false, used: false });
    for (const item of observation.artifactInspection?.observations ?? []) {
      expect(item.origin?.textSource).toBe("OCR");
      expect(item.visualOrigin).toBeUndefined();
    }
  });

  it("never promotes a visible brand into a product or supplier", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const observation = await new PrismaSourceArtifactInspection(
      null,
      deterministicVisionProvider({ "artifact-1": [{ type: "VISIBLE_BRAND", description: "legible logo reading ACME", confidence: 0.9 }] }),
    ).inspect(baseInput);
    expect(observation.status).toBe("COMPLETED");
    const candidate = observation.artifactCandidates?.[0];
    expect(candidate).toMatchObject({ observationType: "VISIBLE_BRAND", factKey: null, status: "OBSERVED_PENDING_APPROVAL" });
    expect(observation.requirementCandidates).toBeUndefined();
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.requirementCitation.upsert).not.toHaveBeenCalled();
  });

  // Phase 2A-4 changes this boundary deliberately: a standalone image
  // explicitly requested as a drawing now reaches the drawing-specific
  // bounded vision profile through the SAME production port. General image
  // requests still never run the drawing profile.
  it("runs the bounded drawing profile for a standalone image explicitly requested as a drawing", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const { calls, provider } = trackingVision(deterministicVisionProvider({ "artifact-1": [
      { type: "DRAWING_NUMBER", description: "M-201", confidence: 0.92, region: "lower-right" },
      { type: "REVISION", description: "B", confidence: 0.9 },
    ] }));
    const observation = await new PrismaSourceArtifactInspection(null, provider).inspect({ ...baseInput, kind: "DRAWING_INSPECTION" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ pageNumber: null, analysisProfile: "DRAWING_SEMANTICS" });
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).toContain("Observed on drawings: drawing no.: M-201 (unattributed page)");
    // A general attachment request never triggers the drawing profile.
    resetPrisma();
    const general = trackingVision(deterministicVisionProvider({ "artifact-1": SITE_PHOTO }));
    await new PrismaSourceArtifactInspection(null, general.provider).inspect(baseInput);
    expect(general.calls[0]?.analysisProfile).toBeUndefined();
  });

  it("reports the drawing-image boundary truthfully when no vision provider is configured", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const observation = await new PrismaSourceArtifactInspection(null).inspect({ ...baseInput, kind: "DRAWING_INSPECTION" });
    expect(observation.status).toBe("DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE");
    expect(observation.summary).toContain("visual inspection is not available");
    expect(observation.artifactInspection?.drawing).toMatchObject({ attempted: false, used: false });
  });

  it("never creates requirement candidates from vision output on the BOQ path", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await imageRow(PNG_BYTES));
    const observation = await new PrismaSourceArtifactInspection(
      null,
      deterministicVisionProvider({ "artifact-1": SITE_PHOTO }),
    ).inspect({ ...baseInput, kind: "BOQ_INSPECTION", runtimeId: "runtime-1" });
    expect(observation.status).toBe("COMPLETED");
    expect(observation.requirementCandidates).toBeUndefined();
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
  });
});
