import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../lib/prisma", () => ({
  prisma: {},
}));

import { PrismaQuotationRepository } from "../PrismaQuotationRepository";
import type {
  CompleteQuotationLocalizationParams,
  FailQuotationLocalizationParams,
} from "../../../../../application/quotation/repositories/IQuotationRepository";

describe("PrismaQuotationRepository localization fencing", () => {
  it("completes localization only when quotation fence matches and updates only allowed fields", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const quotationLineUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
      quotationLine: {
        updateMany: quotationLineUpdateMany,
      },
      $transaction: vi.fn(async (callback: any) => callback({
        quotation: { updateMany: quotationUpdateMany },
        quotationLine: { updateMany: quotationLineUpdateMany },
      })),
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: CompleteQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "sig-1",
      expectedClaimToken: "token-1",
      header: {
        customerNameAr: "عميل",
        customerNameEn: "Customer",
        projectNameAr: "مشروع",
        projectNameEn: "Project",
        attentionNameAr: "محمد",
        attentionNameEn: "Mohamed",
        subjectAr: "موضوع",
        subjectEn: "Subject",
        briefAr: "موجز",
        briefEn: "Brief",
        notesAr: "ملاحظات",
        notesEn: "Notes",
        termsAndConditionsAr: "شروط",
        termsAndConditionsEn: "Terms",
      },
      lines: [
        {
          id: "line-1",
          itemNameAr: "اسم عربي",
          itemNameEn: "Name EN",
          descriptionAr: "وصف عربي",
          descriptionEn: "Desc EN",
          unitNameAr: "وحدة",
          unitNameEn: "Unit",
        },
      ],
      completedAt: new Date("2026-08-12T12:00:00.000Z"),
    };

    const result = await repository.completeLocalization(params);

    expect(result).toBe(true);
    expect(db.$transaction).toHaveBeenCalled();

    expect(quotationUpdateMany).toHaveBeenCalledTimes(1);
    expect(quotationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company-1",
          id: "quotation-1",
          isDeleted: false,
          localizationSourceSignature: "sig-1",
          localizationClaimToken: "token-1",
        }),
        data: expect.objectContaining({
          customerNameAr: "عميل",
          localizationStatus: "COMPLETED",
          localizationCompletedAt: params.completedAt,
          localizationLastError: null,
          localizationClaimToken: null,
          localizationLeaseUntil: null,
        }),
      }),
    );

    expect(quotationLineUpdateMany).toHaveBeenCalledTimes(1);
    expect(quotationLineUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "line-1",
          quotationId: "quotation-1",
        },
        data: {
          itemNameAr: "اسم عربي",
          itemNameEn: "Name EN",
          descriptionAr: "وصف عربي",
          descriptionEn: "Desc EN",
          unitNameAr: "وحدة",
          unitNameEn: "Unit",
        },
      }),
    );
  });

  it("returns false and performs no line writes when completeLocalization fence misses", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const quotationLineUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
      quotationLine: {
        updateMany: quotationLineUpdateMany,
      },
      $transaction: vi.fn(async (callback: any) => callback({
        quotation: { updateMany: quotationUpdateMany },
        quotationLine: { updateMany: quotationLineUpdateMany },
      })),
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: CompleteQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "wrong-sig",
      expectedClaimToken: "wrong-token",
      header: {},
      lines: [
        {
          id: "line-1",
          itemNameAr: "اسم عربي",
        },
      ],
      completedAt: new Date(),
    };

    const result = await repository.completeLocalization(params);

    expect(result).toBe(false);
    expect(quotationLineUpdateMany).not.toHaveBeenCalled();
  });

  it("returns false when source signature is wrong", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const quotationLineUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
      quotationLine: {
        updateMany: quotationLineUpdateMany,
      },
      $transaction: vi.fn(async (callback: any) => callback({
        quotation: { updateMany: quotationUpdateMany },
        quotationLine: { updateMany: quotationLineUpdateMany },
      })),
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: CompleteQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "bad-sig",
      expectedClaimToken: "token-1",
      header: {},
      lines: [],
      completedAt: new Date(),
    };

    const result = await repository.completeLocalization(params);

    expect(result).toBe(false);
    expect(quotationLineUpdateMany).not.toHaveBeenCalled();
  });

  it("returns false when claim token is wrong", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const quotationLineUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
      quotationLine: {
        updateMany: quotationLineUpdateMany,
      },
      $transaction: vi.fn(async (callback: any) => callback({
        quotation: { updateMany: quotationUpdateMany },
        quotationLine: { updateMany: quotationLineUpdateMany },
      })),
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: CompleteQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "sig-1",
      expectedClaimToken: "bad-token",
      header: {},
      lines: [],
      completedAt: new Date(),
    };

    const result = await repository.completeLocalization(params);

    expect(result).toBe(false);
    expect(quotationLineUpdateMany).not.toHaveBeenCalled();
  });

  it("fails localization only when the fence matches", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: FailQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "sig-1",
      expectedClaimToken: "token-1",
      errorCode: "TRANSLATION_INVALID_RESPONSE",
    };

    const result = await repository.failLocalization(params);

    expect(result).toBe(true);
    expect(quotationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: "company-1",
          id: "quotation-1",
          isDeleted: false,
          localizationSourceSignature: "sig-1",
          localizationClaimToken: "token-1",
        }),
        data: expect.objectContaining({
          localizationStatus: "FAILED",
          localizationLastError: "TRANSLATION_INVALID_RESPONSE",
          localizationCompletedAt: null,
          localizationClaimToken: null,
          localizationLeaseUntil: null,
        }),
      }),
    );
  });

  it("success data omits attempt count and source signature and includes only allowed keys", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const quotationLineUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
      quotationLine: {
        updateMany: quotationLineUpdateMany,
      },
      $transaction: vi.fn(async (callback: any) => callback({
        quotation: { updateMany: quotationUpdateMany },
        quotationLine: { updateMany: quotationLineUpdateMany },
      })),
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: CompleteQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "sig-1",
      expectedClaimToken: "token-1",
      header: {
        customerNameAr: "عميل",
        customerNameEn: "Customer",
      },
      lines: [
        {
          id: "line-1",
          itemNameAr: "اسم عربي",
        },
      ],
      completedAt: new Date("2026-08-12T12:00:00.000Z"),
    };

    const result = await repository.completeLocalization(params);

    expect(result).toBe(true);

    const calledData = quotationUpdateMany.mock.calls[0][0].data;

    expect(calledData).not.toHaveProperty("localizationAttemptCount");
    expect(calledData).not.toHaveProperty("localizationSourceSignature");

    const expectedKeys = [
      "customerNameAr",
      "customerNameEn",
      "projectNameAr",
      "projectNameEn",
      "attentionNameAr",
      "attentionNameEn",
      "subjectAr",
      "subjectEn",
      "briefAr",
      "briefEn",
      "notesAr",
      "notesEn",
      "termsAndConditionsAr",
      "termsAndConditionsEn",
      "localizationStatus",
      "localizationCompletedAt",
      "localizationLastError",
      "localizationClaimToken",
      "localizationLeaseUntil",
    ];

    expect(Object.keys(calledData).sort()).toEqual(expectedKeys.sort());

    const lineCall = quotationLineUpdateMany.mock.calls[0][0];
    expect(lineCall.where).toEqual({ id: "line-1", quotationId: "quotation-1" });

    const lineData = lineCall.data;
    const expectedLineKeys = [
      "itemNameAr",
      "itemNameEn",
      "descriptionAr",
      "descriptionEn",
      "unitNameAr",
      "unitNameEn",
    ];

    expect(Object.keys(lineData).sort()).toEqual(expectedLineKeys.sort());
  });

  it("rejects when a line update affects 0 rows", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const quotationLineUpdateMany = vi.fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });

    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
      quotationLine: {
        updateMany: quotationLineUpdateMany,
      },
      $transaction: vi.fn(async (callback: any) => callback({
        quotation: { updateMany: quotationUpdateMany },
        quotationLine: { updateMany: quotationLineUpdateMany },
      })),
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: CompleteQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "sig-1",
      expectedClaimToken: "token-1",
      header: {},
      lines: [
        { id: "line-1", itemNameAr: "x" },
      ],
      completedAt: new Date(),
    };

    await expect(repository.completeLocalization(params)).rejects.toThrow(/Failed to update localized line/);
  });

  it("failure path does not touch quotationLine and omits attempt count and source signature", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const quotationLineUpdateMany = vi.fn();

    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
      quotationLine: {
        updateMany: quotationLineUpdateMany,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: FailQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "sig-1",
      expectedClaimToken: "token-1",
      errorCode: "TRANSLATION_TIMEOUT",
    };

    const result = await repository.failLocalization(params);

    expect(result).toBe(true);
    expect(quotationLineUpdateMany).not.toHaveBeenCalled();

    const calledData = quotationUpdateMany.mock.calls[0][0].data;
    expect(calledData).not.toHaveProperty("localizationAttemptCount");
    expect(calledData).not.toHaveProperty("localizationSourceSignature");
  });

  it.each([
    "TRANSLATION_TIMEOUT",
    "TRANSLATION_PROVIDER_ERROR",
    "TRANSLATION_INVALID_RESPONSE",
    "TRANSLATION_UNEXPECTED_ERROR",
  ])("accepts error code %s", async (code) => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { quotation: { updateMany: quotationUpdateMany } };

    const repository = new PrismaQuotationRepository(db as never);
    const params: FailQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "sig-1",
      expectedClaimToken: "token-1",
      errorCode: code as any,
    };

    const result = await repository.failLocalization(params);
    expect(result).toBe(true);
    const calledData = quotationUpdateMany.mock.calls[0][0].data;
    expect(calledData.localizationLastError).toBe(code);
  });

  it("returns false when failLocalization fence misses", async () => {
    const quotationUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const db = {
      quotation: {
        updateMany: quotationUpdateMany,
      },
    };

    const repository = new PrismaQuotationRepository(db as never);
    const params: FailQuotationLocalizationParams = {
      companyId: "company-1",
      quotationId: "quotation-1",
      expectedSourceSignature: "wrong-sig",
      expectedClaimToken: "wrong-token",
      errorCode: "TRANSLATION_TIMEOUT",
    };

    const result = await repository.failLocalization(params);

    expect(result).toBe(false);
    expect(quotationUpdateMany).toHaveBeenCalledTimes(1);
  });
});
