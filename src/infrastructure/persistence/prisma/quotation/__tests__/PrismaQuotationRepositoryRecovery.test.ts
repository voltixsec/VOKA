import { describe, expect, it, vi } from "vitest";
vi.mock("../../../../../../lib/prisma", () => ({ prisma: {} }));
import { PrismaQuotationRepository } from "../PrismaQuotationRepository";

describe("PrismaQuotationRepository recovery discovery", () => {
  it("uses the claim-compatible filter, bounded take, and deterministic order", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { companyId: "company-1", id: "quotation-1" },
    ]);
    const repository = new PrismaQuotationRepository({
      quotation: { findMany },
    } as never);
    const now = new Date("2026-08-12T12:00:00.000Z");

    await expect(repository.findRecoverableLocalizationJobs({ limit: 10, now }))
      .resolves.toEqual([{ companyId: "company-1", quotationId: "quotation-1" }]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        localizationSourceSignature: { not: null },
        localizationAttemptCount: { lt: 3 },
        AND: [
          { OR: [{ localizationLeaseUntil: null }, { localizationLeaseUntil: { lt: now } }] },
          { OR: [
            { localizationStatus: "PENDING" },
            { localizationStatus: "FAILED", localizationLastError: { in: [
              "TRANSLATION_TIMEOUT",
              "TRANSLATION_PROVIDER_ERROR",
              "TRANSLATION_UNEXPECTED_ERROR",
            ] } },
          ] },
        ],
      },
      select: { companyId: true, id: true },
      orderBy: [
        { localizationRequestedAt: "asc" },
        { updatedAt: "asc" },
        { id: "asc" },
      ],
      take: 10,
    });
  });
});
