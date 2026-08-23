import { describe, it, expect, vi } from "vitest";
import { PrismaLocalizedContentRepository } from "../PrismaLocalizedContentRepository";
import { LocalizedContentStatus } from "../../../../../domain/localization/types/LocalizedContentStatus";

describe("PrismaLocalizedContentRepository Unit & Integration Tests", () => {
  it("canonicalizes locale keys on upsert and stores in DB format", async () => {
    const mockDb: any = {
      localizedContent: {
        upsert: vi.fn().mockImplementation(({ create }) =>
          Promise.resolve({
            id: "loc_123",
            companyId: create.companyId,
            resourceType: create.resourceType,
            resourceId: create.resourceId,
            fieldKey: create.fieldKey,
            locale: create.locale,
            sourceLocale: create.sourceLocale,
            text: create.text,
            status: create.status,
            sourceHash: create.sourceHash,
            provider: null,
            model: null,
            translatedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      },
    };

    const repo = new PrismaLocalizedContentRepository(mockDb);
    const res = await repo.upsertVariant({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "fr-fr", // Non-canonical input
      sourceLocale: "AR", // Case-insensitive input
      text: "Système d'alarme incendie",
      status: LocalizedContentStatus.VALID,
    });

    expect(mockDb.localizedContent.upsert).toHaveBeenCalledWith({
      where: {
        companyId_resourceType_resourceId_fieldKey_locale: {
          companyId: "c1",
          resourceType: "Quotation",
          resourceId: "q1",
          fieldKey: "subject",
          locale: "fr-FR", // Verified canonicalized
        },
      },
      create: expect.objectContaining({
        locale: "fr-FR",
        sourceLocale: "ar",
      }),
      update: expect.objectContaining({
        sourceLocale: "ar",
      }),
    });

    expect(res.locale).toBe("fr-FR");
    expect(res.sourceLocale).toBe("ar");
  });

  it("rejects invalid locale keys on upsert, query, and invalidation", async () => {
    const mockDb: any = {};
    const repo = new PrismaLocalizedContentRepository(mockDb);

    await expect(
      repo.upsertVariant({
        companyId: "c1",
        resourceType: "Quotation",
        resourceId: "q1",
        fieldKey: "subject",
        locale: "invalid_locale_???",
        sourceLocale: "ar",
        text: "Invalid",
        status: LocalizedContentStatus.VALID,
      })
    ).rejects.toThrow("Invalid target locale: \"invalid_locale_???\"");

    await expect(
      repo.findByFieldAndLocale({
        companyId: "c1",
        resourceType: "Quotation",
        resourceId: "q1",
        fieldKey: "subject",
        locale: "invalid_locale_???",
      })
    ).rejects.toThrow("Invalid locale: \"invalid_locale_???\"");

    await expect(
      repo.invalidateFields({
        companyId: "c1",
        resourceType: "Quotation",
        resourceId: "q1",
        locales: ["invalid_locale_???"],
      })
    ).rejects.toThrow("Invalid locale for invalidation: \"invalid_locale_???\"");
  });

  it("canonicalizes locale query inputs and enforces tenant isolation", async () => {
    const mockDb: any = {
      localizedContent: {
        findFirst: vi.fn().mockResolvedValue({
          id: "loc_456",
          companyId: "c1",
          resourceType: "Quotation",
          resourceId: "q1",
          fieldKey: "subject",
          locale: "zh-CN",
          sourceLocale: "ar",
          text: "火灾报警系统",
          status: "VALID",
          sourceHash: "hash123",
          provider: null,
          model: null,
          translatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };

    const repo = new PrismaLocalizedContentRepository(mockDb);
    const res = await repo.findByFieldAndLocale({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKey: "subject",
      locale: "zh-cn", // lowercase input
    });

    expect(mockDb.localizedContent.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: "c1",
        resourceType: "Quotation",
        resourceId: "q1",
        fieldKey: "subject",
        locale: "zh-CN", // Verified canonicalized
      },
    });

    expect(res?.text).toBe("火灾报警系统");
  });

  it("executes field-level STALE invalidation correctly", async () => {
    const mockDb: any = {
      localizedContent: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const repo = new PrismaLocalizedContentRepository(mockDb);
    const count = await repo.invalidateFields({
      companyId: "c1",
      resourceType: "Quotation",
      resourceId: "q1",
      fieldKeys: ["subject", "brief"],
      locales: ["en-US", "fr-FR"],
    });

    expect(mockDb.localizedContent.updateMany).toHaveBeenCalledWith({
      where: {
        companyId: "c1",
        resourceType: "Quotation",
        resourceId: "q1",
        fieldKey: { in: ["subject", "brief"] },
        locale: { in: ["en-US", "fr-FR"] },
      },
      data: {
        status: LocalizedContentStatus.STALE,
      },
    });

    expect(count).toBe(2);
  });
});
