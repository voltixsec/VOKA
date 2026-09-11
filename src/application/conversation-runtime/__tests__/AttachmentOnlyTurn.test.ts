import { describe, expect, it, vi } from "vitest";
import type { NormalizedRequirementPort } from "@/src/application/source-artifacts";
import { ConversationRuntime, resolveTurnIntent, type ConversationBrainPort, type ConversationToolPort, type FlexibleTurnProposal, type ToolObservation } from "../index";

const now = "2026-09-10T09:00:00.000Z";
const proposal = (overrides: Partial<FlexibleTurnProposal> = {}): FlexibleTurnProposal => ({
  responseMode: "ACK", intent: "ATTACHMENT", patches: [], researchRequests: [], recommendations: [], assumptions: [], blockingQuestion: null,
  responseContent: "I analyzed the attached file and approved the quantities.", unresolvedImportantQuestions: [], solutionReadiness: "EXPLORING", transition: "NONE", compactMemory: "", suggestedReplies: [], ...overrides,
});
const ids = () => { let value = 0; return () => `id-${++value}`; };
const attachment = { id: "artifact-1", name: "boq.pdf", type: "application/pdf", size: 1200 };

function toolsReturning(observation: Partial<ToolObservation>) {
  const execute = vi.fn(async ({ request }: Parameters<ConversationToolPort["execute"]>[0]): Promise<ToolObservation> => ({ kind: request.kind, status: "COMPLETED", summary: "read", evidence: [], citations: [], artifactId: request.attachmentId ?? undefined, createdAt: now, ...observation }));
  return { execute, tools: { execute } as ConversationToolPort };
}

describe("attachment-only turn intent", () => {
  it("resolves text, attachment-only and empty turns deterministically", () => {
    expect(resolveTurnIntent({ message: "  Review this BOQ  ", attachment })).toEqual({ kind: "USER_MESSAGE", message: "Review this BOQ" });
    expect(resolveTurnIntent({ message: "", attachment })).toMatchObject({ kind: "ATTACHMENT_ANALYSIS", message: "", attachmentId: "artifact-1", inspection: { kind: "BOQ_INSPECTION", attachmentId: "artifact-1" } });
    expect(resolveTurnIntent({ message: "", attachment: { ...attachment, type: "image/png" } })).toMatchObject({ kind: "ATTACHMENT_ANALYSIS", inspection: { kind: "ATTACHMENT_INSPECTION" } });
    expect(resolveTurnIntent({ message: "", attachment: null })).toEqual({ kind: "INVALID", code: "CONVERSATION_RUNTIME_MESSAGE_INVALID" });
    expect(resolveTurnIntent({ message: "", attachment: { name: "x.pdf", type: "application/pdf", size: 1 } })).toEqual({ kind: "INVALID", code: "CONVERSATION_RUNTIME_MESSAGE_INVALID" });
    expect(resolveTurnIntent({ message: "", attachment, action: "RECONCILE" })).toEqual({ kind: "INVALID", code: "CONVERSATION_RUNTIME_MESSAGE_INVALID" });
    expect(resolveTurnIntent({ message: "x".repeat(4_001), attachment })).toEqual({ kind: "INVALID", code: "CONVERSATION_RUNTIME_MESSAGE_INVALID" });
  });
});

describe("attachment-only conversation turn", () => {
  it("runs the bounded inspection with an explicit internal intent, without synthesizing user prose", async () => {
    const decide = vi.fn(async (_input: Parameters<ConversationBrainPort["decide"]>[0]) => proposal());
    const brain: ConversationBrainPort = { decide };
    const { execute, tools } = toolsReturning({ requirementCandidates: [{ stableKey: "k1", description: "IP camera", quantity: 1, unit: "each", quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW" }], extractedText: "1 IP camera each" });
    const synchronize = vi.fn(async () => undefined);
    const requirements: NormalizedRequirementPort = { synchronize };
    const state = await new ConversationRuntime(brain, tools, () => now, ids(), undefined, undefined, requirements).execute({ state: null, message: "", locale: "en", source: "TEXT", companyId: "tenant-1", userId: "user-1", attachment });
    const user = state.messages.find((message) => message.role === "USER");
    expect(user).toMatchObject({ intent: "ATTACHMENT_ANALYSIS", attachment: { id: "artifact-1", name: "boq.pdf", type: "application/pdf" }, text: "📎 Attachment: boq.pdf" });
    expect(decide.mock.calls[0]?.[0]).toMatchObject({ currentMessage: "", turnIntent: "ATTACHMENT_ANALYSIS", attachmentAvailable: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ request: { kind: "BOQ_INSPECTION", attachmentId: "artifact-1" }, companyId: "tenant-1", conversationRuntimeId: state.runtimeId });
    expect(execute.mock.calls[0]?.[0].request.query).toMatch(/Attachment-only turn/);
    expect(state.toolResults).toHaveLength(1);
    const reply = state.messages.at(-1)?.text ?? "";
    expect(reply).toContain("1 reviewable BOQ candidate");
    expect(reply).not.toContain("approved the quantities");
    expect(reply).not.toContain("I analyzed");
    expect(state.confirmedFacts).toEqual({});
    // Requirement synchronization is always runtime-scoped; with no governed system it persists nothing.
    expect(synchronize).toHaveBeenCalledWith(expect.objectContaining({ companyId: "tenant-1", conversationRuntimeId: state.runtimeId, facts: {} }));
  });

  it("stays honest when the attachment has no extractable text or is an image", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal() };
    const scanned = await new ConversationRuntime(brain, toolsReturning({ status: "TEXT_NOT_EXTRACTABLE" }).tools, () => now, ids()).execute({ state: null, message: "", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { ...attachment, name: "scan.pdf" } });
    expect(scanned.messages.at(-1)?.text).toContain("no machine-extractable text");
    expect(scanned.messages.at(-1)?.text).not.toMatch(/analy[sz]ed/u);
    const image = await new ConversationRuntime(brain, toolsReturning({ status: "STORED_PENDING_VISION" }).tools, () => now, ids()).execute({ state: null, message: "", locale: "ar", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-2", name: "site.png", type: "image/png", size: 10 } });
    expect(image.messages.at(-1)?.text).toContain("لم يتم تشغيل أي معالجة بصرية");
  });

  it("keeps text-plus-attachment behavior: the user message is preserved and the brain chooses the tool", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal({ responseContent: "Received the file.", researchRequests: [{ kind: "ATTACHMENT_INSPECTION", query: "read", attachmentId: null }] }) };
    const { execute, tools } = toolsReturning({});
    const state = await new ConversationRuntime(brain, tools, () => now, ids()).execute({ state: null, message: "Here is the BOQ for the elevator project", locale: "en", source: "TEXT", companyId: "tenant-1", attachment });
    expect(state.messages[0]).toMatchObject({ role: "USER", text: "Here is the BOQ for the elevator project", attachment: { id: "artifact-1" } });
    expect(state.messages[0]?.intent).toBeUndefined();
    expect(execute.mock.calls[0]?.[0].request).toMatchObject({ kind: "ATTACHMENT_INSPECTION", attachmentId: "artifact-1" });
  });

  it("still rejects an empty turn without a server-issued attachment", async () => {
    const runtime = new ConversationRuntime({ decide: async () => proposal() }, toolsReturning({}).tools, () => now, ids());
    await expect(runtime.execute({ state: null, message: "   ", locale: "en", source: "TEXT", companyId: "tenant-1" })).rejects.toThrow("CONVERSATION_RUNTIME_MESSAGE_INVALID");
    await expect(runtime.execute({ state: null, message: "", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { name: "boq.pdf", type: "application/pdf", size: 1 } })).rejects.toThrow("CONVERSATION_RUNTIME_MESSAGE_INVALID");
  });
});
