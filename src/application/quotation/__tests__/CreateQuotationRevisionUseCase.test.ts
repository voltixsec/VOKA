import { describe, expect, it, vi } from "vitest";
import { CreateQuotationRevisionUseCase } from "../use-cases/CreateQuotationRevisionUseCase";
import type { IQuotationRevisionRepository } from "../repositories/IQuotationRevisionRepository";
import { Quotation } from "../../../domain/quotation";

function approvedRevision() {
  return Quotation.restore({
    id: "q-rev-2",
    companyId: "company-1",
    customerId: "customer-1",
    number: "QT-100",
    familyId: "q-original",
    revisionNumber: 2,
    previousRevisionId: "q-rev-1",
    isCurrentRevision: true,
    status: "DRAFT",
    customer: { name: "Customer" },
  });
}

describe("CreateQuotationRevisionUseCase", () => {
  it("returns the exact newly-created family revision", async () => {
    const quotation = approvedRevision();
    const repository = {
      createFromApprovedSnapshot: vi.fn().mockResolvedValue({ kind: "CREATED", quotation }),
      findFamilyHistory: vi.fn(),
    } satisfies IQuotationRevisionRepository;
    const result = await new CreateQuotationRevisionUseCase(repository).execute({
      companyId: "company-1",
      quotationId: "q-rev-1",
    });
    expect(result).toEqual({ success: true, data: quotation });
    expect(repository.createFromApprovedSnapshot).toHaveBeenCalledWith("company-1", "q-rev-1");
  });

  it.each([
    ["NOT_FOUND", "QUOTATION_NOT_FOUND"],
    ["NOT_CURRENT", "QUOTATION_REVISION_NOT_CURRENT"],
    ["NOT_APPROVED", "QUOTATION_REVISION_REQUIRES_APPROVAL"],
  ] as const)("maps %s safely", async (kind, code) => {
    const repository = {
      createFromApprovedSnapshot: vi.fn().mockResolvedValue({ kind }),
      findFamilyHistory: vi.fn(),
    } satisfies IQuotationRevisionRepository;
    const result = await new CreateQuotationRevisionUseCase(repository).execute({
      companyId: "company-1",
      quotationId: "quotation-1",
    });
    expect(result).toMatchObject({ success: false, error: { code } });
  });
});
