import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OcrPort } from "@/src/application/source-artifacts/ports";
import type { OcrPageRequest } from "@/src/domain/source-artifact";
import { deterministicOcrEngine } from "@/src/infrastructure/source-artifacts/ocr/DeterministicOcrEngine";
import { BOQ_SHEET, SCANNED_SHEET, buildPdf } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/pdfFixtures";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ingestSourceArtifact } from "../IngestSourceArtifact";

const BOQ_SCAN = [
  "BILL OF QUANTITIES",
  "ITEM DESCRIPTION QTY UNIT",
  "1.1 Supply and install fire pump set 2 nos",
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

function pdfFile(bytes: Buffer, name = "scan.pdf"): File {
  return new File([bytes as unknown as BlobPart], name, { type: "application/pdf" });
}

beforeAll(() => {
  process.env.VOKA_ARTIFACT_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "voka-ocr-ingest-"));
});

afterAll(() => {
  rmSync(process.env.VOKA_ARTIFACT_STORAGE_DIR!, { recursive: true, force: true });
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
});

function resetPrisma() {
  prismaMock.sourceArtifact.findFirst.mockReset();
  prismaMock.sourceArtifact.create.mockReset();
}

describe("ingest with OCR (2A-2B)", () => {
  it("persists OCR results at ingest so later inspections reuse them", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    let created: Record<string, unknown> = {};
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      created = args.data;
      return { id: "artifact-1", citations: [] };
    });
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": BOQ_SCAN }));
    const result = await ingestSourceArtifact({
      companyId: "company-1",
      userId: "user-1",
      file: pdfFile(buildPdf([SCANNED_SHEET])),
      context: "SALES_ASSISTANT",
      ocr: port,
    });
    expect(result.idempotent).toBe(false);
    expect(calls).toHaveLength(1);
    expect(created.processingState).toBe("TEXT_EXTRACTED");
    expect(created.extractedText).toContain("BILL OF QUANTITIES");
    const pages = (created.extractedPages as { pages: Array<Record<string, unknown>> }).pages;
    expect(pages[0]?.ocrText).toBe(BOQ_SCAN);
    expect(pages[0]?.textSource).toBe("OCR");
    expect(pages[0]?.ocr).toMatchObject({ requested: true, status: "COMPLETED" });
    // One citation for the OCR-read page, still received-not-verified.
    const citations = created.citations as { create: Array<Record<string, unknown>> };
    expect(citations.create).toHaveLength(1);
    expect(citations.create[0]).toMatchObject({ pageNumber: 1, verificationState: "RECEIVED_NOT_USER_VERIFIED" });
  });

  it("never invokes OCR for native-text uploads", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: "a", citations: [], ...args.data }));
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": "SHOULD NOT BE USED" }));
    await ingestSourceArtifact({
      companyId: "c",
      userId: "u",
      file: pdfFile(buildPdf([BOQ_SHEET]), "native.pdf"),
      context: "SALES_ASSISTANT",
      ocr: port,
    });
    expect(calls).toHaveLength(0);
    const created = prismaMock.sourceArtifact.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.processingState).toBe("TEXT_EXTRACTED");
    const pages = (created.data.extractedPages as { pages: Array<Record<string, unknown>> }).pages;
    expect(pages[0]?.ocr).toBeUndefined();
    expect(pages[0]?.ocrText).toBeUndefined();
  });

  it("keeps the upload succeeding with native readings when the engine throws", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: "a", citations: [], ...args.data }));
    const explosive: OcrPort = {
      engineId: "explosive",
      recognize: async () => { throw new Error("worker crashed"); },
    };
    // A throwing engine degrades to FAILED inside the analyzer, so ingest still succeeds.
    const result = await ingestSourceArtifact({
      companyId: "c",
      userId: "u",
      file: pdfFile(buildPdf([SCANNED_SHEET])),
      context: "SALES_ASSISTANT",
      ocr: explosive,
    });
    expect(result.idempotent).toBe(false);
    const created = prismaMock.sourceArtifact.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.processingState).toBe("STORED_PENDING_VISION");
    expect(created.data.citations).toBeUndefined();
  });

  it("stays native-only when OCR is explicitly null or not configured", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: "a", citations: [], ...args.data }));
    await ingestSourceArtifact({
      companyId: "c", userId: "u", file: pdfFile(buildPdf([SCANNED_SHEET])), context: "SALES_ASSISTANT", ocr: null,
    });
    const created = prismaMock.sourceArtifact.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.processingState).toBe("STORED_PENDING_VISION");
    const pages = (created.data.extractedPages as { pages: Array<Record<string, unknown>> }).pages;
    expect(pages[0]?.ocr).toBeUndefined();

    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: "a", citations: [], ...args.data }));
    const saved = process.env.VOKA_OCR_ENGINE;
    delete process.env.VOKA_OCR_ENGINE;
    try {
      await ingestSourceArtifact({ companyId: "c", userId: "u", file: pdfFile(buildPdf([SCANNED_SHEET])), context: "SALES_ASSISTANT" });
    } finally {
      if (saved === undefined) delete process.env.VOKA_OCR_ENGINE;
      else process.env.VOKA_OCR_ENGINE = saved;
    }
    const fallback = prismaMock.sourceArtifact.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(fallback.data.processingState).toBe("STORED_PENDING_VISION");
  });

  it("never re-runs OCR for an idempotent re-upload", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue({ id: "existing", citations: [] });
    const { calls, port } = counting(deterministicOcrEngine({ "page:1": BOQ_SCAN }));
    const result = await ingestSourceArtifact({
      companyId: "c", userId: "u", file: pdfFile(buildPdf([SCANNED_SHEET])), context: "SALES_ASSISTANT", ocr: port,
    });
    expect(result).toMatchObject({ idempotent: true });
    expect(calls).toHaveLength(0);
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });
});
