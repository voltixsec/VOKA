import { describe, expect, it, vi } from "vitest";

const ingest = vi.hoisted(() => vi.fn());
vi.mock("@/src/application/source-artifacts/IngestSourceArtifact", () => ({
  SourceArtifactPolicyError: class SourceArtifactPolicyError extends Error { code = "SOURCE_ARTIFACT_REQUIRED"; },
  ingestSourceArtifact: ingest,
}));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error { static badRequest(code: string, message: string) { return Object.assign(new Error(message), { code, status: 400 }); } },
  apiSuccess: (data: unknown, options?: ResponseInit) => Response.json({ data }, options),
  withCompanyAuth: (_roles: readonly string[], handler: Function) => (request: Request) => handler(request, { user: { id: "user-1" } }, { companyId: "tenant-1" }),
}));

import { POST } from "../route";

describe("source artifact intake", () => {
  it("posts a real multipart File and binds ingestion to the authenticated tenant", async () => {
    ingest.mockResolvedValueOnce({ idempotent: false, artifact: { id: "artifact-1", originalFilename: "boq.pdf", mimeType: "application/pdf", sizeBytes: 7, contentSha256: "hash", kind: "PDF", context: "SALES_ASSISTANT", processingState: "TEXT_EXTRACTED", conversationRuntimeId: null, createdAt: new Date(), extractedText: "BOQ", citations: [] } });
    const form = new FormData();
    form.set("file", new File(["%PDF-1.4"], "boq.pdf", { type: "application/pdf" }));
    form.set("context", "SALES_ASSISTANT");
    const response = await POST(new Request("https://voka.local/api/source-artifacts", { method: "POST", body: form }));
    expect(response.status).toBe(201);
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant-1", userId: "user-1", context: "SALES_ASSISTANT", file: expect.any(File) }));
  });
});
