import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../../ai-sales-assistant/services/AISalesAssistantService";
import type { ProvisionalSystemModel } from "../../agentic-commercial-intelligence";
import { CompleteCommercialConversation } from "../CompleteCommercialConversation";

const initialRequest = "عايز أعمل عرض سعر لتوريد وتركيب نظام مصعد سيارات إلكتروني داخل دولة الكويت.";
const followUp = "مصعد سيارات واحد يخدم 6 طوابق.";

function vehicleElevatorModel(): ProvisionalSystemModel {
  return {
    systemName: "Vehicle Elevator", aliases: ["Car lift"], purpose: "Vehicle movement between floors",
    componentCategories: ["Drive", "Platform", "Controller", "Doors", "Safety"],
    inputs: [
      { name: "elevatorQuantity", labelAr: "عدد المصاعد", labelEn: "Elevator quantity", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
      { name: "numberOfStops", labelAr: "عدد الوقفات", labelEn: "Number of stops", value: null, required: true, provenance: "NEEDS_CONFIRMATION" },
      { name: "capacity", labelAr: "الحمولة", labelEn: "Capacity", value: null, unit: "kg", required: true, provenance: "NEEDS_CONFIRMATION" },
    ],
    limitations: ["Engineering verification required."], confidence: .75, jurisdiction: "Kuwait",
    evidence: [{ title: "Technical guide", url: "https://manufacturer.example/vehicle-lift", publisher: "manufacturer.example", provenance: "RESEARCHED" }],
    provenance: "RESEARCHED", requiresEngineeringVerification: true,
  };
}

function fixture() {
  const research = { researchSystem: vi.fn().mockResolvedValue(vehicleElevatorModel()) };
  const provider = { extractIntent: vi.fn().mockResolvedValue({ documentType: "QUOTATION", scopeType: "SUPPLY_AND_INSTALLATION", customerMention: null, lines: [{ text: "مصعد سيارات", quantity: 1, typeIntent: "PRODUCT" }] }) };
  const service = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
    customers: { findAll: vi.fn().mockResolvedValue([]) }, catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
    units: { findById: vi.fn(), findBySymbol: vi.fn() }, quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() }, terms: { find: vi.fn().mockResolvedValue(null) },
  } as any, provider, research);
  const conversation = new CompleteCommercialConversation(service);
  return { research, run: (reply: string, draft?: Awaited<ReturnType<typeof conversation.execute>>, source: "TEXT" | "VOICE" = "TEXT") => conversation.execute({ companyId: "tenant-a", reply, draft, replySource: source, locale: "ar", documentMode: "QUOTATION" }) };
}

describe("agent conversation continuity lock", () => {
  it.each(["TEXT", "VOICE"] as const)("patches quantity and stops from one %s follow-up without restarting the provisional system", async (source) => {
    const { research, run } = fixture();
    const first = await run(initialRequest);
    expect(first.canonicalProposal?.agenticState).toMatchObject({ route: "PROVISIONAL_RESEARCH", systemName: "Vehicle Elevator", researchStatus: "COMPLETED", missingInputs: ["elevatorQuantity", "numberOfStops", "capacity"] });
    expect(first.activeQuestion).toMatchObject({ field: "elevatorQuantity", ar: "كم عدد المصاعد المطلوبة؟" });

    const next = await run(followUp, first, source);
    expect(next.systemAnswers).toMatchObject({ elevatorQuantity: 1, numberOfStops: 6 });
    expect(next.canonicalProposal?.agenticState).toMatchObject({ systemName: "Vehicle Elevator", researchStatus: "COMPLETED", missingInputs: ["capacity"] });
    expect(next.canonicalProposal?.agenticState?.provisionalSystem).toMatchObject({ jurisdiction: "Kuwait", provenance: "RESEARCHED", evidence: first.canonicalProposal?.agenticState?.provisionalSystem?.evidence });
    expect(next.activeQuestion).toMatchObject({ field: "capacity", ar: "ما الحمولة المطلوبة للمصعد؟" });
    expect(next.activeQuestion?.ar).not.toMatch(/بيانات التكوين الأساسية|يرجى تحديد/);
    expect(next.clarification?.ar).not.toMatch(/ما المنتج أو الخدمة/);
    expect(next.turns.at(-1)?.target).toBe("elevatorQuantity,numberOfStops");
    expect(next.transactionalState?.ledger.facts).toMatchObject({
      "system.elevatorQuantity": { value: 1, source: "USER_EXPLICIT" },
      "system.numberOfStops": { value: 6, source: "USER_EXPLICIT" },
    });
    expect(research.researchSystem).toHaveBeenCalledTimes(1);
  });

  it("does not let a completed provisional model fall into the generic product question", async () => {
    const { run } = fixture();
    let draft = await run(initialRequest);
    draft = await run(followUp, draft);
    draft = await run("2000", draft);
    expect(draft.canonicalProposal?.agenticState?.missingInputs).toEqual([]);
    expect(draft.missingRequired.some((field) => field.key === "lines")).toBe(false);
    expect(draft.activeQuestion?.ar ?? "").not.toMatch(/ما المنتج أو الخدمة/);
    expect(draft.activeQuestion).toBeNull();
    // Commercial collection starts only after the orchestrator has proposed the
    // transition and the user confirms it; the field-completion engine no longer
    // turns a mature solution into an implicit form by itself.
    draft = await run("جهز العرض", {
      ...draft,
      conversationPhase: "TRANSITION_PROPOSED",
      solutionReadiness: "AWAITING_USER_TRANSITION",
    });
    expect(draft.conversationPhase).toBe("COMMERCIAL_HANDOFF");
    expect(draft.activeQuestion?.field).toBe("customerMention");
    draft = await run("شركة الأفق", draft);
    draft = await run("مشروع الشويخ", draft);
    draft = await run("المهندس أحمد", draft);
    draft = await run("أسبوع", draft);
    draft = await run("50% مقدم و50% بعد التوريد", draft);
    draft = await run("أسبوعين", draft);
    draft = await run("سنة", draft);
    expect(draft).toMatchObject({ readinessStage: "SYSTEM_PLANNED", status: "READY_FOR_REVIEW", phase: "DRAFT_READY_FOR_REVIEW", activeQuestion: null, missingRequired: [] });
    expect(draft.systemWorkingPlan).toMatchObject({ systemIdentity: "Vehicle Elevator", commercializationStatus: "PENDING", engineeringVerificationRequired: true });
    expect(draft.clarification).toBeNull();
  });

  it("starts a deliberate new request with fresh state", async () => {
    const { research, run } = fixture();
    const first = await run(initialRequest);
    const patched = await run(followUp, first);
    const fresh = await run(initialRequest);
    expect(fresh.id).not.toBe(patched.id);
    expect(fresh.systemAnswers).toEqual({});
    expect(fresh.canonicalProposal?.agenticState?.missingInputs).toEqual(["elevatorQuantity", "numberOfStops", "capacity"]);
    expect(research.researchSystem).toHaveBeenCalledTimes(2);
  });
});
