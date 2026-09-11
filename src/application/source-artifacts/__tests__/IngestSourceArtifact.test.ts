import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sourceArtifact: { findFirst: vi.fn(), create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ingestSourceArtifact } from "../IngestSourceArtifact";

const textPdf = (text: string) => { const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`; return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n3 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, "latin1"); };
const scannedPdf = () => Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n4 0 obj\n<< /Length 10 >>\nstream\n\u00ff\u00d8\u00ff\u00e0imgdata\nendstream\nendobj\n%%EOF", "latin1");
const file = (bytes: Buffer, name: string, type = "application/pdf") => new File([new Uint8Array(bytes)], name, { type });
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const blobPath = (directory: string, bytes: Buffer) => path.join(directory, sha(bytes).slice(0, 2), sha(bytes));

describe("source artifact ingestion", () => {
  let directory: string;
  beforeEach(() => { vi.clearAllMocks(); directory = mkdtempSync(path.join(tmpdir(), "voka-ingest-")); process.env.VOKA_ARTIFACT_STORAGE_DIR = directory; db.sourceArtifact.findFirst.mockResolvedValue(null); db.sourceArtifact.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "artifact-new", ...data, citations: [] })); });
  afterEach(() => { delete process.env.VOKA_ARTIFACT_STORAGE_DIR; });

  it("persists server-received bytes with SHA-256, tenant ownership, TEXT_EXTRACTED state and a page-1 citation only when the page is known", async () => {
    const bytes = textPdf("1 IP camera each");
    const result = await ingestSourceArtifact({ companyId: "tenant-1", userId: "user-1", file: file(bytes, "boq.pdf"), context: "SALES_ASSISTANT", conversationRuntimeId: "runtime-A" });
    expect(result.idempotent).toBe(false);
    const data = db.sourceArtifact.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ companyId: "tenant-1", createdByUserId: "user-1", contentSha256: sha(bytes), kind: "PDF", processingState: "TEXT_EXTRACTED", conversationRuntimeId: "runtime-A", extractedText: "1 IP camera each" });
    expect(data.citations.create).toEqual([expect.objectContaining({ companyId: "tenant-1", pageNumber: 1, verificationState: "RECEIVED_NOT_USER_VERIFIED", supportedClaimSummary: "1 IP camera each" })]);
    expect(existsSync(blobPath(directory, bytes))).toBe(true);
  });

  it("marks a scanned or image-only PDF as TEXT_NOT_EXTRACTABLE with no text, no pages and no fabricated citation", async () => {
    await ingestSourceArtifact({ companyId: "tenant-1", userId: "user-1", file: file(scannedPdf(), "scan.pdf"), context: "SALES_ASSISTANT" });
    const data = db.sourceArtifact.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ processingState: "TEXT_NOT_EXTRACTABLE", extractedText: null });
    expect(data.extractedPages).toBeUndefined();
    expect(data.citations).toBeUndefined();
  });

  it("rejects content whose signature does not match the declared type before storing anything", async () => {
    const fake = Buffer.from("not really a pdf");
    await expect(ingestSourceArtifact({ companyId: "tenant-1", userId: "user-1", file: file(fake, "fake.pdf"), context: "SALES_ASSISTANT" })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
    expect(existsSync(blobPath(directory, fake))).toBe(false);
    expect(db.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("keeps shared bytes when the database write fails, so other artifacts with the same hash are never broken", async () => {
    const bytes = textPdf("Shared BOQ");
    await ingestSourceArtifact({ companyId: "tenant-1", userId: "user-1", file: file(bytes, "first.pdf"), context: "SALES_ASSISTANT" });
    db.sourceArtifact.create.mockRejectedValueOnce(new Error("DB_WRITE_FAILED"));
    await expect(ingestSourceArtifact({ companyId: "tenant-2", userId: "user-2", file: file(bytes, "second.pdf"), context: "SALES_ASSISTANT" })).rejects.toThrow("DB_WRITE_FAILED");
    expect(existsSync(blobPath(directory, bytes))).toBe(true);
    const retry = await ingestSourceArtifact({ companyId: "tenant-2", userId: "user-2", file: file(bytes, "second.pdf"), context: "SALES_ASSISTANT" });
    expect(retry.idempotent).toBe(false);
    expect(db.sourceArtifact.create).toHaveBeenCalledTimes(3);
  });

  it("returns the existing tenant artifact for a duplicate upload and recovers a lost unique race idempotently", async () => {
    const bytes = textPdf("Duplicate");
    const existing = { id: "artifact-existing", companyId: "tenant-1", contentSha256: sha(bytes), citations: [] };
    db.sourceArtifact.findFirst.mockResolvedValueOnce(existing);
    expect(await ingestSourceArtifact({ companyId: "tenant-1", userId: "user-1", file: file(bytes, "dup.pdf"), context: "SALES_ASSISTANT" })).toEqual({ artifact: existing, idempotent: true });
    expect(db.sourceArtifact.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { companyId: "tenant-1", contentSha256: sha(bytes), originalFilename: "dup.pdf" } }));
    db.sourceArtifact.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    db.sourceArtifact.create.mockRejectedValueOnce(new Error("Unique constraint failed"));
    expect(await ingestSourceArtifact({ companyId: "tenant-1", userId: "user-1", file: file(bytes, "dup.pdf"), context: "SALES_ASSISTANT" })).toEqual({ artifact: existing, idempotent: true });
    expect(existsSync(blobPath(directory, bytes))).toBe(true);
  });
});
