import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ingestSourceArtifact, ingestSourceArtifactBytes, SourceArtifactPolicyError } from "../IngestSourceArtifact";

/**
 * Phase 2A-9 test matrix items 10-14 plus RFA/size policy: a proprietary DWG or
 * RVT original is stored immutably with NO inspection semantics — no extracted
 * text, no page model, no citations — and stays independently addressable from
 * any derived artifact. A renamed random file and a generic OLE compound file
 * are rejected by the byte gates; a Revit family definition is named and
 * rejected truthfully. The 25 MB limit is NOT raised for proprietary files.
 */

function dwgBytes(version = "AC1027"): Buffer {
  return Buffer.concat([Buffer.from(version, "latin1"), Buffer.from([0x00, 0x7c, 0x1f, 0x9b]), Buffer.alloc(64, 0x3c)]);
}

function rvtBytes(): Buffer {
  const marker = Buffer.from(Array.from("BasicFileInfo").flatMap((character) => [character.charCodeAt(0), 0x00]));
  return Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(24, 0x00), marker, Buffer.alloc(24, 0x00)]);
}

function genericOle(): Buffer {
  return Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512, 0x00)]);
}

beforeAll(() => {
  process.env.VOKA_ARTIFACT_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "voka-proprietary-ingest-"));
});

afterAll(() => {
  rmSync(process.env.VOKA_ARTIFACT_STORAGE_DIR!, { recursive: true, force: true });
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
});

function resetPrisma() {
  prismaMock.sourceArtifact.findFirst.mockReset();
  prismaMock.sourceArtifact.create.mockReset();
  prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
}

let created: Record<string, unknown> = {};

function captureCreate() {
  created = {};
  prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
    created = args.data;
    return { id: "artifact-original", citations: [] };
  });
}

describe("proprietary original ingest (2A-9)", () => {
  it("10 stores a real DWG immutably as a DWG original with no extracted content", async () => {
    resetPrisma();
    captureCreate();
    const result = await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([dwgBytes() as unknown as BlobPart], "site.dwg", { type: "image/vnd.dwg" }),
      context: "SALES_ASSISTANT",
    });
    expect(result.idempotent).toBe(false);
    expect(created.kind).toBe("DWG");
    expect(created.mimeType).toBe("image/vnd.dwg");
    expect(created.processingState).toBe("RECEIVED");
    expect(created.extractedText ?? null).toBeNull();
    expect(created.extractedPages).toBeUndefined();
    expect(created.citations).toBeUndefined();
    expect(created.sizeBytes).toBe(dwgBytes().length);
    expect(created.contentSha256).toBeTruthy();
  });

  it("11 stores a real RVT immutably as an RVT original with no extracted content", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([rvtBytes() as unknown as BlobPart], "tower.rvt", { type: "application/octet-stream" }),
      context: "TAKEOFF",
    });
    expect(created.kind).toBe("RVT");
    expect(created.mimeType).toBe("application/vnd.revit.rvt");
    expect(created.context).toBe("TAKEOFF");
    expect(created.processingState).toBe("RECEIVED");
    expect(created.extractedText ?? null).toBeNull();
    expect(created.extractedPages).toBeUndefined();
    expect(created.citations).toBeUndefined();
  });

  it("12 keeps the original independently addressable: its row identity is its own hash and name", async () => {
    resetPrisma();
    captureCreate();
    const findFirstArgs: Array<Record<string, unknown>> = [];
    prismaMock.sourceArtifact.findFirst.mockImplementation(async (args: Record<string, unknown>) => {
      findFirstArgs.push(args);
      return null;
    });
    await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([dwgBytes() as unknown as BlobPart], "site.dwg", { type: "image/vnd.dwg" }),
      context: "SALES_ASSISTANT",
    });
    const dwgLookup = findFirstArgs.at(-1);
    await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([rvtBytes() as unknown as BlobPart], "tower.rvt", { type: "application/octet-stream" }),
      context: "SALES_ASSISTANT",
    });
    const rvtLookup = findFirstArgs.at(-1);
    // Each original is looked up (and therefore addressable) by its own
    // content hash + filename tuple, never by any derived artifact identity.
    expect((dwgLookup!.where as Record<string, unknown>).originalFilename).toBe("site.dwg");
    expect((rvtLookup!.where as Record<string, unknown>).originalFilename).toBe("tower.rvt");
    expect((dwgLookup!.where as Record<string, unknown>).contentSha256).not.toBe((rvtLookup!.where as Record<string, unknown>).contentSha256);
  });

  it("3 rejects a renamed random file declared as DWG, with content that carries no signature", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([Buffer.from("totally random content, no signature") as unknown as BlobPart], "renamed.dwg", { type: "image/vnd.dwg" }),
      context: "SALES_ASSISTANT",
    })).rejects.toBeInstanceOf(SourceArtifactPolicyError);
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("5 rejects a generic OLE compound file renamed to .rvt", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([genericOle() as unknown as BlobPart], "document.rvt", { type: "application/octet-stream" }),
      context: "SALES_ASSISTANT",
    })).rejects.toBeInstanceOf(SourceArtifactPolicyError);
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("6 rejects a Revit family definition (.rfa) truthfully, by name", async () => {
    resetPrisma();
    captureCreate();
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([rvtBytes() as unknown as BlobPart], "door.rfa", { type: "application/octet-stream" }),
      context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({
      code: "SOURCE_ARTIFACT_RFA_UNSUPPORTED",
      message: expect.stringContaining("Revit family definition (.rfa)"),
    });
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("does not raise the accepted 25 MB limit for a proprietary original", async () => {
    resetPrisma();
    captureCreate();
    const oversized = Buffer.concat([Buffer.from("AC1027", "latin1"), Buffer.alloc(25 * 1024 * 1024 + 1, 0x41)]);
    await expect(ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([oversized as unknown as BlobPart], "huge.dwg", { type: "image/vnd.dwg" }),
      context: "SALES_ASSISTANT",
    })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_SIZE_INVALID" });
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("accepts a DWG the browser reported with a generic type, keyed off its extension", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifact({
      companyId: "company-1", userId: "user-1",
      file: new File([dwgBytes("AC1032") as unknown as BlobPart], "plan.dwg", { type: "application/octet-stream" }),
      context: "SALES_ASSISTANT",
    });
    expect(created.kind).toBe("DWG");
  });

  it("13/14 the raw-bytes primitive stores an original identically (no duplicate inspection path)", async () => {
    resetPrisma();
    captureCreate();
    await ingestSourceArtifactBytes({
      companyId: "company-1", userId: "user-1",
      bytes: dwgBytes("AC1018"),
      filename: "from-bytes.dwg",
      mimeType: "image/vnd.dwg",
      kind: "DWG",
      context: "SALES_ASSISTANT",
    });
    expect(created.kind).toBe("DWG");
    expect(created.processingState).toBe("RECEIVED");
    expect(created.extractedText ?? null).toBeNull();
    expect(created.citations).toBeUndefined();
    // And the primitive rejects invalid content exactly like the upload path.
    await expect(ingestSourceArtifactBytes({
      companyId: "company-1", userId: "user-1",
      bytes: Buffer.from("not really a dwg"),
      filename: "fake.dwg",
      mimeType: "image/vnd.dwg",
      kind: "DWG",
      context: "SALES_ASSISTANT",
    })).rejects.toBeInstanceOf(SourceArtifactPolicyError);
  });
});
