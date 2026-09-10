import { describe, expect, it } from "vitest";
import { ConversationRuntime, type ConversationBrainDecision, type ConversationBrainPort, type ConversationToolPort } from "../index";

const tools: ConversationToolPort = { execute: async ({ request }) => ({ kind: request.kind, status: "UNAVAILABLE", summary: "not used", evidence: [], createdAt: "2026-09-10T00:00:00.000Z" }) };
const decision = (reply: string): ConversationBrainDecision => ({ reply, factProposals: [], unresolvedImportantQuestions: [], toolRequest: null, solutionReadiness: "EXPLORING", transition: "NONE", compactMemory: "", suggestedReplies: [] });

function runtime(brain: ConversationBrainPort) {
  return new ConversationRuntime(brain, tools, () => "2026-09-10T00:00:00.000Z", (() => { let i = 0; return () => `vehicle-${++i}`; })());
}

describe("vehicle elevator governed authority", () => {
  it("normalizes Arabic quantity and floors, keeps them in the workspace, and does not invent a BOM", async () => {
    const brain: ConversationBrainPort = { decide: async () => decision("ثبتُّ النظام والبيانات التي ذكرتها، والمكونات الهندسية تحتاج مراجعة.") };
    const first = await runtime(brain).execute({ state: null, message: "أريد نظام مصعد سيارات واحد لستة طوابق", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    expect(first.confirmedFacts).toMatchObject({ "system.identity": { value: "مصعد سيارات" }, "system.quantity": { value: 1 }, "system.numberOfStops": { value: 6 } });
    expect(first.workspace?.requirements).toMatchObject({ "system.quantity": 1, "system.numberOfStops": 6 });
    expect(first.workspace?.engineering.system?.key).toBe("VEHICLE_ELEVATOR");
    expect(first.workspace?.engineering.bom).toEqual([]);
    expect(first.workspace?.readiness.pendingBeforeFinalIssue).toContain("Engineering components");
    const corrected = await runtime(brain).execute({ state: first, message: "غيّر العدد إلى 2 والوقفات إلى 7", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    expect(corrected.confirmedFacts["system.quantity"]?.value).toBe(2);
    expect(corrected.confirmedFacts["system.numberOfStops"]?.value).toBe(7);
    expect(corrected.workspace?.requirements).toMatchObject({ "system.quantity": 2, "system.numberOfStops": 7 });
  });

  it("does not allow an AI sentence to outrun inspected evidence", async () => {
    const brain: ConversationBrainPort = { decide: async () => decision("I analyzed the attached PDF and the quantity is approved.") };
    const state = await runtime(brain).execute({ state: null, message: "Review this file", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-not-inspected", name: "boq.pdf", type: "application/pdf", size: 10 } });
    expect(state.messages.at(-1)?.text).toContain("was not inspected successfully");
    expect(state.messages.at(-1)?.text).not.toContain("I analyzed");
  });

  it("survives a reconcile turn without reverting to a legacy provisional state", async () => {
    const brain: ConversationBrainPort = { decide: async () => decision("الحالة المحكومة ما زالت محفوظة.") };
    const instance = runtime(brain);
    const first = await instance.execute({ state: null, message: "أريد نظام مصعد سيارات واحد لستة طوابق", locale: "ar", source: "TEXT", companyId: "tenant-1" });
    const reconciled = await instance.execute({ state: first, message: "Reconcile the workspace", locale: "ar", source: "CHIP", companyId: "tenant-1", action: "RECONCILE" });
    expect(reconciled.confirmedFacts["system.quantity"]?.value).toBe(1);
    expect(reconciled.confirmedFacts["system.numberOfStops"]?.value).toBe(6);
    expect(reconciled.workspace?.requirements["system.numberOfStops"]).toBe(6);
  });
});
