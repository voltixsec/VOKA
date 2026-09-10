import { describe, expect, it, vi } from "vitest";
import { CreateQuotationFromCommercialHandoff, adaptCommercialHandoffToQuotationDraft, type CommercialHandoffQuotationPort, type CommercialSolutionHandoff, type FactProvenance } from "../index";
import type { QuotationLineInput } from "@/src/domain/quotation";

const confirmed = (key: string, value: string | number, provenance: FactProvenance = "USER_EXPLICIT") => ({ key, value, provenance, evidence: String(value), updatedAt: "2026-08-31T00:00:00.000Z" });
function handoff(overrides: Partial<CommercialSolutionHandoff> = {}): CommercialSolutionHandoff {
  return { runtimeId: "runtime-vehicle-1", confirmedFacts: { "system.identity": confirmed("system.identity", "Vehicle Elevator"), "system.jurisdiction": confirmed("system.jurisdiction", "Kuwait"), "customer.name": confirmed("customer.name", "National Telecom"), "scope.type": confirmed("scope.type", "SUPPLY_AND_INSTALLATION"), "system.numberOfStops": confirmed("system.numberOfStops", 6) }, commercialLines: [], toolEvidence: [], createdAt: "2026-08-31T00:00:00.000Z", ...overrides };
}
function port(overrides: Partial<CommercialHandoffQuotationPort> = {}): CommercialHandoffQuotationPort {
  return {
    findByHandoff: vi.fn().mockResolvedValue(null),
    resolveCustomer: vi.fn().mockResolvedValue({ status: "RESOLVED", id: "customer-1", name: "National Telecom" }),
    loadDefaults: vi.fn().mockResolvedValue({ currencyCode: "KWD", termsAr: "شروط الشركة", termsEn: "Company terms", payment: null, delivery: null, warranty: null, validity: null }),
    createDraft: vi.fn().mockResolvedValue({ success: true, draft: { id: "quotation-1", status: "DRAFT", localizationPending: false } }),
    ...overrides,
  };
}

function expectLosslessCommercialProjection(governed: CommercialSolutionHandoff["commercialLines"][number], quotation: QuotationLineInput) {
  expect(quotation).toMatchObject({
    quantity: governed.quantity,
    unitName: governed.unitName,
    productSelectionStatus: governed.productSelectionStatus,
    engineeringStatus: governed.engineeringStatus,
    commercialPricingStatus: governed.pricingStatus,
    brandName: governed.brand ?? null,
    modelNumber: governed.model ?? null,
    commercialAttributes: governed.commercialAttributes,
  });
  for (const value of Object.values(governed.commercialAttributes ?? {}).flatMap((item) => Array.isArray(item) ? item : [item]).filter((item) => item !== null && item !== undefined)) {
    const structuredOrRendered = JSON.stringify(quotation.commercialAttributes ?? {}) + " " + [quotation.itemName, quotation.itemNameAr, quotation.itemNameEn, quotation.description].filter(Boolean).join(" ");
    expect(structuredOrRendered.toLocaleLowerCase()).toContain(String(value).toLocaleLowerCase());
  }
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
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: handoff(), customer: { status: "RESOLVED", id: "customer-1", name: "Persisted Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: "Approved company terms", payment: null, delivery: null, warranty: null, validity: null }, locale: "en" });
    expect(draft).toMatchObject({ customerId: "customer-1", customer: { name: "Persisted Customer" }, scopeType: "SUPPLY_AND_INSTALLATION", currencyCode: "KWD", termsAndConditionsEn: "Approved company terms" });
    expect(JSON.stringify(draft)).not.toContain("raw conversation");
    expect(draft?.notesEn).toBeNull();
  });

  it("reuses company currency and approved scope terms", async () => {
    const gateway = port();
    await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: handoff(), locale: "ar" });
    expect(gateway.loadDefaults).toHaveBeenCalledWith("company-1", "SUPPLY_AND_INSTALLATION", "ar");
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0]).toMatchObject({ currencyCode: "KWD", termsAndConditionsAr: "شروط الشركة" });
  });

  it("loads current supply-only Company Settings at creation after a scope correction, never stale chat terms", async () => {
    const gateway = port({ resolveCustomer: vi.fn().mockResolvedValue({ status: "PENDING", proposedName: "National Telecom" }), loadDefaults: vi.fn().mockResolvedValue({ currencyCode: "KWD", termsAr: "شروط التوريد الحالية", termsEn: "Current supply-only legal terms", payment: "cash", delivery: null, warranty: null, validity: null }) });
    const value = handoff();
    value.confirmedFacts["scope.type"] = confirmed("scope.type", "SUPPLY_ONLY", "USER_CORRECTION");
    value.confirmedFacts["commercial.payment"] = confirmed("commercial.payment", "stale installation payment");
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: value, locale: "en" });
    expect(result.status).toBe("CREATED");
    expect(gateway.loadDefaults).toHaveBeenCalledWith("company-1", "SUPPLY_ONLY", "en");
    const draft = vi.mocked(gateway.createDraft).mock.calls[0][0];
    expect(draft).toMatchObject({ customerId: null, customer: { name: "National Telecom" }, scopeType: "SUPPLY_ONLY", termsAndConditionsEn: "Current supply-only legal terms" });
    expect(draft.termsAndConditionsEn).not.toContain("stale installation");
  });

  it("creates a reviewable Draft before a customer is known", async () => {
    const gateway = port();
    const value = handoff(); delete value.confirmedFacts["customer.name"];
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: value, locale: "ar" });
    expect(result.status).toBe("CREATED");
    expect(gateway.resolveCustomer).not.toHaveBeenCalled();
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0]).toMatchObject({ customerId: null, customer: null });
  });

  it("preserves an ambiguous proposed customer in the Draft without guessing a canonical id", async () => {
    const gateway = port({ resolveCustomer: vi.fn().mockResolvedValue({ status: "AMBIGUOUS", proposedName: "National Telecom", candidates: [{ id: "c1", name: "National Co" }, { id: "c2", name: "National Telecom" }] }) });
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(result).toMatchObject({ status: "CREATED" });
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0]).toMatchObject({ customerId: null, customer: { name: "National Telecom" } });
  });

  it("does not block on optional project, attention, validity, or commercial lines", async () => {
    const gateway = port();
    const result = await new CreateQuotationFromCommercialHandoff(gateway).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(result.status).toBe("CREATED");
    expect(vi.mocked(gateway.createDraft).mock.calls[0][0].lines).toEqual([]);
  });

  it("is idempotent before creation and after a concurrent unique conflict", async () => {
    const existing = { id: "quotation-existing", status: "DRAFT", localizationPending: false };
    const already = port({ findByHandoff: vi.fn().mockResolvedValue(existing) });
    const first = await new CreateQuotationFromCommercialHandoff(already).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(first.status).toBe("EXISTING");
    expect(already.createDraft).not.toHaveBeenCalled();

    const raced = port({ findByHandoff: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing), createDraft: vi.fn().mockResolvedValue({ success: false, code: "QUOTATION_ALREADY_EXISTS", message: "duplicate" }) });
    const second = await new CreateQuotationFromCommercialHandoff(raced).execute({ companyId: "company-1", handoff: handoff(), locale: "en" });
    expect(second).toMatchObject({ status: "EXISTING", quotationId: "quotation-existing" });
  });

  it("leaves visible numbering to the canonical server policy and uses runtime identity only as hidden family idempotency", () => {
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: handoff(), customer: null, defaults: { currencyCode: "KWD", termsAr: null, termsEn: null, payment: null, delivery: null, warranty: null, validity: null }, locale: "en" });
    expect(draft?.quotationNumber).toBeUndefined();
    expect(draft?.familyId).toBe("runtime-vehicle-1");
  });

  it("preserves researched requirements and market evidence without turning either into catalog or selling-price truth", () => {
    const marketPrice = { priceAmount: 42, priceCurrency: "KWD", priceMin: null, priceMax: null, priceUnit: "unit", priceType: "LISTED_RETAIL" as const, priceSourceUrl: "https://supplier.example/item", priceSourceTitle: "Supplier listing", priceObservedAt: "2026-09-01T00:00:00.000Z" };
    const unsafe = handoff({ commercialLines: [{ catalogItemId: "fake-sku", itemName: "Suggested cylinder", quantity: 1, unitPrice: 10, type: "PRODUCT", authority: "RESEARCHED" as never, marketPrice }] });
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: unsafe, customer: { status: "RESOLVED", id: "customer-1", name: "Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: null, payment: null, delivery: null, warranty: null, validity: null }, locale: "en" });
    expect(draft?.lines).toHaveLength(1);
    expect(draft?.lines[0]).toMatchObject({ catalogItemId: null, unitPrice: null, pricingStatus: "PENDING", productSelectionStatus: "PENDING", provenance: "RESEARCHED", marketPrice });
  });

  it("preserves the final governed CCTV BOM as distinct 200 outdoor and 140 indoor lines", () => {
    const value = handoff({
      commercialLines: [
        { catalogItemId: null, itemName: "Outdoor IP Camera", itemNameEn: "Outdoor IP Camera", itemNameAr: "كاميرا IP خارجية", description: "IP67; 4 MP", quantity: 200, unitPrice: null, unitName: "pcs", type: "PRODUCT", authority: "DETERMINISTIC_DERIVATION", quantityState: "CONFIRMED", priceState: "PENDING", componentKeys: ["CCTV_OUTDOOR_CAMERA"], brand: "Axis", model: "P3267-LVE" },
        { catalogItemId: null, itemName: "Indoor IP Camera", itemNameEn: "Indoor IP Camera", itemNameAr: "كاميرا IP داخلية", description: "Indoor dome; 4 MP", quantity: 140, unitPrice: null, unitName: "pcs", type: "PRODUCT", authority: "DETERMINISTIC_DERIVATION", quantityState: "CONFIRMED", priceState: "PENDING", componentKeys: ["CCTV_INDOOR_CAMERA"], brand: "Axis", model: "M3086-V" },
      ],
    });
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: value, customer: { status: "PROPOSED", name: "New Kuwait Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: "Company installation terms", payment: null, delivery: null, warranty: null, validity: null }, locale: "en" });

    expect(draft?.lines).toHaveLength(2);
    expect(draft?.lines.map((line) => [line.itemName, line.quantity])).toEqual([
      ["Outdoor IP Camera", 200],
      ["Indoor IP Camera", 140],
    ]);
    expect(draft?.lines[0]).toMatchObject({ description: "IP67; 4 MP", brandName: "Axis", modelNumber: "P3267-LVE", engineeringComponentKeys: ["CCTV_OUTDOOR_CAMERA"] });
    expect(draft?.customerId).toBeNull();
    expect(draft?.customer).toEqual({ name: "New Kuwait Customer" });
  });

  it("is a lossless commercial projection for rich selected NVR and generic estimated HDD lines", () => {
    const lines: CommercialSolutionHandoff["commercialLines"] = [
      { catalogItemId: null, itemName: "Hikvision DS-9664NI-I16 Network Video Recorder, 64 Channel, 16 HDD Bays", itemNameEn: "Hikvision DS-9664NI-I16 Network Video Recorder, 64 Channel, 16 HDD Bays", itemNameAr: "جهاز تسجيل شبكي Hikvision DS-9664NI-I16، 64 قناة، 16 فتحة قرص", quantity: 6, unitPrice: null, unitName: "Unit", type: "PRODUCT", authority: "RESEARCHED", quantityState: "CONFIRMED", priceState: "PENDING", componentKeys: ["NVR_RECORDER"], brand: "Hikvision", model: "DS-9664NI-I16", productSelectionStatus: "SELECTED", engineeringStatus: "EXACT", pricingStatus: "PENDING", commercialAttributes: { channels: 64, diskBays: 16 } },
      { catalogItemId: null, itemName: "Surveillance hard disk drive, 18TB", itemNameEn: "Surveillance hard disk drive, 18TB", itemNameAr: "قرص صلب للمراقبة، 18TB", quantity: 49, unitPrice: null, unitName: "Unit", type: "PRODUCT", authority: "DETERMINISTIC_DERIVATION", quantityState: "CONFIRMED", priceState: "PENDING", componentKeys: ["SURVEILLANCE_HDD"], productSelectionStatus: "GENERIC", engineeringStatus: "ESTIMATED", pricingStatus: "PENDING", commercialAttributes: { capacity: "18TB" } },
    ];
    const value = handoff({ commercialLines: lines });
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: value, customer: { status: "PROPOSED", name: "Kuwait Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: null, payment: null, delivery: null, warranty: null, validity: null }, locale: "en" })!;

    expect(draft.lines[0].itemName).toMatch(/Hikvision DS-9664NI-I16.*64 Channel.*16 HDD Bays/);
    expect(draft.lines[1].itemName).toContain("18TB");
    expectLosslessCommercialProjection(lines[0], draft.lines[0]);
    expectLosslessCommercialProjection(lines[1], draft.lines[1]);
    expect(draft.lines.every((line) => line.pricingStatus === "PENDING" && line.unitPrice === null)).toBe(true);
  });

  it("uses current authoritative scope terms, governed notes, and a professional grounded brief", () => {
    const value = handoff({ workspace: {
      commercialContext: { customer: "National Telecom", project: "Kuwait HQ", attention: "Eng. Ahmed", scope: "SUPPLY_AND_INSTALLATION", jurisdiction: "Kuwait" },
      requirements: {}, engineering: { system: { key: "CCTV", nameAr: "نظام كاميرات مراقبة", nameEn: "CCTV system" }, calculations: [], bom: [], assumptions: [] },
      commercialSolution: { bom: [] }, products: { candidates: [], approvedCandidateIds: [] },
      siteAndResponsibilities: { siteRequirements: ["Power availability", "Network readiness"], supplierResponsibilities: ["Installation"], customerResponsibilities: ["Civil works and access"], exclusions: ["Builder works"], notes: [] },
      terms: { payment: "25% advance", delivery: "stale delivery", warranty: null, validity: null, sources: { payment: "EXPLICIT", delivery: "COMPANY_DEFAULT", warranty: null, validity: null }, currencyCode: "KWD", companyTermsAr: null, companyTermsEn: "Stale installation terms", defaultsScope: "SUPPLY_AND_INSTALLATION", defaultsLoaded: true },
      readiness: { draftReady: true, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: [] }, updatedAt: "2026-09-01T00:00:00.000Z",
    } });
    const defaults = { currencyCode: "KWD", termsAr: null, termsEn: "Payment: cash\nDelivery: 14 days\nCurrent company installation clause", payment: "cash", delivery: "14 days", warranty: null, validity: null };
    const draft = adaptCommercialHandoffToQuotationDraft({ companyId: "company-1", handoff: value, customer: null, defaults, locale: "en" });

    expect(draft?.termsAndConditionsEn).toContain("Current company installation clause");
    expect(draft?.termsAndConditionsEn).toContain("Payment: cash");
    expect(draft?.termsAndConditionsEn).toContain("Delivery: 14 days");
    expect(draft?.termsAndConditionsEn).not.toMatch(/25% advance|Power|Network|Civil|Builder|stale delivery|Stale installation/);
    expect(draft?.notesEn).toMatch(/Power availability|Network readiness|Civil works and access|Builder works/);
    expect(draft?.briefEn).toMatch(/^Supply and installation of Vehicle Elevator/);
    expect(draft?.briefEn).not.toMatch(/Draft quotation|AI|```|\{/);
  });
});
