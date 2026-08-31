import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationRuntimeState } from "@/src/application/conversation-runtime";
import { signConversationState, verifyConversationState } from "../ConversationStateToken";

const state: ConversationRuntimeState = { runtimeId: "runtime-1", version: 1, locale: "en", messages: [], confirmedFacts: {}, candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING", transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null, handoffToken: null, stateToken: null };
const previous = process.env.JWT_ACCESS_SECRET;
beforeEach(() => { process.env.JWT_ACCESS_SECRET = "test-conversation-state-secret-at-least-32-chars"; });
afterEach(() => { if (previous === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = previous; });

describe("ConversationStateToken", () => {
  it("round-trips the complete governed snapshot only for its tenant", async () => {
    const token = await signConversationState(state, "tenant-1");
    await expect(verifyConversationState(token, "tenant-1")).resolves.toMatchObject({ runtimeId: "runtime-1", stateToken: null });
    await expect(verifyConversationState(token, "tenant-2")).rejects.toThrow("CONVERSATION_STATE_INVALID");
  });
});
