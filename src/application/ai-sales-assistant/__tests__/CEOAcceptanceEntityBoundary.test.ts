import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../services/AISalesAssistantService";
import { CompleteCommercialConversation } from "../../commercial-conversation/CompleteCommercialConversation";
import { companyToday, resolveExpiry } from "../services/commercial-field-values";

const CEO_INPUT = "عايز أعمل عرض سعر للشركة الوطنية للاتصالات لمشروع مخزن الشويخ بعناية المهندس محمد خالد لتوريد وتركيب نظام كاميرات مراقبة IP كامل عدد 180 كاميرا 4MP، والتسجيل لمدة 90 يوم، والدفع 70% مقدم و30% عند التسليم، وصلاحية العرض أسبوع من تاريخ العرض.";
const CUSTOMER = "الشركة الوطنية للاتصالات";

describe("CEO acceptance Arabic relational entity boundaries", () => {
  it("keeps customer, project and attention separate while preserving the canonical commercial system", async () => {
    const findAll = vi.fn().mockImplementation(async ({ search }) => search === CUSTOMER
      ? [{ id: "customer-1", code: "C1", name: CUSTOMER, status: "ACTIVE", countryCode: "KW" }]
      : []);
    const extractIntent = vi.fn().mockResolvedValue({
        // Reproduce the live regression: provider customer output swallowed the
        // remaining sentence and omitted both relational fields.
        customerMention: `${CUSTOMER} لمشروع مخزن الشويخ بعناية المهندس محمد خالد لتوريد وتركيب نظام كاميرات مراقبة IP كامل عدد 180 كاميرا`,
        projectName: null,
        attentionName: null,
        lines: [],
      });
    const provider = {
      extractIntent,
      reasonConversation: vi.fn(async () => ({
        action: "COMMERCIAL_FOLLOWUP", solutionReadiness: "READY_FOR_COMMERCIAL_HANDOFF", transition: "CONFIRM",
        referencedField: null, toolAction: "NONE", responseFocus: "CONFIRM_HANDOFF", reasonCode: "CEO_ENTITY_FIXTURE_HANDOFF",
        intent: await extractIntent(),
      })),
    };
    const service = new AISalesAssistantService({
      companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
      customers: { findAll }, catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
      units: { findById: vi.fn(), findBySymbol: vi.fn() },
      quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
      pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
      terms: { find: vi.fn().mockResolvedValue("التسليم: 14 يوم\nالضمان: سنة") },
    } as any, provider);

    const draft = await new CompleteCommercialConversation(service).execute({
      companyId: "tenant", locale: "ar", documentMode: "QUOTATION", replySource: "TEXT", reply: CEO_INPUT,
    });

    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant", search: CUSTOMER }));
    expect(findAll.mock.calls.every(([request]) => request.search === CUSTOMER)).toBe(true);
    expect(draft.canonicalProposal?.customer).toMatchObject({ status: "MATCHED", id: "customer-1", mention: CUSTOMER, name: CUSTOMER });
    expect(draft.canonicalProposal?.proposal).toMatchObject({ projectName: "مخزن الشويخ", attentionName: "المهندس محمد خالد" });
    expect(draft.activeQuestion?.field).not.toBe("projectName");
    expect(draft.missingRequired.map((field) => field.key)).not.toContain("projectName");
    expect(draft.canonicalProposal?.smartSystem?.inputs.find((input) => input.name === "storageDays")).toMatchObject({ value: 90, provenance: "USER_PROVIDED" });
    expect(draft.canonicalProposal?.smartSystem?.engineeringRules?.values).toMatchObject({ retentionDays: 90, resolutionMp: 4 });
    expect(draft.canonicalProposal?.lines.find((line) => line.componentKey === "CCTV_CAMERAS")?.quantity).toBe(180);
    expect(draft.canonicalProposal?.lines.find((line) => line.componentKey === "NVR_RECORDER")?.quantity).toBe(3);
    expect(draft.canonicalProposal?.commercialTerms?.paymentTerms).toBe("70% دفعة مقدمة، و30% عند التسليم");
    const expectedExpiry = resolveExpiry("أسبوع", companyToday("Asia/Kuwait"));
    expect(draft.canonicalProposal?.proposal.expiryDate).toBe(expectedExpiry);
    expect(draft.canonicalProposal?.fieldProvenance?.expiryDate).toBe("USER_PROVIDED");
    expect(draft.missingRequired.map((field) => field.key)).not.toEqual(expect.arrayContaining(["customer", "projectName", "attentionName", "expiryDate", "paymentTerms"]));
    expect(draft.executed).toBe(false);
    expect(draft.requiresHumanReview).toBe(true);

    const withoutValidity = CEO_INPUT.replace(/، وصلاحية العرض أسبوع من تاريخ العرض\./, ".");
    const awaitingValidity = await new CompleteCommercialConversation(service).execute({
      companyId: "tenant", locale: "ar", documentMode: "QUOTATION", replySource: "TEXT", reply: withoutValidity,
    });
    expect(awaitingValidity.activeQuestion?.field).toBe("expiryDate");
    const completed = await new CompleteCommercialConversation(service).execute({
      companyId: "tenant", locale: "ar", documentMode: "QUOTATION", replySource: "TEXT", reply: "أسبوع", draft: awaitingValidity,
    });
    expect(completed.missingRequired.map((field) => field.key)).not.toContain("expiryDate");
    expect(completed.canonicalProposal?.proposal).toMatchObject({ projectName: "مخزن الشويخ", attentionName: "المهندس محمد خالد", expiryDate: expectedExpiry });
    expect(completed.canonicalProposal?.customer).toMatchObject({ id: "customer-1", mention: CUSTOMER });
    expect(completed.canonicalProposal?.lines.find((line) => line.componentKey === "CCTV_CAMERAS")?.quantity).toBe(180);
    expect(completed.canonicalProposal?.smartSystem?.inputs.find((input) => input.name === "storageDays")?.value).toBe(90);
    expect(completed.canonicalProposal?.commercialTerms?.paymentTerms).toBe("70% دفعة مقدمة، و30% عند التسليم");
  });
});
