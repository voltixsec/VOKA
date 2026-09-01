import { describe, expect, it, vi } from "vitest";
import { CreateQuotationFromCommercialHandoff, adaptCommercialHandoffToQuotationDraft, commercialHandoffQuotationNumber, type CommercialHandoffQuotationPort, type CommercialSolutionHandoff, type FactProvenance } from "../index";

const confirmed = (key: string, value: string | number, provenance: FactProvenance = "USER_EXPLICIT") => ({ key, value, provenance, evidence: String(value), updatedAt: "2026-08-31T00:00:00.000Z" });
function handoff(overrides: Partial<CommercialSolutionHandoff> = {}): CommercialSolutionHandoff {
  return { runtimeId: "runtime-vehicle-1", confirmedFacts: { "system.identity": confirmed("system.identity", "Vehicle Elevator"), "system.jurisdiction": confirmed("system.jurisdiction", "Kuwait"), "customer.name": confirmed("customer.name", "National Telecom"), "scope.type": confirmed("scope.type", "SUPPLY_AND_INSTALLATION"), "system.numberOfStops": confirmed("system.numberOfStops", 6) }, commercialLines: [], toolEvidence: [], createdAt: "2026-08-31T00:00:00.000Z", ...overrides };
}
function port(overrides: Partial<CommercialHandoffQuotationPort> = {}): CommercialHandoffQuotationPort {
  return {
    findByNumber: vi.fn().mockResolvedValue(null),
    resolveCustomer: vi.fn().mockResolvedValue({ status: "RESOLVED", id: "customer-1", name: "National Telecom" }),
    loadDefaults: vi.fn().mockResolvedValue({ currencyCode: "KWD", termsAr: "شروط الشركة", termsEn: "Company terms" }),
    createDraft: vi.fn().mockResolvedValue({ success: true, draft: { id: "quotation-1", status: "DRAFT", localizationPending: false } }),
    ...overrides,
  };
}

describe("Commercial handoff → authoritative quotation draft", () => {
  it("creates exactly one DRAFT and returns the existing edit composer route", async () => {
    const gateway = port();
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(result).toEqual({ status: "CREATED", quotationId: "quotation-1", navigationTarget: "/dashboard/quotations/quotation-1/edit", localizationPending: false });
    expect(gateway.createDraft).toHaveBeenCalledOnce();
    const input = vi.mocked(gateway.createDraft).mock.calls[0][0];
    expect(input).not.toHaveProperty("status");
    expect(input).not.toHaveProperty("sentAt");
    expect(input).not.toHaveProperty("approvedAt");
  });

  it("uses reducer-confirmed facts only and cannot copy raw chat into canonical quotation data", () => {
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: handoff(), customer: { status: "RESOLVED", id: "customer-1", name: "Persisted Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: "Approved company terms" }, locale: "en" });
    expect(draft).toMatchObject({ customerId: "customer-1", customer: { name: "Persisted Customer" }, scopeType: "SUPPLY_AND_INSTALLATION", currencyCode: "KWD", termsAndConditionsEn: "Approved company terms" });
    expect(JSON.stringify(draft)).not.toContain("raw conversation");
    expect(draft?.notesEn).toBeNull();
  });

  it("reuses company currency and approved scope terms", async () => {
    const gateway = port();
    await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: handoff(), locale: "ar" });
    expect(gateway.loadDefaults).toHaveBeenCalledWith("company-1", "SUPPLY_AND_INSTALLATION");
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0]).toMatchObject({ currencyCode: "KWD", termsAndConditionsAr: "شروط الشركة" });
  });

  it("opens an early Draft when customer is missing and keeps customer pending", async () => {
    const gateway = port();
    const value = handoff(); delete value.confirmedFacts["customer.name"];
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: value, locale: "ar" });
    expect(result).toMatchObject({ status: "CREATED" });
    expect(gateway.resolveCustomer).not.toHaveBeenCalled();
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0]).toMatchObject({ customerId: null, customer: null });
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0]).toMatchObject({ projectName: null, attentionName: null });
  });

  it("blocks an ambiguous customer rather than guessing", async () => {
    const gateway = port({ resolveCustomer: vi.fn().mockResolvedValue({ status: "AMBIGUOUS", candidates: [{ id: "c1", name: "National Co" }, { id: "c2", name: "National Telecom" }] }) });
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(result).toMatchObject({ status: "NEEDS_COMMERCIAL_INFO", blockingFields: [{ key: "customer.selection", candidates: [{ id: "c1", name: "National Co" }, { id: "c2", name: "National Telecom" }] }] });
    expect(gateway.createDraft).not.toHaveBeenCalled();
  });

  it("does not block on optional project, attention, validity, or commercial lines", async () => {
    const gateway = port();
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(result.status).toBe("CREATED");
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0].lines).toEqual([]);
  });

  it("is idempotent before creation and after a concurrent unique conflict", async () => {
    const existing = { id: "quotation-existing", status: "DRAFT", localizationPending: false };
    const already = port({ findByNumber: vi.fn().mockResolvedValue(existing) });
    const first = await new CreateQuotationFromCommercialHandoff(already).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(first.status).toBe("EXISTING");
    expect(already.createDraft).not.toHaveBeenCalled();

    const raced = port({ findByNumber: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing), createDraft: vi.fn().mockResolvedValue({ success: false, code: "QUOTATION_ALREADY_EXISTS", message: "duplicate" }) });
    const second = await new CreateQuotationFromCommercialHandoff(raced).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(second).toMatchObject({ status: "EXISTING", quotationId: "quotation-existing" });
  });

  it("produces a professional stable quotation reference without exposing runtime identity", () => {
    expect(commercialHandoffQuotationNumber(handoff())).toBe(commercialHandoffQuotationNumber(handoff({ confirmedFacts: { ...handoff().confirmedFacts, "system.numberOfStops": confirmed("system.numberOfStops", 8) } })));
    expect(commercialHandoffQuotationNumber(handoff())).toBe("QT-20260831-000000000");
    expect(commercialHandoffQuotationNumber(handoff())).not.toContain("AI-");
    expect(commercialHandoffQuotationNumber(handoff())).not.toContain("RUNTIME");
  });

  it("preserves researched requirements as pending generic Draft lines without fake catalog or price truth", () => {
    const unsafe = handoff({ commercialLines: [{ catalogItemId: "fake-sku", itemName: "Suggested cylinder", quantity: 1, unitPrice: 10, type: "PRODUCT", authority: "RESEARCHED" as never }] });
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: unsafe, customer: { status: "RESOLVED", id: "customer-1", name: "Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: null }, locale: "en" });
    expect(draft?.lines).toHaveLength(1);
    expect(draft?.lines[0]).toMatchObject({ catalogItemId: null, unitPrice: null, pricingStatus: "PENDING", productSelectionStatus: "PENDING", provenance: "RESEARCHED" });
  });
});
