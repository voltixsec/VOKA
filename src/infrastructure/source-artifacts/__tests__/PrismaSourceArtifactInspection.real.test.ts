import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
const getBytes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { sourceArtifact: { findFirst } } }));
vi.mock("../LocalSourceArtifactStorage", () => ({ LocalSourceArtifactStorage: class { get = getBytes; } }));

import { PrismaSourceArtifactInspection } from "../PrismaSourceArtifactInspection";

function pdfBytes() {
  const stream = "BT (Real PDF content) Tj ET";
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n3 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, "latin1");
}

describe("real source artifact inspection", () => {
  it("retrieves retained bytes, verifies the hash, and reads PDF text", async () => {
    const bytes = pdfBytes();
    const hash = createHash("sha256").update(bytes).digest("hex");
    findFirst.mockResolvedValueOnce({ id: "artifact-1", companyId: "tenant-1", originalFilename: "boq.pdf", kind: "PDF", context: "SALES_ASSISTANT", storageRef: `aa/${hash}`, contentSha256: hash, processingState: "TEXT_EXTRACTED", extractedText: null, citations: [] });
    getBytes.mockResolvedValueOnce(bytes);
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-1", artifactId: "artifact-1", kind: "ATTACHMENT_INSPECTION", query: "read it" });
    expect(result).toMatchObject({ status: "COMPLETED", artifactId: "artifact-1", extractedText: "Real PDF content" });
    expect(getBytes).toHaveBeenCalledWith(`aa/${hash}`);
  });

  it("fails closed when retained bytes no longer match the persisted hash", async () => {
    const bytes = pdfBytes();
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    findFirst.mockResolvedValueOnce({ id: "artifact-1", companyId: "tenant-1", originalFilename: "boq.pdf", kind: "PDF", context: "SALES_ASSISTANT", storageRef: "aa/" + expectedHash, contentSha256: expectedHash, processingState: "TEXT_EXTRACTED", extractedText: "stale", citations: [] });
    getBytes.mockResolvedValueOnce(Buffer.from("%PDF-1.4\nchanged"));
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-1", artifactId: "artifact-1", kind: "ATTACHMENT_INSPECTION", query: "read it" });
    expect(result).toMatchObject({ status: "UNAVAILABLE", summary: expect.stringContaining("could not be verified") });
  });

  it("fails closed for a cross-tenant artifact lookup", async () => {
    findFirst.mockResolvedValueOnce(null);
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-2", artifactId: "artifact-1", kind: "ATTACHMENT_INSPECTION", query: "read it" });
    expect(result).toMatchObject({ status: "UNAVAILABLE", artifactId: "artifact-1" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "artifact-1", companyId: "tenant-2" } }));
  });
});
