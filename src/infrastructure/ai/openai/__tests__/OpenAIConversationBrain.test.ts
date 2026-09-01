import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySystemConfigurationGraph, synchronizeWorkspace, type FlexibleTurnProposal } from "@/src/application/conversation-runtime";
import { OpenAIConversationBrain } from "../OpenAIConversationBrain";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAIConversationBrain research contract", () => {
  it("sends live Arabic wording through the staged catalog-then-web proposal contract", async () => {
    const decision: FlexibleTurnProposal = {
      responseMode: "ACK", intent: "PRODUCT_RESEARCH", patches: [],
      researchRequests: [{ kind: "CATALOG_LOOKUP", query: "أفضل 3 اختيارات للكويت", attachmentId: null }],
      recommendations: [], assumptions: [], blockingQuestion: null, responseContent: "سأراجع الخيارات المتاحة.",
      unresolvedImportantQuestions: [], solutionReadiness: "MATURE", transition: "NONE", compactMemory: "", suggestedReplies: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(decision) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const graph = emptySystemConfigurationGraph();
    const result = await new OpenAIConversationBrain("test-key", "configured-model").decide({
      locale: "ar", currentMessage: "شوفلي أفضل 3 اختيارات حقيقية مناسبة للكويت", recentMessages: [], confirmedFacts: {},
      workspace: synchronizeWorkspace(undefined, {}, graph, "2026-09-01T00:00:00.000Z"), compactMemory: "", toolResults: [],
      attachmentAvailable: false, attachment: null, availableTools: ["CATALOG_LOOKUP", "RESEARCH"],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(result.researchRequests[0]?.kind).toBe("CATALOG_LOOKUP");
    expect(JSON.parse(body.input).currentMessage).toBe("شوفلي أفضل 3 اختيارات حقيقية مناسبة للكويت");
    expect(body.instructions).toContain("first request CATALOG_LOOKUP");
    expect(body.instructions).toContain("request RESEARCH exactly once");
    expect(body.instructions).not.toContain("automatically continues to web research");
  });
});
