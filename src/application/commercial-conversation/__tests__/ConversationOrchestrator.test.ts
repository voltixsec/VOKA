import { describe, expect, it, vi } from "vitest";
import { AISalesAssistantService } from "../../ai-sales-assistant/services/AISalesAssistantService";
import { CompleteCommercialConversation } from "../CompleteCommercialConversation";
import type { WorkingCommercialDraft } from "../types";

type RawDecision = Record<string, unknown>;

function setup(decide: (turn: string) => RawDecision, options: { terms?: string | null } = {}) {
  const calls: Array<{ aiProviderCallCount: number; researchInvoked: boolean }> = [];
  const reasonConversation = vi.fn(async ({ currentTurn }: { currentTurn: string }) => decide(currentTurn));
  const extractIntent = vi.fn();
  const service = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: "KWD", timezone: "Asia/Kuwait" }) },
    customers: { findAll: vi.fn().mockResolvedValue([{ id: "customer-1", name: "الوطنية", code: "NAT", status: "ACTIVE" }]) },
    catalogItems: { findAll: vi.fn().mockResolvedValue([]) },
    units: { findById: vi.fn(), findBySymbol: vi.fn() },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
    terms: { find: vi.fn().mockResolvedValue(options.terms ?? "صلاحية العرض: 30 يوم\nشروط الدفع: 50% مقدم والباقي عند التسليم\nالتسليم: 14 يوم\nالضمان: سنة") },
  } as any, { reasonConversation, extractIntent });
  const conversation = new CompleteCommercialConversation(service, { onTiming: (timing) => calls.push(timing) });
  const run = (reply: string, draft?: WorkingCommercialDraft, extra: Record<string, unknown> = {}) => conversation.execute({
    companyId: "tenant", reply, draft, replySource: "TEXT", locale: "ar", documentMode: "QUOTATION", ...extra,
  });
  return { run, reasonConversation, extractIntent, calls };
}

const intent = (customerMention: string | null = "الوطنية") => ({
  documentType: "QUOTATION",
  customerMention,
  scopeType: "SUPPLY_AND_INSTALLATION",
  lines: [],
});

const decision = (overrides: RawDecision = {}) => ({
  action: "CONTINUE_EXPLORATION",
  solutionReadiness: "NOT_READY",
  transition: "NONE",
  referencedField: null,
  toolAction: "NONE",
  responseFocus: "CONTINUE",
  reasonCode: "TEST",
  intent: intent(),
  ...overrides,
});

describe("conversation orchestrator authority", () => {
  it("keeps a safe explanation in control instead of asking the first missing deterministic field", async () => {
    const { run, calls, extractIntent } = setup(() => decision({
      action: "EXPLAIN", responseFocus: "EXPLAIN_LIMITATION", intent: intent(null),
    }));
    const draft = await run("عايز نظام تحكم في الدخول واشرحلي الخيارات الأول");
    expect(draft.completionDiagnostics?.missingEngineering.length).toBeGreaterThan(0);
    expect(draft.orchestratorDecision?.action).toBe("EXPLAIN");
    expect(draft.activeQuestion).toBeNull();
    expect(draft.assistantResponse?.ar).toMatch(/فاهم|المؤكدة|أفترض/);
    expect(calls.at(-1)).toMatchObject({ aiProviderCallCount: 1, researchInvoked: false });
    expect(extractIntent).not.toHaveBeenCalled();
  });

  it("proposes a commercial transition when the solution is mature without silently handing off", async () => {
    const { run } = setup(() => decision({
      action: "PROPOSE_COMMERCIAL_HANDOFF", solutionReadiness: "READY_TO_PROPOSE",
      transition: "PROPOSE", responseFocus: "OFFER_HANDOFF",
    }));
    const draft = await run("اعمل عرض سعر توريد وتركيب 130 كاميرا مراقبة للوطنية", undefined, {
      attachment: { name: "scope.pdf", type: "application/pdf", size: 100 },
    });
    expect(draft).toMatchObject({ conversationPhase: "TRANSITION_PROPOSED", solutionReadiness: "AWAITING_USER_TRANSITION", commercialHandoff: null, activeQuestion: null });
    expect(draft.assistantResponse?.ar).toMatch(/الانتقال|العرض التجاري|تجهيز العرض/);
    expect(draft.transactionalState?.ledger.facts["system.identity"]?.value).toBeTruthy();
  });

  it("returns to exploration when the user adds a requirement after readiness", async () => {
    const { run } = setup((turn) => turn.startsWith("استنى")
      ? decision({ mode: "CORRECTION", transition: "REOPEN", intent: intent() })
      : decision({ action: "PROPOSE_COMMERCIAL_HANDOFF", solutionReadiness: "READY_TO_PROPOSE", transition: "PROPOSE", responseFocus: "OFFER_HANDOFF" }));
    const proposed = await run("اعمل عرض سعر توريد وتركيب 130 كاميرا مراقبة للوطنية", undefined, {
      attachment: { name: "scope.pdf", type: "application/pdf", size: 100 },
    });
    const reopened = await run("استنى، عايز أخليهم 140 كاميرا بدل 130", proposed);
    expect(reopened).toMatchObject({ conversationPhase: "SOLUTION_EXPLORATION", solutionReadiness: "NOT_READY", commercialHandoff: null });
    expect(reopened.answers?.cameraCount).toBe("140");
  });

  it("creates a structured handoff only after confirmation, then evaluates commercial requirements", async () => {
    const { run } = setup((turn) => /تمام\s+كمل/.test(turn)
      ? decision({ action: "COMMERCIAL_FOLLOWUP", solutionReadiness: "READY_FOR_COMMERCIAL_HANDOFF", transition: "CONFIRM", responseFocus: "CONFIRM_HANDOFF", intent: intent() })
      : decision({ action: "PROPOSE_COMMERCIAL_HANDOFF", solutionReadiness: "READY_TO_PROPOSE", transition: "PROPOSE", responseFocus: "OFFER_HANDOFF" }));
    const proposed = await run("اعمل عرض سعر توريد وتركيب 130 كاميرا مراقبة للوطنية", undefined, {
      attachment: { name: "scope.pdf", type: "application/pdf", size: 100 },
    });
    const handedOff = await run("تمام كمل", proposed);
    expect(handedOff.conversationPhase).toBe("COMMERCIAL_HANDOFF");
    expect(handedOff.commercialHandoff).toMatchObject({ scopeType: "SUPPLY_AND_INSTALLATION", unresolvedEngineeringFields: [] });
    expect(handedOff.commercialHandoff?.systemIdentity).toBeTruthy();
    expect(handedOff.activeQuestion?.field).toBe("projectName");
    expect(handedOff.completionDiagnostics?.missingCommercial).not.toEqual(expect.arrayContaining(["paymentTerms", "delivery", "warranty", "expiryDate"]));
  });

  it("does not let an explicit quotation command bypass a genuine engineering blocker", async () => {
    const { run } = setup(() => decision({
      action: "COMMERCIAL_FOLLOWUP", solutionReadiness: "READY_FOR_COMMERCIAL_HANDOFF",
      transition: "CONFIRM", responseFocus: "CONFIRM_HANDOFF", intent: intent(null),
    }));
    const draft = await run("اعمللي العرض لنظام تحكم في الدخول");
    expect(draft.conversationPhase).toBe("SOLUTION_EXPLORATION");
    expect(draft.commercialHandoff).toBeNull();
    expect(draft.orchestratorDecision).toMatchObject({ action: "ASK_ENGINEERING", reasonCode: "ENGINEERING_BLOCKER" });
    expect(draft.activeQuestion?.field).toBe("doorCount");
  });

  it("exposes an attachment tool decision without field completion hijacking the turn", async () => {
    const { run } = setup(() => decision({
      action: "REQUEST_DRAWING", referencedField: "attachment", toolAction: "REQUEST_DRAWING",
      responseFocus: "REQUEST_ATTACHMENT", intent: intent(null),
    }));
    const draft = await run("عندي مخطط لنظام تحكم في الدخول");
    expect(draft.pendingToolAction).toBe("REQUEST_DRAWING");
    expect(draft.activeQuestion).toMatchObject({ field: "attachment", allowDefer: false });
    expect(draft.assistantResponse?.ar).toMatch(/ارفع المخطط/);
  });
});
