import { describe, expect, it, vi } from "vitest";
import { PrismaUniversalLibraryRepository } from "../PrismaUniversalLibraryRepository";

// Publication-relevant shape of live record cmtm88mkr0001xot1s6qrgt6f.
const livePayload = {
  name: "Commercial IP Cameras (e.g., Axis, Hanwha, Hikvision, Bosch)",
  type: "PRODUCT", manufacturerName: "Axis Communications, Hanwha Vision, Hikvision, Bosch",
  manufacturerCode: null, brandName: null, familyName: null, categoryCode: null,
  modelNumber: null, normalizedModelNumber: null, identifiers: [], aliases: [],
  attributes: [
    { code: "SPEC_1", name: "Specification 1", unit: null, value: "Support for H.264/H.265 compression", dataType: "STRING" },
    { code: "SPEC_2", name: "Specification 2", unit: null, value: "Environmental ratings (e.g., IP66, IK10)", dataType: "STRING" },
    { code: "SPEC_3", name: "Specification 3", unit: null, value: "Edge analytics or AI-capable models", dataType: "STRING" },
  ],
};

function fixture(normalizedData: unknown = livePayload) {
  let state: any = { record: { id: "record-1", status: "NEEDS_REVIEW", entityType: "ITEM", normalizedData,
    sourceId: "source-1", sourceExternalId: "external-1", payloadHash: "hash-1", rawPayload: {}, source: { isActive: true, trustScore: null }, matchedItemId: null }, events: [], item: null };
  let draft: any;
  const tx = {
    // Actual Prisma/pg failure: pg_advisory_xact_lock returns PostgreSQL void.
    $queryRaw: vi.fn().mockRejectedValue(Object.assign(new Error("Failed to deserialize column of type 'void'"), { code: "P2010" })),
    $executeRaw: vi.fn().mockResolvedValue(1),
    universalIngestionRecord: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (draft.record.status !== where.status) return { count: 0 };
        Object.assign(draft.record, data);
        return { count: 1 };
      }),
      findUnique: vi.fn(async () => draft.record),
    },
    universalIngestionReviewEvent: { create: vi.fn(async ({ data }: any) => draft.events.push(data)) },
    universalManufacturer: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: "mfr-1" }) },
    universalBrand: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: "brand-1" }) },
    universalProductFamily: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: "family-1" }) },
    universalItemIdentifier: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    universalCatalogItem: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }: any) => (draft.item = { id: "canonical-1", ...data })),
      findUnique: vi.fn(async () => draft.item),
    },
    universalItemProvenance: { upsert: vi.fn() },
    universalAttributeDefinition: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: data.code, ...data })),
    },
    universalItemAttributeValue: { upsert: vi.fn() },
  };
  const repository = new PrismaUniversalLibraryRepository({ $transaction: async (callback: any) => {
    draft = structuredClone(state);
    const result = await callback(tx);
    state = draft;
    return result;
  } } as any);
  return { repository, tx, state: () => state };
}

const approval = { ingestionRecordId: "record-1", reviewedByUserId: "platform-user-1" };

describe("Prisma governed publication transaction", () => {
  it("handles the live discovery shape without deserializing advisory-lock void results", async () => {
    const f = fixture();
    await expect(f.repository.publishIngestionRecord(approval)).resolves.toMatchObject({ isNewItem: true });
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
    expect(f.tx.$executeRaw.mock.calls.map(call => call[1])).toEqual([
      "ucl-manufacturer:AXIS COMMUNICATIONS, HANWHA VISION, HIKVISION, BOSCH",
      "ucl-attribute:SPEC_1", "ucl-attribute:SPEC_2", "ucl-attribute:SPEC_3",
    ]);
    expect(f.state().record).toMatchObject({ status: "PUBLISHED", matchedItemId: "canonical-1" });
    expect(f.state().events).toEqual([expect.objectContaining({ decision: "APPROVED", actorUserId: "platform-user-1" })]);
  });

  it("executes every identity lock for a valid identified product", async () => {
    const f = fixture({ ...livePayload, name: "Camera A", manufacturerName: "Manufacturer A", brandName: "Brand A",
      familyName: "Family A", normalizedModelNumber: "CAM-A", identifiers: [
        { identifierType: "GTIN", value: "12345678", normalizedValue: "12345678" },
        { identifierType: "MPN", value: "CAM-A", normalizedValue: "CAM-A" },
      ] });
    await f.repository.publishIngestionRecord(approval);
    const keys = f.tx.$executeRaw.mock.calls.map(call => call[1]);
    for (const prefix of ["global", "manufacturer", "scoped", "model", "brand", "family", "attribute"]) {
      expect(keys.some(key => String(key).startsWith(`ucl-${prefix}:`))).toBe(true);
    }
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("leaves a missing normalized payload pending with no approval or canonical writes", async () => {
    const f = fixture(null);
    await expect(f.repository.publishIngestionRecord(approval)).rejects.toThrow("no normalized payload");
    expect(f.state()).toMatchObject({ record: { status: "NEEDS_REVIEW" }, events: [], item: null });
    expect(f.tx.universalIngestionReviewEvent.create).not.toHaveBeenCalled();
  });

  it("rolls back publication on an infrastructure failure", async () => {
    const f = fixture();
    f.tx.$executeRaw.mockRejectedValueOnce(new Error("connection lost"));
    await expect(f.repository.publishIngestionRecord(approval)).rejects.toThrow("connection lost");
    expect(f.state()).toMatchObject({ record: { status: "NEEDS_REVIEW" }, events: [], item: null });
  });

  it("preserves rejection and blocks a subsequent approval", async () => {
    const f = fixture();
    await f.repository.rejectIngestionRecord(approval);
    await expect(f.repository.publishIngestionRecord(approval)).rejects.toThrow("not awaiting");
    expect(f.state()).toMatchObject({ record: { status: "REJECTED" }, events: [{ decision: "REJECTED", actorUserId: "platform-user-1" }], item: null });
  });

  it("blocks a second approval without another review event", async () => {
    const f = fixture();
    await f.repository.publishIngestionRecord(approval);
    await expect(f.repository.publishIngestionRecord(approval)).rejects.toThrow("not awaiting");
    expect(f.state().events).toHaveLength(1);
  });
});
