import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2A-9 test matrix items 19-30: explicit user-provided export linking.
 * No converter identity is fabricated, only valid format pairs link, the same
 * tenant is enforced, cycles and self-links are rejected, and the identical
 * source/derived pair is idempotent.
 */

const prismaMock = vi.hoisted(() => ({
  sourceArtifact: { findFirst: vi.fn() },
  artifactDerivation: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  requirement: { upsert: vi.fn(), create: vi.fn() },
  quotationLine: { create: vi.fn() },
  supplier: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { linkUserProvidedDerivation } from "../LinkUserProvidedDerivation";

const dwgHash = "aa".repeat(32);
const dxfHash = "bb".repeat(32);
const rvtHash = "cc".repeat(32);
const ifcHash = "dd".repeat(32);

function rows() {
  return {
    dwg: { id: "original-dwg", companyId: "company-1", kind: "DWG", originalFilename: "site.dwg", contentSha256: dwgHash, processingState: "RECEIVED" },
    dxf: { id: "derived-dxf", companyId: "company-1", kind: "DXF", originalFilename: "site.dxf", contentSha256: dxfHash, processingState: "TEXT_EXTRACTED" },
    rvt: { id: "original-rvt", companyId: "company-1", kind: "RVT", originalFilename: "tower.rvt", contentSha256: rvtHash, processingState: "RECEIVED" },
    ifc: { id: "derived-ifc", companyId: "company-1", kind: "IFC", originalFilename: "tower.ifc", contentSha256: ifcHash, processingState: "TEXT_EXTRACTED" },
    pdf: { id: "doc-pdf", companyId: "company-1", kind: "PDF", originalFilename: "boq.pdf", contentSha256: "ee".repeat(32), processingState: "TEXT_EXTRACTED" },
    otherTenantDxf: { id: "derived-dxf-2", companyId: "company-2", kind: "DXF", originalFilename: "site.dxf", contentSha256: dxfHash, processingState: "TEXT_EXTRACTED" },
  };
}

function wire(current: Record<string, unknown>) {
  vi.mocked(prismaMock.sourceArtifact.findFirst).mockImplementation(async (args: { where: { id: string; companyId: string } }) => {
    if (args.where.companyId !== current.companyId) return null;
    return args.where.id === current.id ? current : null;
  });
}

beforeEach(() => {
  for (const model of [prismaMock.sourceArtifact, prismaMock.artifactDerivation, prismaMock.requirement, prismaMock.quotationLine, prismaMock.supplier]) {
    for (const fn of Object.values(model)) vi.mocked(fn).mockReset();
  }
  prismaMock.artifactDerivation.findUnique.mockResolvedValue(null);
  prismaMock.artifactDerivation.findMany.mockResolvedValue([]);
  prismaMock.artifactDerivation.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: "derivation-new", ...args.data }));
});

describe("user-provided export linking (2A-9)", () => {
  it("19 links a user-exported DXF to a DWG original as USER_PROVIDED_EXPORT", async () => {
    const r = rows();
    wire(r.dwg);
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    const result = await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" });
    expect(result.idempotent).toBe(false);
    expect(result.derivationKind).toBe("DWG_TO_DXF");
    const created = vi.mocked(prismaMock.artifactDerivation.create).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.derivationMethod).toBe("USER_PROVIDED_EXPORT");
    expect(created.data.status).toBe("SUCCEEDED");
    expect(created.data.sourceFormat).toBe("DWG");
    expect(created.data.derivedFormat).toBe("DXF");
  });

  it("20 links a user-exported IFC to an RVT original", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.rvt)
      .mockResolvedValueOnce(r.ifc);
    const result = await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-rvt", derivedArtifactId: "derived-ifc" });
    expect(result.derivationKind).toBe("RVT_TO_IFC");
    const created = vi.mocked(prismaMock.artifactDerivation.create).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.derivationMethod).toBe("USER_PROVIDED_EXPORT");
    expect(created.data.sourceHash).toBe(rvtHash);
  });

  it("21 rejects a DWG→IFC link", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.ifc);
    await expect(linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-ifc" }))
      .rejects.toMatchObject({ code: "DERIVATION_PAIR_UNSUPPORTED" });
    expect(prismaMock.artifactDerivation.create).not.toHaveBeenCalled();
  });

  it("22 rejects an RVT→DXF link", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.rvt)
      .mockResolvedValueOnce(r.dxf);
    await expect(linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-rvt", derivedArtifactId: "derived-dxf" }))
      .rejects.toMatchObject({ code: "DERIVATION_PAIR_UNSUPPORTED" });
    expect(prismaMock.artifactDerivation.create).not.toHaveBeenCalled();
  });

  it("23 rejects a cross-tenant link", async () => {
    const r = rows();
    // The derived artifact lives in another tenant, so the tenant-scoped
    // lookup finds nothing.
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(null);
    await expect(linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf-2" }))
      .rejects.toMatchObject({ code: "SOURCE_ARTIFACT_NOT_FOUND" });
    expect(prismaMock.artifactDerivation.create).not.toHaveBeenCalled();
  });

  it("24 rejects a self-link", async () => {
    await expect(linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "original-dwg" }))
      .rejects.toMatchObject({ code: "DERIVATION_SELF_LINK_INVALID" });
    expect(prismaMock.sourceArtifact.findFirst).not.toHaveBeenCalled();
  });

  it("25 is idempotent for the same explicit source/derived pair", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    prismaMock.artifactDerivation.findUnique.mockResolvedValue({ id: "derivation-existing", derivationKind: "DWG_TO_DXF" });
    const first = await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" });
    vi.mocked(prismaMock.sourceArtifact.findFirst).mockClear();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    const second = await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" });
    expect(first.idempotent).toBe(true);
    expect(second.idempotent).toBe(true);
    expect(first.derivationKey).toBe(second.derivationKey);
    expect(prismaMock.artifactDerivation.create).not.toHaveBeenCalled();
  });

  it("26 rejects a lineage cycle (defensive: the chain already reaches the proposed original)", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    // Defensive structural guard: existing (corrupt/legacy) edges already lead
    // from the proposed derived artifact back to the proposed original.
    prismaMock.artifactDerivation.findMany.mockResolvedValue([{ derivedArtifactId: "original-dwg" }]);
    await expect(linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" }))
      .rejects.toMatchObject({ code: "DERIVATION_CYCLE_INVALID" });
    expect(prismaMock.artifactDerivation.create).not.toHaveBeenCalled();
  });

  it("walks a multi-edge chain when checking for cycles without false positives", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    // A chain that does NOT reach the original must not block the link.
    prismaMock.artifactDerivation.findMany
      .mockResolvedValueOnce([{ derivedArtifactId: "some-other-artifact" }])
      .mockResolvedValueOnce([]);
    const result = await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" });
    expect(result.idempotent).toBe(false);
    expect(prismaMock.artifactDerivation.findMany).toHaveBeenCalledTimes(2);
  });

  it("27/28 stores both hashes and never mutates either artifact row", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" });
    const created = vi.mocked(prismaMock.artifactDerivation.create).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.sourceHash).toBe(dwgHash);
    expect(created.data.derivedHash).toBe(dxfHash);
    expect(created.data.derivedArtifactId).toBe("derived-dxf");
    expect(created.data.originalArtifactId).toBe("original-dwg");
    expect(prismaMock.sourceArtifact.findFirst).toHaveBeenCalledTimes(2);
  });

  it("29 does not fabricate a converter id or version for a user export", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.rvt)
      .mockResolvedValueOnce(r.ifc);
    await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-rvt", derivedArtifactId: "derived-ifc" });
    const created = vi.mocked(prismaMock.artifactDerivation.create).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.converterId).toBeNull();
    expect(created.data.converterVersion).toBeNull();
    expect(created.data.optionsFingerprint).toBe("{}");
  });

  it("30 preserves the derivation method and static fidelity limitations on the record", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" });
    const created = vi.mocked(prismaMock.artifactDerivation.create).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data.derivationMethod).toBe("USER_PROVIDED_EXPORT");
    expect((created.data.fidelityLimitations as string[]).length).toBeGreaterThan(0);
    expect((created.data.warnings as string[])).toEqual([]);
    expect(created.data.completedAt).toBeInstanceOf(Date);
  });

  it("57-61 linking never creates a Requirement, quotation line, or supplier", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce(r.dxf);
    await linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" });
    expect(prismaMock.requirement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.requirement.create).not.toHaveBeenCalled();
    expect(prismaMock.quotationLine.create).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
  });

  it("refuses a link to an artifact whose inspection failed", async () => {
    const r = rows();
    vi.mocked(prismaMock.sourceArtifact.findFirst)
      .mockResolvedValueOnce(r.dwg)
      .mockResolvedValueOnce({ ...r.dxf, processingState: "FAILED" });
    await expect(linkUserProvidedDerivation({ companyId: "company-1", userId: "user-1", originalArtifactId: "original-dwg", derivedArtifactId: "derived-dxf" }))
      .rejects.toMatchObject({ code: "DERIVATION_DERIVED_ARTIFACT_INVALID" });
  });
});
