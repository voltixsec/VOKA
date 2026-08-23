import { describe, expect, it, vi } from "vitest";
import { Quotation } from "../../../../domain/quotation";
import { LocalizedContent } from "../../../../domain/localization/entities/LocalizedContent";
import { LocalizedContentStatus } from "../../../../domain/localization/types/LocalizedContentStatus";
import type { ILocalizedContentRepository } from "../../repositories/ILocalizedContentRepository";
import { computeSourceHash } from "../computeSourceHash";
import { resolveQuotationGenericLocale } from "../resolveQuotationGenericLocale";

function quotation(): Quotation {
  return Quotation.restore({
    id: "quotation-1", companyId: "company-1", customerId: "customer-1", number: "Q-001",
    customer: { name: "Customer" }, subjectEn: "Current authoritative subject",
    lines: [{ id: "line-1", position: 1, type: "PRODUCT", itemName: "Current item", itemNameEn: "Current item", quantity: 1, unitPrice: 1 }],
  });
}

function record(overrides: Partial<ConstructorParameters<typeof LocalizedContent>[0]> = {}): LocalizedContent {
  return new LocalizedContent({
    id: "localized-1", companyId: "company-1", resourceType: "Quotation", resourceId: "quotation-1",
    fieldKey: "subject", locale: "fr-FR", sourceLocale: "en", text: "Sujet actuel",
    status: LocalizedContentStatus.VALID, sourceHash: computeSourceHash("Current authoritative subject"),
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  });
}

function repository(records: LocalizedContent[]): ILocalizedContentRepository {
  return {
    upsertVariant: vi.fn(), upsertManyVariants: vi.fn(), findByFieldAndLocale: vi.fn(), invalidateFields: vi.fn(),
    findByResourceAndLocale: vi.fn().mockResolvedValue(records),
  };
}

describe("resolveQuotationGenericLocale freshness", () => {
  it("uses generic text only when status is VALID and sourceHash matches the current source", async () => {
    const repo = repository([record()]);
    expect((await resolveQuotationGenericLocale(quotation(), "fr-FR", repo)).subject).toBe("Sujet actuel");
  });

  it.each([
    ["stale hash", record({ sourceHash: computeSourceHash("Old subject") })],
    ["non-valid status", record({ status: LocalizedContentStatus.STALE })],
    ["missing hash", record({ sourceHash: null })],
  ])("falls back without AI for %s", async (_case, localized) => {
    const repo = repository([localized]);
    expect((await resolveQuotationGenericLocale(quotation(), "fr-FR", repo)).subject).toBe("Current authoritative subject");
  });

  it("returns fallback without querying when quotation companyId is missing", async () => {
    const value = quotation();
    Object.defineProperty(value, "companyId", { value: "" });
    const repo = repository([record()]);
    expect((await resolveQuotationGenericLocale(value, "fr-FR", repo)).subject).toBe("Current authoritative subject");
    expect(repo.findByResourceAndLocale).not.toHaveBeenCalled();
  });
});
