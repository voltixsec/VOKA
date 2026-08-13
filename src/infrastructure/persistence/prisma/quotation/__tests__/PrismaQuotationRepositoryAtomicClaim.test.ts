import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../lib/prisma", () => ({
  prisma: {},
}));

import { PrismaQuotationRepository } from "../PrismaQuotationRepository";

describe("PrismaQuotationRepository atomic claimLocalization", () => {
  it("allows PENDING quotation at attempt 0 to be claimed, incrementing attempt count to 1", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue({
      localizationSourceSignature: "sig_abc123",
      localizationAttemptCount: 1,
    });

    const db = {
      quotation: {
        updateMany,
        findFirst,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-123",
      leaseDurationMs: 120000,
    });

    expect(result).not.toBeNull();
    expect(result).toEqual({
      claimToken: "token-123",
      sourceSignature: "sig_abc123",
      attemptCount: 1,
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company-1",
          id: "quotation-1",
          isDeleted: false,
          localizationSourceSignature: { not: null },
          localizationAttemptCount: { lt: 3 },
          AND: expect.arrayContaining([
            {
              OR: [
                { localizationLeaseUntil: null },
                { localizationLeaseUntil: { lt: expect.any(Date) } },
              ],
            },
            {
              OR: [
                { localizationStatus: "PENDING" },
                {
                  localizationStatus: "FAILED",
                  localizationLastError: {
                    in: [
                      "TRANSLATION_TIMEOUT",
                      "TRANSLATION_PROVIDER_ERROR",
                      "TRANSLATION_UNEXPECTED_ERROR",
                    ],
                  },
                },
              ],
            },
          ]),
        }),
        data: expect.objectContaining({
          localizationClaimToken: "token-123",
          localizationLeaseUntil: expect.any(Date),
          localizationAttemptCount: { increment: 1 },
          localizationStatus: "PENDING",
          localizationLastError: null,
        }),
      }),
    );
  });

  it("returns null cleanly on second concurrent/ineligible claim when updateMany matches 0 rows", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findFirst = vi.fn();

    const db = {
      quotation: {
        updateMany,
        findFirst,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-456",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("blocks claim when an active localization lease is still valid", async () => {
    const updateMany = vi.fn().mockImplementation((query) => {
      expect(query.where.AND[0]).toEqual({
        OR: [
          { localizationLeaseUntil: null },
          { localizationLeaseUntil: { lt: expect.any(Date) } },
        ],
      });
      return Promise.resolve({ count: 0 });
    });
    const findFirst = vi.fn();

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-lease",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("permits reclaim when a localization lease has expired", async () => {
    const updateMany = vi.fn().mockImplementation((query) => {
      expect(query.where.AND[0]).toEqual({
        OR: [
          { localizationLeaseUntil: null },
          { localizationLeaseUntil: { lt: expect.any(Date) } },
        ],
      });
      return Promise.resolve({ count: 1 });
    });
    const findFirst = vi.fn().mockResolvedValue({
      localizationSourceSignature: "sig_expired_lease",
      localizationAttemptCount: 2,
    });

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-expired",
      leaseDurationMs: 60000,
    });

    expect(result).toEqual({
      claimToken: "token-expired",
      sourceSignature: "sig_expired_lease",
      attemptCount: 2,
    });
    expect(findFirst).toHaveBeenCalled();
  });

  it("does not claim when PENDING quotation already has 3 localization attempts", async () => {
    const updateMany = vi.fn().mockImplementation((query) => {
      expect(query.where.localizationAttemptCount).toEqual({ lt: 3 });
      return Promise.resolve({ count: 0 });
    });
    const findFirst = vi.fn();

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-attempts",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not claim when FAILED retryable quotation has reached 3 localization attempts", async () => {
    const updateMany = vi.fn().mockImplementation((query) => {
      expect(query.where.localizationAttemptCount).toEqual({ lt: 3 });
      expect(query.where.AND[1]).toEqual(
        expect.objectContaining({
          OR: [
            { localizationStatus: "PENDING" },
            {
              localizationStatus: "FAILED",
              localizationLastError: {
                in: [
                  "TRANSLATION_TIMEOUT",
                  "TRANSLATION_PROVIDER_ERROR",
                  "TRANSLATION_UNEXPECTED_ERROR",
                ],
              },
            },
          ],
        }),
      );
      return Promise.resolve({ count: 0 });
    });
    const findFirst = vi.fn();

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-failed-max",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not claim when localizationSourceSignature is null", async () => {
    const updateMany = vi.fn().mockImplementation((query) => {
      expect(query.where.localizationSourceSignature).toEqual({ not: null });
      return Promise.resolve({ count: 0 });
    });
    const findFirst = vi.fn();

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-signature-null",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("does not claim a deleted quotation", async () => {
    const updateMany = vi.fn().mockImplementation((query) => {
      expect(query.where.isDeleted).toBe(false);
      return Promise.resolve({ count: 0 });
    });
    const findFirst = vi.fn();

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-deleted",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("uses the exact new claimToken to fence the post-update read", async () => {
    const claimToken = "token-fence";
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue({
      localizationSourceSignature: "sig_fence",
      localizationAttemptCount: 1,
    });

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken,
      leaseDurationMs: 60000,
    });

    expect(result).not.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "quotation-1",
        companyId: "company-1",
        localizationClaimToken: claimToken,
      },
      select: {
        localizationSourceSignature: true,
        localizationAttemptCount: true,
      },
    });
  });

  it("returns null when the guard read after update returns no record", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue(null);

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-null-read",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
  });

  it("returns null when the guard read after update returns a record with null source signature", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue({
      localizationSourceSignature: null,
      localizationAttemptCount: 1,
    });

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      claimToken: "token-null-source",
      leaseDurationMs: 60000,
    });

    expect(result).toBeNull();
  });

  it("does not claim FAILED quotation with a non-retryable localization error", async () => {
    const updateMany = vi.fn().mockImplementation((query) => {
      expect(query.where).toEqual(
        expect.objectContaining({
          AND: [
            expect.any(Object),
            {
              OR: [
                { localizationStatus: "PENDING" },
                {
                  localizationStatus: "FAILED",
                  localizationLastError: {
                    in: [
                      "TRANSLATION_TIMEOUT",
                      "TRANSLATION_PROVIDER_ERROR",
                      "TRANSLATION_UNEXPECTED_ERROR",
                    ],
                  },
                },
              ],
            },
          ],
        }),
      );
      return Promise.resolve({ count: 0 });
    });
    const findFirst = vi.fn();

    const db = {
      quotation: {
        updateMany,
        findFirst,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      leaseDurationMs: 300000,
    });

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("claims FAILED retryable quotation with attempts < 3, transitioning status to PENDING and clearing lastError", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue({
      localizationSourceSignature: "sig_failed_retry",
      localizationAttemptCount: 2,
    });

    const db = {
      quotation: {
        updateMany,
        findFirst,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const result = await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      leaseDurationMs: 720000, // 12 minutes
    });

    expect(result).not.toBeNull();
    expect(result?.attemptCount).toBe(2);
    expect(result?.sourceSignature).toBe("sig_failed_retry");

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          localizationStatus: "PENDING",
          localizationLastError: null,
          localizationAttemptCount: { increment: 1 },
        }),
      }),
    );
  });

  it("verifies lease duration is caller-provided (e.g. 12 minutes)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue({
      localizationSourceSignature: "sig_lease_test",
      localizationAttemptCount: 1,
    });

    const db = {
      quotation: { updateMany, findFirst },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const startTime = Date.now();
    const leaseMs = 720000; // 12 minutes

    await repository.claimLocalization({
      companyId: "company-1",
      quotationId: "quotation-1",
      leaseDurationMs: leaseMs,
    });

    const updateCall = updateMany.mock.calls[0][0];
    const leaseUntil: Date = updateCall.data.localizationLeaseUntil;
    expect(leaseUntil.getTime()).toBeGreaterThanOrEqual(startTime + leaseMs - 1000);
    expect(leaseUntil.getTime()).toBeLessThanOrEqual(startTime + leaseMs + 1000);
  });
});
