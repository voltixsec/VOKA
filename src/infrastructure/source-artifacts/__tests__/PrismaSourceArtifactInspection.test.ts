import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCitation } from "@/src/application/conversation-runtime";

const db = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  requirement: { upsert: vi.fn() },
  requirementCitation: { upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { parseBoqCandidates } from "../BoqCandidateParser";
import { PrismaSourceArtifactInspection, storage } from "../PrismaSourceArtifactInspection";

const citation = (id: string, pageNumber: number | null, artifactId = "artifact-1"): ToolCitation => ({ id, sourceArtifactId: artifactId, sourceType: "SOURCE_ARTIFACT_TEXT", title: "boq.pdf", pageNumber, provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", supportedClaimSummary: "BOQ" });
const scope = { context: "SALES_ASSISTANT" as const, conversationRuntimeId: "runtime-A" };

describe("conservative BOQ candidate parsing with claim-specific citations", () => {
  it("links a citation only to the line proven on that citation's page and leaves the rest unlinked", () => {
    const pages = [{ pageNumber: 1, text: "1 IP camera 4MP each", characterCount: 20 }, { pageNumber: 2, text: "12 CAT6 cable m\n3 Rack set", characterCount: 26 }];
    const result = parseBoqCandidates({ text: "1 IP camera 4MP each\n12 CAT6 cable m\n3 Rack set", artifactId: "artifact-1", citations: [citation("citation-p1", 1), citation("citation-p2", 2)], pages, scope });
    expect(result).toEqual([
      expect.objectContaining({ quantity: 1, unit: "each", quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", citationId: "citation-p1" }),
      expect.objectContaining({ quantity: 12, unit: "m", citationId: "citation-p2" }),
      expect.objectContaining({ quantity: 3, unit: "set", citationId: "citation-p2" }),
    ]);
    expect(result.map((item) => item.stableKey)).toEqual(["SALES_ASSISTANT:runtime:runtime-A:artifact:artifact-1:boq:1", "SALES_ASSISTANT:runtime:runtime-A:artifact:artifact-1:boq:2", "SALES_ASSISTANT:runtime:runtime-A:artifact:artifact-1:boq:3"]);
  });

  it("never attaches a whole-document or page-1 citation when the line's page is unknown", () => {
    const withoutPages = parseBoqCandidates({ text: "1 IP camera each\n12 CAT6 cable m", artifactId: "artifact-1", citations: [citation("citation-doc", null), citation("citation-p1", 1)], pages: null, scope });
    expect(withoutPages.every((item) => item.citationId === undefined)).toBe(true);
    const ambiguous = parseBoqCandidates({ text: "5 Bolt each", artifactId: "artifact-1", citations: [citation("citation-p1", 1), citation("citation-p2", 2)], pages: [{ pageNumber: 1, text: "5 Bolt each", characterCount: 11 }, { pageNumber: 2, text: "5 Bolt each", characterCount: 11 }], scope });
    expect(ambiguous[0]?.citationId).toBeUndefined();
    const foreign = parseBoqCandidates({ text: "5 Bolt each", artifactId: "artifact-1", citations: [citation("citation-other", 1, "artifact-2")], pages: [{ pageNumber: 1, text: "5 Bolt each", characterCount: 11 }], scope });
    expect(foreign[0]?.citationId).toBeUndefined();
  });

  it("isolates identical BOQ structures per conversation runtime", () => {
    const input = { text: "1 IP camera each", artifactId: "artifact-1", citations: [], pages: null };
    const a = parseBoqCandidates({ ...input, scope: { context: "SALES_ASSISTANT", conversationRuntimeId: "runtime-A" } });
    const b = parseBoqCandidates({ ...input, scope: { context: "SALES_ASSISTANT", conversationRuntimeId: "runtime-B" } });
    expect(a[0]?.stableKey).not.toBe(b[0]?.stableKey);
    expect(parseBoqCandidates({ ...input, scope: { context: "SALES_ASSISTANT", conversationRuntimeId: "runtime-A" } })[0]?.stableKey).toBe(a[0]?.stableKey);
  });
});

describe("tenant-owned source artifact inspection", () => {
  const bytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF", "latin1");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const record = (overrides: Record<string, unknown> = {}) => ({
    id: "artifact-1", companyId: "tenant-1", originalFilename: "boq.pdf", kind: "PDF", storageRef: `${sha.slice(0, 2)}/${sha}`, contentSha256: sha,
    processingState: "TEXT_EXTRACTED", extractedText: "1 IP camera each", extractedPages: [{ pageNumber: 1, text: "1 IP camera each", characterCount: 16 }], conversationRuntimeId: "runtime-A",
    citations: [{ id: "citation-1", sourceType: "SOURCE_ARTIFACT_TEXT", title: "boq.pdf", pageNumber: 1, sheet: null, section: null, lineLocator: null, url: null, publisher: null, provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null, supportedClaimSummary: "1 IP camera each" }],
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.VOKA_ARTIFACT_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "voka-artifacts-"));
    await storage.put(bytes, sha);
    db.requirement.upsert.mockResolvedValue({ id: "requirement-1" });
  });
  afterEach(() => { delete process.env.VOKA_ARTIFACT_STORAGE_DIR; });

  it("retrieves only tenant-owned artifacts; another tenant's id is UNAVAILABLE and nothing is read", async () => {
    db.sourceArtifact.findFirst.mockResolvedValueOnce(null);
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-2", artifactId: "artifact-1", kind: "ATTACHMENT_INSPECTION", query: "read" });
    expect(db.sourceArtifact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "artifact-1", companyId: "tenant-2" } }));
    expect(result).toMatchObject({ status: "UNAVAILABLE", citations: [] });
    expect(result.extractedText).toBeUndefined();
  });

  it("orders persisted citations by page then observedAt and completes a BOQ inspection on genuinely extracted content", async () => {
    db.sourceArtifact.findFirst.mockResolvedValueOnce(record());
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-1", artifactId: "artifact-1", kind: "BOQ_INSPECTION", query: "boq", conversationRuntimeId: "runtime-A" });
    expect(db.sourceArtifact.findFirst.mock.calls[0]?.[0]).toMatchObject({ include: { citations: { orderBy: [{ pageNumber: "asc" }, { observedAt: "asc" }] } } });
    expect(result.status).toBe("COMPLETED");
    expect(result.requirementCandidates).toEqual([expect.objectContaining({ quantity: 1, citationId: "citation-1", stableKey: "SALES_ASSISTANT:runtime:runtime-A:artifact:artifact-1:boq:1" })]);
    expect(db.requirement.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId_stableKey: { companyId: "tenant-1", stableKey: "SALES_ASSISTANT:runtime:runtime-A:artifact:artifact-1:boq:1" } } }));
    expect(db.requirementCitation.upsert).toHaveBeenCalledTimes(1);
  });

  it("reports TEXT_NOT_EXTRACTABLE for a scanned PDF instead of pretending an inspection ran", async () => {
    db.sourceArtifact.findFirst.mockResolvedValueOnce(record({ processingState: "TEXT_NOT_EXTRACTABLE", extractedText: null, extractedPages: null, citations: [] }));
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-1", artifactId: "artifact-1", kind: "BOQ_INSPECTION", query: "boq" });
    expect(result.status).toBe("TEXT_NOT_EXTRACTABLE");
    expect(result.requirementCandidates).toBeUndefined();
    expect(db.requirement.upsert).not.toHaveBeenCalled();
  });

  it("keeps drawing inspection explicitly unsupported for visual analysis", async () => {
    db.sourceArtifact.findFirst.mockResolvedValueOnce(record());
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-1", artifactId: "artifact-1", kind: "DRAWING_INSPECTION", query: "count cameras" });
    expect(result.status).toBe("DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE");
    expect(db.requirement.upsert).not.toHaveBeenCalled();
  });

  it("refuses to inspect when the retained bytes no longer match the stored hash", async () => {
    db.sourceArtifact.findFirst.mockResolvedValueOnce(record({ contentSha256: "0".repeat(64) }));
    const result = await new PrismaSourceArtifactInspection().inspect({ companyId: "tenant-1", artifactId: "artifact-1", kind: "ATTACHMENT_INSPECTION", query: "read" });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.summary).toContain("could not be verified");
  });
});
