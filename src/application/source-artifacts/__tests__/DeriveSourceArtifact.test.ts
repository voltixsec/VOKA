import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deterministicConversionProvider, minimalAsciiDxf, minimalIfc, zipOutput } from "@/src/infrastructure/source-artifacts/conversion/DeterministicConversionProvider";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";

/**
 * Phase 2A-9 test matrix items 34-50 and 57-61: the automated derivation
 * orchestration on a deterministic fake provider — output re-validation,
 * derived ingest through the COMMON path, idempotent reuse, terminal states,
 * bounded channels, and the no-promotion governance boundary.
 */

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  artifactDerivation: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  requirement: { upsert: vi.fn(), create: vi.fn() },
  quotation: { create: vi.fn() },
  quotationLine: { create: vi.fn() },
  supplier: { create: vi.fn() },
  productSelection: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { deriveSourceArtifact } from "../DeriveSourceArtifact";
import type { ConversionResult } from "@/src/application/source-artifacts/ports";

const storage = new LocalSourceArtifactStorage();
let directory = "";

const dwgBytes = Buffer.concat([Buffer.from("AC1027", "latin1"), Buffer.from([0x00, 0x55, 0xaa, 0xff]), Buffer.alloc(48, 0x5a)]);
const rvtBytes = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(16, 0x00),
  Buffer.from(Array.from("BasicFileInfo").flatMap((character) => [character.charCodeAt(0), 0x00])),
  Buffer.alloc(16, 0x00),
]);
const dwgHash = createHash("sha256").update(dwgBytes).digest("hex");
const rvtHash = createHash("sha256").update(rvtBytes).digest("hex");

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "voka-derive-"));
  process.env.VOKA_ARTIFACT_STORAGE_DIR = directory;
  await storage.put(dwgBytes, dwgHash);
  await storage.put(rvtBytes, rvtHash);
});

afterAll(() => {
  delete process.env.VOKA_ARTIFACT_STORAGE_DIR;
  rmSync(directory, { recursive: true, force: true });
});

function originalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "original-dwg",
    companyId: "company-1",
    originalFilename: "site.dwg",
    mimeType: "image/vnd.dwg",
    kind: "DWG",
    contentSha256: dwgHash,
    storageRef: `${dwgHash.slice(0, 2)}/${dwgHash}`,
    context: "SALES_ASSISTANT",
    conversationRuntimeId: null,
    processingState: "RECEIVED",
    ...overrides,
  };
}

function resetPrisma() {
  for (const model of [prismaMock.sourceArtifact, prismaMock.artifactDerivation, prismaMock.requirement, prismaMock.quotation, prismaMock.quotationLine, prismaMock.supplier, prismaMock.productSelection]) {
    for (const fn of Object.values(model)) vi.mocked(fn).mockReset();
  }
  prismaMock.sourceArtifact.update.mockResolvedValue({});
  prismaMock.artifactDerivation.upsert.mockImplementation(async (args: { create: Record<string, unknown> }) => ({ id: "derivation-1", ...args.create }));
  prismaMock.artifactDerivation.findUnique.mockResolvedValue(null);
  prismaMock.artifactDerivation.findMany.mockResolvedValue([]);
}

function mockIngestAwareFindFirst(original: Record<string, unknown> | null) {
  // The same findFirst serves the original lookup (by id) and the ingest
  // idempotency lookup (by contentSha256 + originalFilename of the DERIVED
  // file). Dispatch on the shape so the derived lookup returns null, exactly
  // like a real database.
  vi.mocked(prismaMock.sourceArtifact.findFirst).mockImplementation(async (args: { where: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    if (typeof where.originalFilename === "string" && where.originalFilename !== (original?.originalFilename ?? "")) return null;
    return original;
  });
}

describe("automated derivation orchestration (2A-9)", () => {
  it("34 converts a fake DWG into a valid ASCII DXF and records SUCCEEDED lineage", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-dxf", citations: [] });
    const outcome = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider: deterministicConversionProvider() });
    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.reused).toBe(false);
    expect(outcome.derivedArtifactId).toBe("derived-dxf");
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { create: Record<string, unknown>; update: Record<string, unknown> };
    expect(upsert.create.status).toBe("SUCCEEDED");
    expect(upsert.create.derivationKind).toBe("DWG_TO_DXF");
    expect(upsert.create.derivationMethod).toBe("AUTOMATED_CONVERSION");
    expect(upsert.create.converterId).toBe("deterministic-conversion-test-double");
    expect(upsert.create.converterVersion).toBe("test-1.0.0");
    expect(upsert.create.derivedArtifactId).toBe("derived-dxf");
    expect(upsert.create.derivedHash).toBe(createHash("sha256").update(minimalAsciiDxf(), "utf8").digest("hex"));
    expect(upsert.create.sourceHash).toBe(dwgHash);
    // Channel B: static VOKA fidelity limitations recorded on the lineage row.
    expect((upsert.create.fidelityLimitations as string[]).length).toBeGreaterThan(0);
  });

  it("35 rejects a fake binary-DXF output and records REJECTED with no derived artifact", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ outcomes: { DWG_TO_DXF: { kind: "BINARY_DXF" } } }),
    });
    expect(outcome.status).toBe("REJECTED");
    expect(outcome.derivedArtifactId).toBeNull();
    expect(outcome.failureReason).toContain("not accepted as an ASCII DXF");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsert.create.status).toBe("REJECTED");
  });

  it("36 rejects a fake random-text output as a rejected conversion", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ outcomes: { DWG_TO_DXF: { kind: "RANDOM_TEXT" } } }),
    });
    expect(outcome.status).toBe("REJECTED");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("35b rejects converter output that echoes DWG bytes instead of converting", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ outcomes: { DWG_TO_DXF: { kind: "DWG_BYTES" } } }),
    });
    expect(outcome.status).toBe("REJECTED");
  });

  it("37 converts a fake RVT into a valid textual IFC and records SUCCEEDED lineage", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow({ id: "original-rvt", kind: "RVT", originalFilename: "tower.rvt", mimeType: "application/vnd.revit.rvt", contentSha256: rvtHash, storageRef: `${rvtHash.slice(0, 2)}/${rvtHash}` }));
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-ifc", citations: [] });
    const outcome = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-rvt", provider: deterministicConversionProvider() });
    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.derivedArtifactId).toBe("derived-ifc");
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsert.create.derivationKind).toBe("RVT_TO_IFC");
    expect(upsert.create.sourceFormat).toBe("RVT");
    expect(upsert.create.derivedFormat).toBe("IFC");
    expect(upsert.create.derivedHash).toBe(createHash("sha256").update(minimalIfc(), "utf8").digest("hex"));
  });

  it("38 rejects a fake ZIP/IFCZIP RVT output", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow({ id: "original-rvt", kind: "RVT", originalFilename: "tower.rvt", contentSha256: rvtHash, storageRef: `${rvtHash.slice(0, 2)}/${rvtHash}` }));
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-rvt",
      provider: deterministicConversionProvider({ outcomes: { RVT_TO_IFC: { kind: "ZIP" } } }),
    });
    expect(outcome.status).toBe("REJECTED");
    expect(outcome.failureReason).toContain("not accepted as a textual IFC");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("39 rejects a fake random-text RVT output", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow({ id: "original-rvt", kind: "RVT", originalFilename: "tower.rvt", contentSha256: rvtHash, storageRef: `${rvtHash.slice(0, 2)}/${rvtHash}` }));
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-rvt",
      provider: deterministicConversionProvider({ outcomes: { RVT_TO_IFC: { kind: "RANDOM_TEXT" } } }),
    });
    expect(outcome.status).toBe("REJECTED");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("40/41 a successful derived artifact enters the COMMON accepted path: DXF structure, text, citations", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.sourceArtifact.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      // The derived artifact row must carry exactly what a normal DXF upload
      // would carry: same processing states, same CAD citations.
      expect(args.data.kind).toBe("DXF");
      expect(args.data.processingState).toBe("TEXT_EXTRACTED");
      expect(typeof args.data.extractedText).toBe("string");
      expect((args.data.extractedText as string).length).toBeGreaterThan(0);
      const citations = args.data.citations as { create: Array<Record<string, unknown>> };
      expect(citations.create.length).toBeGreaterThan(0);
      for (const citation of citations.create) {
        expect(citation.sourceType).toBe("SOURCE_ARTIFACT_DXF");
        expect(citation.pageNumber).toBeNull();
        expect(String(citation.lineLocator).startsWith("DXF:")).toBe(true);
      }
      return { id: "derived-dxf", citations: [] };
    });
    const outcome = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider: deterministicConversionProvider() });
    expect(outcome.status).toBe("SUCCEEDED");
    // The original row was never mutated by the derivation.
    expect(prismaMock.sourceArtifact.update).not.toHaveBeenCalled();
    expect(prismaMock.sourceArtifact.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.sourceArtifact.delete).not.toHaveBeenCalled();
  });

  it("42/43 reuses an existing SUCCEEDED derivation and never calls the provider again", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.artifactDerivation.findUnique.mockResolvedValue({
      id: "derivation-existing", status: "SUCCEEDED", derivedArtifactId: "derived-dxf", failureReason: null, warnings: [],
    });
    const calls: unknown[] = [];
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ onCall: (request) => calls.push(request) }),
    });
    expect(outcome.reused).toBe(true);
    expect(outcome.status).toBe("SUCCEEDED");
    expect(outcome.derivedArtifactId).toBe("derived-dxf");
    expect(calls).toHaveLength(0);
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
    expect(prismaMock.artifactDerivation.upsert).not.toHaveBeenCalled();
  });

  it("44 a provider version change produces a NEW derivation key without touching the old row", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-dxf-2", citations: [] });
    const old = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider: deterministicConversionProvider({ version: "1.0.0" }) });
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-dxf-2", citations: [] });
    const next = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider: deterministicConversionProvider({ version: "2.0.0" }) });
    expect(next.derivationKey).not.toBe(old.derivationKey);
    // The historical derivation was never overwritten: only upserts on the NEW key.
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { where: Record<string, unknown> };
    expect((upsert.where as { companyId_derivationKey: { derivationKey: string } }).companyId_derivationKey.derivationKey).toBe(next.derivationKey);
  });

  it("45 records a provider failure as FAILED with its reason", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ outcomes: { DWG_TO_DXF: { kind: "FAILED", reason: "the converter crashed on this drawing" } } }),
    });
    expect(outcome.status).toBe("FAILED");
    expect(outcome.failureReason).toContain("crashed");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsert.create.status).toBe("FAILED");
  });

  it("46 records rejected output and keeps the rejection reason truthful", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ outcomes: { DWG_TO_DXF: { kind: "ZIP" } } }),
    });
    expect(outcome.status).toBe("REJECTED");
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsert.create.status).toBe("REJECTED");
    expect(upsert.create.failureReason).toContain("not accepted as an ASCII DXF");
  });

  it("47 the original artifact row is never mutated after conversion", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-dxf", citations: [] });
    await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider: deterministicConversionProvider() });
    expect(prismaMock.sourceArtifact.update).not.toHaveBeenCalled();
    expect(prismaMock.sourceArtifact.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.sourceArtifact.delete).not.toHaveBeenCalled();
    // And the original bytes on disk are untouched.
    expect(readFileSync(path.join(directory, `${dwgHash.slice(0, 2)}`, dwgHash))).toEqual(dwgBytes);
  });

  it("49/50 bounds provider warnings and never merges them with VOKA fidelity limitations", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-dxf", citations: [] });
    const warnings = Array.from({ length: 25 }, (_, index) => `provider warning ${index}`);
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ warnings }),
    });
    expect(outcome.warnings.length).toBeLessThanOrEqual(10);
    expect(outcome.warnings.every((warning) => warning.startsWith("provider warning"))).toBe(true);
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { create: Record<string, unknown> };
    expect((upsert.create.warnings as string[]).length).toBeLessThanOrEqual(10);
    expect((upsert.create.fidelityLimitations as string[]).length).toBeGreaterThan(0);
    for (const warning of upsert.create.warnings as string[]) {
      expect((upsert.create.fidelityLimitations as string[])).not.toContain(warning);
    }
  });

  it("57-61 derivation never creates a Requirement, BOM, quotation line, or procurement object", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-dxf", citations: [] });
    await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider: deterministicConversionProvider() });
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.requirement.create).not.toHaveBeenCalled();
    expect(prismaMock.quotation.create).not.toHaveBeenCalled();
    expect(prismaMock.quotationLine.create).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    expect(prismaMock.productSelection.create).not.toHaveBeenCalled();
  });

  it("31 records NOT_CONFIGURED when no provider is configured (production default)", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const outcome = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg" });
    expect(outcome.status).toBe("NOT_CONFIGURED");
    expect(outcome.failureReason).toContain("no conversion provider is configured");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
    const upsert = vi.mocked(prismaMock.artifactDerivation.upsert).mock.calls[0]![0] as { create: Record<string, unknown> };
    expect(upsert.create.status).toBe("NOT_CONFIGURED");
    expect(upsert.create.converterId).toBe("conversion-unavailable");
  });

  it("records NOT_CONFIGURED when the configured provider does not support the kind", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const provider = { ...deterministicConversionProvider(), supportedDerivationKinds: ["RVT_TO_IFC"] as const };
    const outcome = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider });
    expect(outcome.status).toBe("NOT_CONFIGURED");
  });

  it("refuses a non-proprietary original and a missing original truthfully", async () => {
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(originalRow({ kind: "PDF" }));
    await expect(deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-pdf", provider: deterministicConversionProvider() })).rejects.toMatchObject({ code: "DERIVATION_ORIGINAL_KIND_UNSUPPORTED" });
    resetPrisma();
    prismaMock.sourceArtifact.findFirst.mockResolvedValue(null);
    await expect(deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "missing", provider: deterministicConversionProvider() })).rejects.toMatchObject({ code: "SOURCE_ARTIFACT_NOT_FOUND" });
  });

  it("does not retry a terminal derivation with the same key", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    prismaMock.artifactDerivation.findUnique.mockResolvedValue({ id: "derivation-old", status: "REJECTED", derivedArtifactId: null, failureReason: "the conversion output was not accepted", warnings: [] });
    const calls: unknown[] = [];
    const outcome = await deriveSourceArtifact({
      companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg",
      provider: deterministicConversionProvider({ onCall: (request) => calls.push(request) }),
    });
    expect(outcome.reused).toBe(true);
    expect(outcome.status).toBe("REJECTED");
    expect(calls).toHaveLength(0);
    expect(prismaMock.artifactDerivation.upsert).not.toHaveBeenCalled();
  });

  it("rejects output above the derived-size limit instead of storing it", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    const big = Buffer.concat([Buffer.from(minimalAsciiDxf(), "utf8"), Buffer.alloc(26 * 1024 * 1024, 0x20)]);
    const provider = {
      providerId: "big-test-provider",
      converterVersion: "1.0.0",
      supportedDerivationKinds: ["DWG_TO_DXF"] as const,
      convert: async () => ({ status: "SUCCEEDED" as const, outputBytes: new Uint8Array(big), warnings: [], converterVersion: "1.0.0" }),
    };
    const outcome = await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider });
    expect(outcome.status).toBe("REJECTED");
    expect(outcome.failureReason).toContain("derived-output limit");
    expect(prismaMock.sourceArtifact.create).not.toHaveBeenCalled();
  });

  it("passes immutable bounded limits to the provider, with network access NONE", async () => {
    resetPrisma();
    mockIngestAwareFindFirst(originalRow());
    let seen: Record<string, unknown> = {};
    const provider = {
      providerId: "limits-test-provider",
      converterVersion: "1.0.0",
      supportedDerivationKinds: ["DWG_TO_DXF"] as const,
      convert: async (request: unknown) => {
        seen = request as Record<string, unknown>;
        return { status: "SUCCEEDED", outputBytes: new Uint8Array(Buffer.from(minimalAsciiDxf(), "utf8")), warnings: [], converterVersion: "1.0.0" } satisfies ConversionResult;
      },
    };
    prismaMock.sourceArtifact.create.mockResolvedValue({ id: "derived-dxf", citations: [] });
    await deriveSourceArtifact({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", provider, options: { encoding: "ascii" } });
    expect(seen.limits).toMatchObject({ networkAccess: "NONE", maxOutputBytes: 25 * 1024 * 1024 });
    expect(seen.sourceHash).toBe(dwgHash);
    expect(seen.targetFormat).toBe("DXF");
    expect((seen.sourceBytes as Uint8Array).slice(0, 6)).toEqual(new Uint8Array(dwgBytes.subarray(0, 6)));
    void zipOutput;
  });
});
