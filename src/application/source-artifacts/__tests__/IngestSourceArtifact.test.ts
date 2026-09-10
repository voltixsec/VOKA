import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { sourceArtifact: { findFirst, create } } }));
vi.mock("@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage", () => ({ LocalSourceArtifactStorage: class { put = put; remove = remove; } }));

import { ingestSourceArtifact } from "../IngestSourceArtifact";

function pdfFile() {
  const stream = "BT (Ingested PDF bytes) Tj ET";
  const bytes = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n3 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n%%EOF`, "latin1");
  return { bytes, file: new File([bytes], "boq.pdf", { type: "application/pdf" }) };
}

describe("source artifact application ingestion", () => {
  it("stores actual PDF bytes with server hash and authenticated tenant ownership", async () => {
    const { bytes, file } = pdfFile();
    findFirst.mockResolvedValueOnce(null);
    put.mockResolvedValueOnce({ storageRef: "aa/" + "a".repeat(64), sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.byteLength });
    create.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({ id: "server-artifact-id", ...data, citations: [] }));
    const result = await ingestSourceArtifact({ companyId: "tenant-1", userId: "user-1", file, context: "SALES_ASSISTANT" });
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    expect(put).toHaveBeenCalledWith(bytes, expectedHash);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ companyId: "tenant-1", createdByUserId: "user-1", contentSha256: expectedHash, sizeBytes: bytes.byteLength, storageRef: "aa/" + "a".repeat(64), processingState: "TEXT_EXTRACTED" }) }));
    expect(result.artifact.id).toBe("server-artifact-id");
    expect(result.artifact).not.toHaveProperty("clientGeneratedId");
  });
});
