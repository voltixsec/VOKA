import { describe, expect, it, vi } from "vitest";

import { Quotation } from "../../../domain/quotation";
import { LocalizationStatus } from "../../../domain/quotation/types/LocalizationStatus";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import { analyzeQuotationLocalization } from "../services/QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "../services/QuotationLocalizationSourceSignature";
import { UpdateQuotationUseCase } from "../use-cases/UpdateQuotationUseCase";

const baseLine = {
  id: "line-1",
  position: 1,
  type: "PRODUCT" as const,
  itemName: "Camera",
  itemNameEn: "Camera",
  itemNameAr: null,
  description: null,
  unitName: null,
  quantity: 1,
  unitPrice: 10,
};

function signatureFor(itemName = "Camera") {
  return createQuotationLocalizationSourceSignature(
    analyzeQuotationLocalization({
      localizationSourceLocale: "en",
      lines: [{ ...baseLine, itemName, itemNameEn: itemName }],
    }),
  );
}

function createRepository(quotation: Quotation): IQuotationRepository {
  let stored = quotation;
  return {
    existsByNumber: vi.fn(),
    save: vi.fn(),
    findById: vi.fn().mockImplementation(async () => stored),
    findAll: vi.fn(),
    update: vi.fn().mockImplementation(async (_companyId, next) => {
      stored = next;
    }),
    delete: vi.fn(),
    claimLocalization: vi.fn(),
  };
}

const referenceValidator: IQuotationReferenceValidator = {
  findInvalidReference: vi.fn().mockResolvedValue(null),
  getCustomerSnapshot: vi.fn(),
};

function restoreWithLifecycle(
  lifecycle: Partial<Parameters<typeof Quotation.restore>[0]>,
) {
  return Quotation.restore({
    id: "quotation-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    customer: { name: "Customer" },
    lines: [baseLine],
    localizationSourceLocale: "en",
    localizationSourceSignature: signatureFor(),
    ...lifecycle,
  });
}

async function update(
  quotation: Quotation,
  itemName = "Camera",
  discount: { type: "PERCENTAGE"; value: number } | null = null,
) {
  const repository = createRepository(quotation);
  const useCase = new UpdateQuotationUseCase(repository, referenceValidator);
  const result = await useCase.execute({
    companyId: "company-1",
    quotationId: "quotation-1",
    lines: [{ ...baseLine, itemName, itemNameEn: itemName }],
    discount,
  });
  expect(result.success).toBe(true);
  return (await repository.findById("company-1", "quotation-1"))!;
}

describe("quotation localization source signature", () => {
  it("is deterministic for the same canonical source", () => {
    expect(signatureFor()).toBe(signatureFor());
  });

  it("changes when canonical source text changes", () => {
    expect(signatureFor("Camera")).not.toBe(signatureFor("Recorder"));
  });

  it("preserves COMPLETED status when the source signature is unchanged", async () => {
    const completed = restoreWithLifecycle({
      localizationStatus: LocalizationStatus.COMPLETED,
    });
    const saved = await update(completed);

    expect(saved.localizationSourceSignature).toBe(signatureFor());
    expect(saved.localizationStatus).toBe(LocalizationStatus.COMPLETED);
  });

  it("starts a new generation when completed source changes", async () => {
    const completed = restoreWithLifecycle({
      localizationStatus: LocalizationStatus.COMPLETED,
    });
    const saved = await update(completed, "Recorder");

    expect(saved.localizationSourceSignature).toBe(signatureFor("Recorder"));
    expect(saved.localizationStatus).toBe(LocalizationStatus.PENDING);
  });

  it("preserves FAILED retry state when source is unchanged", async () => {
    const failed = restoreWithLifecycle({
      localizationStatus: LocalizationStatus.FAILED,
      localizationAttemptCount: 2,
      localizationLastError: "TRANSLATION_TIMEOUT",
    });
    const saved = await update(failed);

    expect(saved.localizationSourceSignature).toBe(signatureFor());
    expect(saved.localizationStatus).toBe("FAILED");
    expect(saved.localizationAttemptCount).toBe(2);
    expect(saved.localizationLastError).toBe("TRANSLATION_TIMEOUT");
  });

  it("does not create a new generation for a commercial-only change", async () => {
    const failed = restoreWithLifecycle({
      localizationStatus: LocalizationStatus.FAILED,
      localizationAttemptCount: 2,
      localizationLastError: "TRANSLATION_TIMEOUT",
    });
    const saved = await update(
      failed,
      "Camera",
      { type: "PERCENTAGE", value: 5 },
    );

    expect(saved.discount).toEqual({ type: "PERCENTAGE", value: 5 });
    expect(saved.localizationSourceSignature).toBe(signatureFor());
    expect(saved.localizationStatus).toBe(LocalizationStatus.FAILED);
    expect(saved.localizationAttemptCount).toBe(2);
  });

  it("preserves an active PENDING claim when source is unchanged", async () => {
    const lease = new Date(Date.now() + 60_000);
    const pending = restoreWithLifecycle({
      localizationStatus: LocalizationStatus.PENDING,
      localizationAttemptCount: 2,
      localizationClaimToken: "token-a",
      localizationLeaseUntil: lease,
    });
    const saved = await update(pending);

    expect(saved.localizationClaimToken).toBe("token-a");
    expect(saved.localizationLeaseUntil).toEqual(lease);
    expect(saved.localizationAttemptCount).toBe(2);
  });

  it("starts a new generation and fences the active claim when source changes", async () => {
    const completedAt = new Date("2026-08-10T10:00:00.000Z");
    const pending = restoreWithLifecycle({
      localizationStatus: LocalizationStatus.PENDING,
      localizationAttemptCount: 2,
      localizationLastError: "TRANSLATION_TIMEOUT",
      localizationClaimToken: "token-a",
      localizationLeaseUntil: new Date(Date.now() + 60_000),
      localizationCompletedAt: completedAt,
    });
    const saved = await update(pending, "Recorder");

    expect(saved.localizationSourceSignature).toBe(signatureFor("Recorder"));
    expect(saved.localizationStatus).toBe("PENDING");
    expect(saved.localizationAttemptCount).toBe(0);
    expect(saved.localizationLastError).toBeNull();
    expect(saved.localizationClaimToken).toBeNull();
    expect(saved.localizationLeaseUntil).toBeNull();
    expect(saved.localizationCompletedAt).toBeNull();
  });
});
