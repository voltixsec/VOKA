import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OcrPort } from "@/src/application/source-artifacts/ports";
import type { OcrPageRequest } from "@/src/domain/source-artifact";
import { deterministicOcrEngine } from "../ocr/DeterministicOcrEngine";
import { unavailableOcrEngine } from "../ocr/UnavailableOcrEngine";
import { analyzePdfBytesWithOcr } from "../ocr/OcrDocumentAnalyzer";
import { LocalSourceArtifactStorage } from "../LocalSourceArtifactStorage";
import { BOQ_SHEET, SCANNED_SHEET, buildPdf } from "./fixtures/pdfFixtures";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  requirement: { upsert: vi.fn() },
  requirementCitation: { upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PrismaSourceArtifactInspection } from "../PrismaSourceArtifactInspection";

const BOQ_SCAN = [
  "BILL OF QUANTITIES",
  "ITEM DESCRIPTION QTY UNIT",
  "1.1 Supply and install fire pump set 2 nos",
  "1.2 Fire hose reel FHR-01 8 nos",
  "MODEL NO: FP-200",
].join("\n");

function counting(engine: OcrPort): { calls: OcrPageRequest[]; port: OcrPort } {
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
  storageDir = mkdtempSync(path.join(tmpdir(), "voka-ocr-inspection-"));
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

/** Stores bytes and returns a legacy artifact row (ingested without OCR results). */
async function legacyRow(bytes: Buffer, overrides: Record<string, unknown> = {}) {
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const stored = await storage.put(bytes, contentSha256);
  return {
    id: "artifact-1",
    companyId: "company-1",
    originalFilename: "scan.pdf",
    mimeType: "application/pdf",
    sizeBytes: bytes.byteLength,
    contentSha256,
    kind: "PDF",
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
  query: "What is in this file?",
  locale: "en" as const,
};

describe("production inspection path with OCR (2A-2B)", () => {
  it("reaches OCR automatically for a scanned artifact and projects the result", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": BOQ_SCAN }));
    const observation = await new PrismaSourceArtifactInspection(port).inspect(baseInput);
    expect(calls).toHaveLength(1);
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).toContain("Page 1 was read using OCR.");
    expect(observation.extractedText).toContain("BILL OF QUANTITIES");
    expect(observation.artifactInspection?.ocr).toMatchObject({ attempted: true, used: true, pages: [1] });
    expect(observation.artifactInspection?.classification?.value).toBe("BOQ_OR_SCHEDULE");
    // OCR observations reach runtime candidates, still unapproved.
    const quantity = observation.artifactCandidates?.find((candidate) => candidate.observationType === "QUANTITY");
    expect(quantity).toMatchObject({ status: "OBSERVED_PENDING_APPROVAL", factKey: null });
    expect(quantity?.origin).toEqual({ textSource: "OCR", engineId: "deterministic-test-double" });
    const model = observation.artifactCandidates?.find((candidate) => candidate.observationType === "MODEL_OR_REFERENCE");
    expect(model?.factKey).toBeNull();
  });

  it("bypasses OCR entirely for native-text PDFs", async () => {
    resetPrisma();
    const bytes = buildPdf([BOQ_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes, { originalFilename: "native.pdf" }));
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": "SHOULD NOT BE USED" }));
    const observation = await new PrismaSourceArtifactInspection(port).inspect(baseInput);
    expect(calls).toHaveLength(0);
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).not.toContain("using OCR");
    expect(observation.artifactInspection?.ocr).toMatchObject({ attempted: false, used: false });
    expect(observation.artifactInspection?.classification?.value).toBe("BOQ_OR_SCHEDULE");
  });

  it("reports truthfully when the OCR engine is unavailable", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
    const observation = await new PrismaSourceArtifactInspection(unavailableOcrEngine()).inspect(baseInput);
    expect(observation.status).toBe("STORED_PENDING_VISION");
    expect(observation.summary).toContain("I also tried reading the scanned pages with OCR but could not recover usable text.");
    expect(observation.artifactInspection?.ocr).toMatchObject({ attempted: true, used: false });
    expect(observation.summary).not.toMatch(/analyzed successfully|complete understanding/iu);
  });

  it("never reports an OCR failure as analyzed successfully", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
    const failing: OcrPort = {
      engineId: "failing",
      recognize: async () => { throw new Error("worker crashed"); },
    };
    const observation = await new PrismaSourceArtifactInspection(failing).inspect(baseInput);
    expect(observation.status).toBe("STORED_PENDING_VISION");
    expect(observation.summary).toContain("could not recover usable text");
    expect(observation.artifactInspection?.ocr).toMatchObject({ attempted: true, used: false });
    expect(JSON.stringify(observation)).not.toContain("COMPLETED");
  });

  it("propagates low-confidence OCR with an explicit review limitation", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
    const engine = deterministicOcrEngine({ "page:1": { text: BOQ_SCAN, status: "LOW_CONFIDENCE", confidence: 0.3 } });
    const observation = await new PrismaSourceArtifactInspection(engine).inspect(baseInput);
    expect(observation.status).toBe("COMPLETED");
    expect(observation.artifactInspection?.ocr).toMatchObject({ used: true, lowConfidence: true });
    expect(observation.summary).toContain("Some OCR results have low confidence; verify the wording against the original pages.");
    expect(observation.artifactInspection?.observations.every((item) => item.reliability === "LOW")).toBe(true);
  });

  it("renders the real OCR brief in Arabic", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
    const observation = await new PrismaSourceArtifactInspection(deterministicOcrEngine({ "page:1": BOQ_SCAN })).inspect({
      ...baseInput,
      locale: "ar",
    });
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).toContain("تمت قراءة الصفحة 1 باستخدام التعرف الضوئي على الحروف (OCR).");
    expect(observation.summary).toContain("تم استخراج النص من صفحة ممسوحة ضوئياً وقد يحتاج إلى مراجعة.");
    expect(observation.summary).not.toContain("was read using OCR");
  });

  it("reuses persisted OCR results from ingest without calling the engine", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    const analyzed = await analyzePdfBytesWithOcr(bytes, deterministicOcrEngine({ "page:1": BOQ_SCAN }), { artifactId: "artifact-1" });
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes, {
      processingState: "TEXT_EXTRACTED",
      extractedText: analyzed.inspection.text,
      extractedPages: { version: 2, document: analyzed.inspection.document, pages: analyzed.inspection.pages },
    }));
    const { calls, port } = counting(deterministicOcrEngine({}));
    const observation = await new PrismaSourceArtifactInspection(port).inspect(baseInput);
    expect(calls).toHaveLength(0);
    expect(observation.status).toBe("COMPLETED");
    expect(observation.summary).toContain("Page 1 was read using OCR.");
    expect(observation.artifactInspection?.ocr).toMatchObject({ attempted: true, used: true, pages: [1] });
  });

  it("keeps the native-only path when OCR is not configured", async () => {
    resetPrisma();
    const saved = process.env.VOKA_OCR_ENGINE;
    delete process.env.VOKA_OCR_ENGINE;
    try {
      const bytes = buildPdf([SCANNED_SHEET]);
      prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
      const observation = await new PrismaSourceArtifactInspection().inspect(baseInput);
      expect(observation.status).toBe("STORED_PENDING_VISION");
      expect(observation.summary).toContain("OCR and image understanding are not available, so I cannot read its content.");
      expect(observation.artifactInspection?.ocr).toMatchObject({ attempted: false, used: false });
    } finally {
      if (saved === undefined) delete process.env.VOKA_OCR_ENGINE;
      else process.env.VOKA_OCR_ENGINE = saved;
    }
  });

  it("routes OCR text into review-required BOQ requirement candidates", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
    prismaMock.requirement.upsert.mockResolvedValue({ id: "req-1" });
    const observation = await new PrismaSourceArtifactInspection(
      deterministicOcrEngine({ "page:1": "1 IP camera each\n2 CAT6 cable m" }),
    ).inspect({ ...baseInput, kind: "BOQ_INSPECTION", runtimeId: "runtime-1" });
    expect(observation.status).toBe("COMPLETED");
    expect(observation.requirementCandidates).toHaveLength(2);
    expect(prismaMock.requirement.upsert).toHaveBeenCalledTimes(2);
    const created = prismaMock.requirement.upsert.mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(created.create).toMatchObject({ quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW" });
  });

  it("discloses OCR on the drawing path without claiming visual analysis", async () => {
    resetPrisma();
    const bytes = buildPdf([SCANNED_SHEET]);
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(await legacyRow(bytes));
    const observation = await new PrismaSourceArtifactInspection(deterministicOcrEngine({ "page:1": BOQ_SCAN })).inspect({
      ...baseInput,
      kind: "DRAWING_INSPECTION",
    });
    expect(observation.status).toBe("DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE");
    expect(observation.summary).toContain("Page 1 was read using OCR.");
  });
});
