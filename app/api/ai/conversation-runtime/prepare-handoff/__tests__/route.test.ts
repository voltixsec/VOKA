import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), sign: vi.fn(), roles: [] as readonly string[] }));
vi.mock("@/src/infrastructure/ai/ConversationStateToken", () => ({ verifyConversationState: mocks.verify }));
vi.mock("@/src/infrastructure/ai/CommercialHandoffToken", () => ({ signCommercialHandoff: mocks.sign }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (roles: readonly string[], handler: Function) => { mocks.roles = roles; return async (request: Request) => { try { return await handler(request, {}, { companyId: "tenant-1" }); } catch (error) { return responses.handleApiError(error); } }; } };
});
import { POST } from "../route";
import { cctv340Scenario } from "@/src/application/conversation-runtime/__tests__/fixtures/cctv340";
import { gypsumScenario } from "@/src/application/conversation-runtime/__tests__/fixtures/gypsum";
import { adaptCommercialHandoffToQuotationDraft, type CommercialSolutionHandoff } from "@/src/application/conversation-runtime";
import { Quotation } from "@/src/domain/quotation";
import { serializeQuotation } from "@/app/api/quotations/serialize-quotation";
import { PrismaQuotationMapper } from "@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationMapper";

describe("POST /api/ai/conversation-runtime/prepare-handoff", () => {
  it("preserves board and compound ownership through the actual handoff and quotation projection", async () => {
    const { final } = await gypsumScenario();
    mocks.verify.mockResolvedValue(final);
    const response = await POST(new Request("http://localhost/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "gypsum-fixture" } }) }));
    expect(response.status).toBe(200);
    const handoff = mocks.sign.mock.calls[0][0] as CommercialSolutionHandoff;
    const dto = adaptCommercialHandoffToQuotationDraft({ companyId: "tenant-1", handoff, locale: "en", customer: { status: "PROPOSED", name: "Proposed Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: "Current installation terms", payment: null, delivery: null, warranty: null, validity: null } })!;
    const quotation = new Quotation({ ...dto, number: "QT-GYPSUM-001" });
    const serialized = serializeQuotation(quotation, "en");
    expect(dto.customerId).toBeNull();
    expect(dto.customer?.name).toBe("Proposed Customer");
    expect(serialized.lines).toHaveLength(final.workspace!.commercialSolution.bom.length);
    for (const [id, name] of [["GYPSUM_BOARDS", "Sheetrock Standard 12.5mm"], ["JOINT_COMPOUND", "Sheetrock All Purpose Joint Compound"]]) {
      const governed = final.workspace!.commercialSolution.bom.find((line) => line.id === id)!;
      const projected = quotation.lines.filter((line) => line.engineeringComponentKeys?.includes(id));
      expect(projected).toHaveLength(1);
      expect(projected[0]).toMatchObject({ itemNameEn: name, quantity: governed.quantity, unitName: governed.unitName, description: governed.description, unitPrice: null, productSelectionStatus: "SELECTED", commercialPricingStatus: "PENDING" });
    }
  });
  it("carries the exact 340-camera runtime through signed handoff, Quotation lines and serialization losslessly", async () => {
    const { final } = await cctv340Scenario();
    mocks.verify.mockResolvedValue(final);
    const response = await POST(new Request("http://localhost/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "verified-fixture" } }) }));
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith("verified-fixture", "tenant-1");
    const handoff = mocks.sign.mock.calls[0][0] as CommercialSolutionHandoff;
    expect(mocks.sign.mock.calls[0][1]).toBe("tenant-1");
    const dto = adaptCommercialHandoffToQuotationDraft({ companyId: "tenant-1", handoff, locale: "en", customer: { status: "PROPOSED", name: "Kuwait Customer" }, defaults: { currencyCode: "KWD", termsAr: null, termsEn: null, payment: null, delivery: null, warranty: null, validity: null } })!;
    const quotation = new Quotation({ ...dto, number: "QT-FIXTURE-001" });
    const serialized = serializeQuotation(quotation, "en");
    const persisted = PrismaQuotationMapper.toPersistence(quotation);
    const persistedLines = persisted.lines?.create as Array<Record<string, unknown>>;
    const bom = final.workspace!.commercialSolution.bom;
    expect(quotation.lines).toHaveLength(bom.length);
    for (const [index, governed] of bom.entries()) {
      expect(handoff.commercialLines[index]).toMatchObject({ itemNameEn: governed.itemNameEn, quantity: governed.quantity, commercialAttributes: governed.commercialAttributes });
      expect(quotation.lines[index]).toMatchObject({ itemNameEn: governed.itemNameEn, itemNameAr: governed.itemNameAr, quantity: governed.quantity, unitName: governed.unitName, productSelectionStatus: governed.productSelectionStatus, engineeringStatus: governed.engineeringStatus, commercialPricingStatus: governed.pricingStatus, commercialAttributes: governed.commercialAttributes, brandName: governed.brand ?? null, modelNumber: governed.model ?? null, marketPrice: governed.marketPrice ?? null });
      expect(serialized.lines[index]).toMatchObject({ itemNameEn: governed.itemNameEn, quantity: governed.quantity, productSelectionStatus: governed.productSelectionStatus, engineeringStatus: governed.engineeringStatus, commercialPricingStatus: governed.pricingStatus, commercialAttributes: governed.commercialAttributes ?? null, marketPrice: governed.marketPrice ?? null });
      expect(persistedLines[index]).toMatchObject({ itemNameEn: governed.itemNameEn, quantity: governed.quantity, productSelectionStatus: governed.productSelectionStatus,
        engineeringComponentKeys: { version: 2, componentKeys: governed.componentKeys, engineeringStatus: governed.engineeringStatus, commercialPricingStatus: governed.pricingStatus, commercialAttributes: governed.commercialAttributes ?? null, marketPrice: governed.marketPrice ?? null } });
      expect([governed.itemNameAr, governed.itemNameEn].join(" ")).not.toMatch(/Math\.ceil|formula|calculation|882.*\//i);
    }
    expect(quotation.lines.slice(0, 2).map((line) => line.quantity)).toEqual([170, 170]);
    expect(quotation.lines.find((line) => line.modelNumber === "DS-9664NI-I16")?.itemNameEn).toContain("16 HDD Bays");
    expect(quotation.lines.find((line) => line.engineeringComponentKeys?.includes("SURVEILLANCE_HDD"))?.itemNameEn).toContain("18TB");
  });
  it("blocks an unsupported document target instead of pretending quotation persistence is disconnected", async () => {
    const state = await mocks.verify();
    state.messages[0].text += " INVOICE";
    state.confirmedFacts["document.target"] = { key: "document.target", value: "INVOICE", provenance: "USER_EXPLICIT", evidence: "INVOICE", updatedAt: "2026-09-01T00:00:00.000Z" };
    mocks.verify.mockResolvedValue(state);
    const response = await POST(new Request("http://localhost/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "signed-state" } }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "DOCUMENT_TARGET_UNAVAILABLE" } });
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sign.mockResolvedValue("signed-handoff");
    mocks.verify.mockResolvedValue({
      runtimeId: "runtime-1", version: 1, locale: "en",
      messages: [{ id: "u1", role: "USER", text: "CCTV supply only", source: "TEXT", createdAt: "2026-09-01T00:00:00.000Z" }],
      confirmedFacts: {
        "system.identity": { key: "system.identity", value: "CCTV", provenance: "USER_EXPLICIT", evidence: "CCTV", updatedAt: "2026-09-01T00:00:00.000Z" },
        "scope.type": { key: "scope.type", value: "SUPPLY_ONLY", provenance: "USER_EXPLICIT", evidence: "supply only", updatedAt: "2026-09-01T00:00:00.000Z" },
      },
      candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], suggestedReplies: [], compactMemory: "",
      solutionReadiness: "MATURE", transitionState: "EXPLORING", handoff: null,
    });
  });

  it("requires customer before signing a new handoff", async () => {
    const request = new Request("http://localhost/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "signed-state" } }) });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mocks.roles).toEqual(["OWNER", "ADMIN", "SALES"]);
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: "CUSTOMER_NAME_REQUIRED" } });
  });

  it("projects the exact final governed workspace BOM without aggregating component lines", async () => {
    const base = await mocks.verify();
    base.confirmedFacts["customer.name"] = { key: "customer.name", value: "Proposed customer", provenance: "USER_EXPLICIT", evidence: "Proposed customer", updatedAt: "2026-09-01T00:00:00.000Z" };
    base.messages[0].text += " for Proposed customer";
    const line = (id: string, name: string, quantity: number) => ({ id, componentKeys: [id], category: "PRODUCT", itemName: name, itemNameAr: name, itemNameEn: name, description: `${name} specification`, unitName: "pcs", quantity, quantityState: "CONFIRMED", unitPrice: null, priceState: "PENDING", type: "PRODUCT", provenance: "USER_EXPLICIT" });
    const marketPrice = { priceAmount: 42, priceCurrency: "KWD", priceMin: null, priceMax: null, priceUnit: "unit", priceType: "LISTED_RETAIL", priceSourceUrl: "https://supplier.example/camera", priceSourceTitle: "Supplier camera", priceObservedAt: "2026-09-01T00:00:00.000Z" };
    const outdoor = { ...line("CCTV_OUTDOOR_CAMERA", "Outdoor IP Camera", 200), brand: "Hikvision", model: "DS-X", marketPrice };
    const indoor = line("CCTV_INDOOR_CAMERA", "Indoor IP Camera", 140);
    mocks.verify.mockResolvedValue({ ...base, workspace: {
      commercialContext: { customer: null, project: null, attention: null, scope: "SUPPLY_ONLY", jurisdiction: "Kuwait" },
      requirements: {}, engineering: { system: { key: "CCTV", nameAr: "CCTV", nameEn: "CCTV" }, calculations: [], bom: [outdoor, indoor], assumptions: [] },
      commercialSolution: { bom: [outdoor, indoor] }, products: { candidates: [], approvedCandidateIds: [] },
      siteAndResponsibilities: { siteRequirements: [], supplierResponsibilities: [], customerResponsibilities: [], exclusions: [], notes: [] },
      terms: { payment: null, delivery: null, warranty: null, validity: null, sources: { payment: null, delivery: null, warranty: null, validity: null }, currencyCode: "KWD", companyTermsAr: null, companyTermsEn: null, defaultsScope: "SUPPLY_ONLY", defaultsLoaded: true },
      readiness: { draftReady: true, pendingBeforeDraftOpen: [], pendingBeforeFinalIssue: ["Pricing"] }, updatedAt: "2026-09-01T00:00:00.000Z",
    } });

    await POST(new Request("http://localhost/api/ai/conversation-runtime/prepare-handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: { stateToken: "signed-state" } }) }));

    expect(mocks.sign.mock.calls[0][0].commercialLines.map((item: { itemName: string; quantity: number }) => [item.itemName, item.quantity])).toEqual([
      ["Outdoor IP Camera", 200],
      ["Indoor IP Camera", 140],
    ]);
    expect(mocks.sign.mock.calls[0][0].commercialLines[0]).toMatchObject({ brand: "Hikvision", model: "DS-X", unitPrice: null, marketPrice });
  });
});
