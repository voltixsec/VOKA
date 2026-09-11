import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/imageFixtures";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ingestSourceArtifact, SourceArtifactPolicyError } from "../IngestSourceArtifact";

function imageFile(bytes: Buffer, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

beforeAll(() => {
  process.env.VOKA_ARTIFACT_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "voka-image-ingest-"));
});

afterAll(() => {
  rmSync(process.env.VOKA_ARTIFACT_STORAGE_DIR!, { recursive: true, force: true });
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
});

function resetPrisma() {
  prismaMock.sourceArtifact.findFirst.mockReset();
  prismaMock.sourceArtifact.create.mockReset();
}

describe("image ingest (2A-3)", () => {
  it.each([
    ["panel.png", "image/png", PNG_BYTES],
    ["panel.jpg", "image/jpeg", JPEG_BYTES],
    ["panel.webp", "image/webp", WEBP_BYTES],
  ])("stores %s as an undescribed IMAGE artifact awaiting vision", async (name, type, bytes) => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    let created: Record<string, unknown> = {};
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      created = args.data;
      return { id: "artifact-1", citations: [] };
    });
    const result = await ingestSourceArtifact({
      companyId: "company-1",
      userId: "user-1",
      file: imageFile(bytes, name, type),
      context: "SALES_ASSISTANT",
    });
    expect(result.idempotent).toBe(false);
    expect(created).toMatchObject({
      kind: "IMAGE",
      mimeType: type,
      originalFilename: name,
      processingState: "STORED_PENDING_VISION",
      extractedText: null,
    });
    expect(created.extractedPages).toBeUndefined();
    expect(typeof created.contentSha256).toBe("string");
    expect(typeof created.storageRef).toBe("string");
  });

  it("rejects bytes that do not match the declared image type", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    await expect(ingestSourceArtifact({
      companyId: "c",
      userId: "u",
      file: imageFile(Buffer.from("not an image at all"), "fake.png", "image/png"),
      context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_CONTENT_INVALID" });
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    await expect(ingestSourceArtifact({
      companyId: "c",
      userId: "u",
      file: imageFile(PNG_BYTES, "anim.gif", "image/gif"),
      context: "SALES_ASSISTANT",
    })).rejects.toBeInstanceOf(SourceArtifactPolicyError);
  });

  it("returns the existing artifact for an idempotent image re-upload", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue({ id: "existing", citations: [] });
    const result = await ingestSourceArtifact({
      companyId: "c",
      userId: "u",
      file: imageFile(PNG_BYTES, "panel.png", "image/png"),
      context: "SALES_ASSISTANT",
    });
    expect(result).toMatchObject({ idempotent: true });
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });
});
