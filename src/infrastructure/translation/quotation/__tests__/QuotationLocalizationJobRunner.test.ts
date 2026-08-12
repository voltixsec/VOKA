import { describe, expect, it, vi } from "vitest";
import type { IQuotationRepository } from "../../../../application/quotation/repositories/IQuotationRepository";
import { analyzeQuotationLocalization } from "../../../../application/quotation/services/QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "../../../../application/quotation/services/QuotationLocalizationSourceSignature";
import { Quotation } from "../../../../domain/quotation/entities/Quotation";
import { QuotationLocalizationJobRunner } from "../QuotationLocalizationJobRunner";

const params = { companyId: "company-1", quotationId: "quotation-1" };
function quotation() { return Quotation.restore({ id: "quotation-1", companyId: "company-1", customerId: "customer-1", number: "Q-001", customer: { name: "Customer" }, localizationSourceLocale: "en", lines: [{ id: "line-1", position: 1, type: "PRODUCT", itemName: "Camera", itemNameEn: "Camera", itemNameAr: null, quantity: 1, unitPrice: 10 }] }); }
function signature() { return createQuotationLocalizationSourceSignature(analyzeQuotationLocalization({ customer: { name: "Customer" }, lines: [{ id: "line-1", itemName: "Camera", itemNameEn: "Camera", itemNameAr: null, description: null, descriptionAr: null, descriptionEn: null, unitName: null, unitNameAr: null, unitNameEn: null }] }, "en")); }
function repository(): IQuotationRepository { return { existsByNumber: vi.fn(), save: vi.fn(), findById: vi.fn().mockResolvedValue(quotation()), findAll: vi.fn(), update: vi.fn(), delete: vi.fn(), claimLocalization: vi.fn().mockResolvedValue({ claimToken: "claim-1", sourceSignature: signature(), attemptCount: 1 }), completeLocalization: vi.fn().mockResolvedValue(true), failLocalization: vi.fn().mockResolvedValue(true) }; }

describe("QuotationLocalizationJobRunner", () => {
  it("claims first and completes current localization through the fence", async () => {
    const repo = repository();
    const localize = vi.fn(async (snapshot: Record<string, unknown>) => ({ ...snapshot, lines: (snapshot.lines as Array<Record<string, unknown>>).map(line => ({ ...line, itemNameAr: "كاميرا" })) }));
    const runner = new QuotationLocalizationJobRunner(repo, localize);
    expect(await runner.run(params)).toBe("COMPLETED");
    expect(repo.claimLocalization).toHaveBeenCalledWith({ ...params, leaseDurationMs: 12 * 60 * 1000 });
    expect(vi.mocked(repo.claimLocalization).mock.invocationCallOrder[0]).toBeLessThan(localize.mock.invocationCallOrder[0]);
    expect(repo.completeLocalization).toHaveBeenCalledWith(expect.objectContaining({ ...params, expectedSourceSignature: signature(), expectedClaimToken: "claim-1", lines: [expect.objectContaining({ id: "line-1", itemNameAr: "كاميرا" })] }));
  });
  it("returns NO_CLAIM without reading or AI", async () => {
    const repo = repository(); vi.mocked(repo.claimLocalization).mockResolvedValue(null); const localize = vi.fn();
    expect(await new QuotationLocalizationJobRunner(repo, localize).run(params)).toBe("NO_CLAIM");
    expect(repo.findById).not.toHaveBeenCalled(); expect(localize).not.toHaveBeenCalled();
  });
  it("returns STALE before AI on signature mismatch", async () => {
    const repo = repository(); vi.mocked(repo.claimLocalization).mockResolvedValue({ claimToken: "old", sourceSignature: "old", attemptCount: 1 }); const localize = vi.fn();
    expect(await new QuotationLocalizationJobRunner(repo, localize).run(params)).toBe("STALE");
    expect(localize).not.toHaveBeenCalled(); expect(repo.completeLocalization).not.toHaveBeenCalled();
  });
  it("classifies AI failure and uses the same fence", async () => {
    const repo = repository(); const runner = new QuotationLocalizationJobRunner(repo, vi.fn().mockRejectedValue(new Error("Provider unavailable")));
    expect(await runner.run(params)).toBe("FAILED");
    expect(repo.failLocalization).toHaveBeenCalledWith({ ...params, expectedSourceSignature: signature(), expectedClaimToken: "claim-1", errorCode: "TRANSLATION_PROVIDER_ERROR" });
  });
});
