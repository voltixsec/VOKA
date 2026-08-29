import { describe, expect, it } from "vitest";
import { parsePaymentSchedule, renderPaymentSchedule } from "../../ai-sales-assistant/services/payment-terms";
import { commitTurnDecision, projectFactLedger, type CanonicalFactLedger, type TurnDecision } from "../transactional-state";
import { CEO_GOLDEN_SCENARIOS } from "./ceo-golden-scenarios";
import { cleanAttentionName, cleanProjectName } from "../../ai-sales-assistant/services/attention-name";

function decision(overrides: Partial<TurnDecision> = {}): TurnDecision {
  return { requestId: "request-a", turn: 1, turnId: "request-a:1", patches: [], researchRequests: [], unresolvedFacts: [], nextQuestion: null, readinessProposal: "CONVERSATION_UNDERSTOOD", ...overrides };
}

describe("CEO golden transactional commercial invariants", () => {
  it("keeps the permanent CEO scenario dataset complete", () => {
    expect(CEO_GOLDEN_SCENARIOS).toHaveLength(13);
    expect(new Set(CEO_GOLDEN_SCENARIOS.map((scenario) => scenario.id)).size).toBe(13);
  });

  it("stores clean project and attention values without conversational wrappers", () => {
    expect(cleanAttentionName("أنا المهندس أحمد رفعت")).toBe("المهندس أحمد رفعت");
    expect(cleanAttentionName("بعناية المهندس أحمد رفعت")).toBe("المهندس أحمد رفعت");
    expect(cleanProjectName("لمشروع مخزن الشويخ")).toBe("مخزن الشويخ");
  });

  it.each([
    ["50% مقدم و50% بعد التوريد", [50, 50], ["ADVANCE", "AFTER_SUPPLY"]],
    ["40% advance and 60% after supply", [40, 60], ["ADVANCE", "AFTER_SUPPLY"]],
    ["مية في المية مقدم", [100], ["ADVANCE"]],
    ["خمسين في المية مقدم وخمسين في المية بعد التوريد", [50, 50], ["ADVANCE", "AFTER_SUPPLY"]],
  ])("parses structured payment without relying on rendered prose: %s", (text, percentages, timings) => {
    const schedule = parsePaymentSchedule(text);
    expect(schedule).toMatchObject({ complete: true, totalPercentage: 100 });
    expect(schedule?.milestones.map((item) => item.percentage)).toEqual(percentages);
    expect(schedule?.milestones.map((item) => item.timing)).toEqual(timings);
  });

  it("rejects incomplete explicit payment instead of inventing a remainder", () => {
    expect(parsePaymentSchedule("50% مقدم")).toMatchObject({ complete: false, totalPercentage: 50 });
  });

  it("prevents lower-authority output from overwriting an explicit user fact", () => {
    const first = commitTurnDecision(null, decision({ patches: [{ field: "paymentSchedule", operation: "SET", value: parsePaymentSchedule("50% مقدم و50% بعد التوريد"), provenance: "USER_EXPLICIT" }] }), new Set(["paymentSchedule"]), "2026-08-29T00:00:00.000Z");
    const lower = commitTurnDecision(first.ledger, decision({ turn: 2, turnId: "request-a:2", patches: [{ field: "paymentSchedule", operation: "REPLACE", value: parsePaymentSchedule("100% مقدم"), provenance: "DEFAULT" }] }), new Set(["paymentSchedule"]), "2026-08-29T00:01:00.000Z");
    expect(lower.rejected).toEqual([{ field: "paymentSchedule", accepted: false, reason: "LOWER_AUTHORITY" }]);
    expect((lower.ledger.facts.paymentSchedule.value as any).milestones.map((item: any) => item.percentage)).toEqual([50, 50]);
  });

  it("allows an explicit user correction to replace the previous schedule", () => {
    const ledger: CanonicalFactLedger = { requestId: "request-a", committedTurn: 1, facts: { paymentSchedule: { value: parsePaymentSchedule("50% مقدم و50% بعد التوريد"), source: "USER_EXPLICIT", turnId: "request-a:1", confidence: 1, timestamp: "2026-08-29T00:00:00.000Z" } } };
    const corrected = commitTurnDecision(ledger, decision({ turn: 2, turnId: "request-a:2", patches: [{ field: "paymentSchedule", operation: "REPLACE", value: parsePaymentSchedule("40% مقدم و60% بعد التوريد"), provenance: "USER_CORRECTION" }] }), new Set(["paymentSchedule"]));
    expect((corrected.ledger.facts.paymentSchedule.value as any).milestones.map((item: any) => item.percentage)).toEqual([40, 60]);
  });

  it("rejects stale, cross-request, and unrelated agent mutations with diagnostics", () => {
    const ledger: CanonicalFactLedger = { requestId: "request-a", committedTurn: 1, facts: {} };
    expect(commitTurnDecision(ledger, decision({ turn: 1, patches: [{ field: "projectName", operation: "SET", value: "X", provenance: "AI_INFERRED" }] }), new Set(["projectName"])).rejected[0].reason).toBe("STALE_TURN");
    expect(commitTurnDecision(ledger, decision({ requestId: "request-b", turn: 2, patches: [{ field: "projectName", operation: "SET", value: "X", provenance: "AI_INFERRED" }] }), new Set(["projectName"])).rejected[0].reason).toBe("CROSS_REQUEST");
    expect(commitTurnDecision(ledger, decision({ turn: 2, patches: [{ field: "approvalStatus", operation: "SET", value: "APPROVED", provenance: "AI_INFERRED" }] }), new Set(["approvalStatus"])).rejected[0].reason).toBe("FIELD_NOT_OWNED");
  });

  it("renders Terms from committed payment without allowing Terms to write back", () => {
    const schedule = parsePaymentSchedule("50% مقدم و50% بعد التوريد")!;
    const ledger: CanonicalFactLedger = { requestId: "request-a", committedTurn: 1, facts: { paymentSchedule: { value: schedule, source: "USER_EXPLICIT", turnId: "request-a:1", confidence: 1, timestamp: "2026-08-29T00:00:00.000Z" } } };
    const proposal: any = { paymentSchedule: null, commercialTerms: { paymentTerms: "100%", delivery: null, warranty: null }, customer: { mention: null }, proposal: {}, termsAndConditions: "Payment: 100%\nWarranty: one year", termsAndConditionsAr: null, termsAndConditionsEn: "Payment: 100%\nWarranty: one year" };
    const projected = projectFactLedger(proposal, ledger, "en", renderPaymentSchedule);
    expect(projected.commercialTerms!.paymentTerms).toBe("50% advance, 50% after supply");
    expect(projected.termsAndConditions).toBe("Payment: 50% advance, 50% after supply\nWarranty: one year");
    expect((ledger.facts.paymentSchedule.value as any).milestones.map((item: any) => item.percentage)).toEqual([50, 50]);
  });
});
