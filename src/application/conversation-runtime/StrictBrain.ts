import {
  applyWorkspaceDefaults,
  applyWorkspacePatches,
  projectWorkspaceGraph,
  renderGovernedResponse,
  synchronizeWorkspace,
} from "./governed-workspace";
import type {
  ConfirmedFact,
  ConversationBrainDecision,
  ConversationLocale,
  FlexibleTurnProposal,
  GovernedWorkspaceState,
  SystemConfigurationGraph,
} from "./types";

export type NormalizedFlexibleTurnProposal = FlexibleTurnProposal & { legacyFactProposals: import("./types").BrainFactProposal[] };

/** Deterministic authority: validates proposals, owns workspace state, and renders user-visible output. */
export class StrictBrain {
  normalizeProposal(decision: ConversationBrainDecision): NormalizedFlexibleTurnProposal {
    if ("responseMode" in decision) {
      const requiredArrays = [decision.patches, decision.researchRequests, decision.recommendations, decision.assumptions, decision.unresolvedImportantQuestions, decision.suggestedReplies];
      if (!decision.responseMode || typeof decision.intent !== "string" || requiredArrays.some((value) => !Array.isArray(value)) || typeof decision.responseContent !== "string" || !["EXPLORING", "MATURE", "AWAITING_USER_CONFIRMATION", "READY_FOR_HANDOFF"].includes(decision.solutionReadiness) || !["NONE", "PROPOSE", "CONFIRM", "REOPEN"].includes(decision.transition) || typeof decision.compactMemory !== "string") {
        throw new Error("FLEXIBLE_TURN_PROPOSAL_INVALID");
      }
      return { ...decision, legacyFactProposals: [] };
    }
    return {
      responseMode: decision.reply.includes("?") || decision.reply.includes("\u061f") ? "QUESTION" : "RESULT",
      intent: "LEGACY_COMPATIBILITY",
      patches: [],
      researchRequests: decision.toolRequest ? [decision.toolRequest] : [],
      recommendations: [],
      assumptions: [],
      blockingQuestion: null,
      responseContent: decision.reply,
      unresolvedImportantQuestions: decision.unresolvedImportantQuestions,
      solutionReadiness: decision.solutionReadiness,
      transition: decision.transition,
      compactMemory: decision.compactMemory,
      suggestedReplies: decision.suggestedReplies,
      legacyFactProposals: decision.factProposals,
    };
  }

  synchronize(prior: GovernedWorkspaceState | undefined, facts: Record<string, ConfirmedFact>, graph: SystemConfigurationGraph, now: string) {
    return synchronizeWorkspace(prior, facts, graph, now);
  }

  applyProposal(workspace: GovernedWorkspaceState, proposal: FlexibleTurnProposal, userMessage: string, now: string) {
    return applyWorkspacePatches(workspace, proposal.patches, userMessage, now);
  }

  applyDefaults(workspace: GovernedWorkspaceState, defaults: { currencyCode: string; termsAr: string | null; termsEn: string | null }, scope: string | null) {
    return applyWorkspaceDefaults(workspace, defaults, scope);
  }

  project(workspace: GovernedWorkspaceState, base: SystemConfigurationGraph) {
    return projectWorkspaceGraph(workspace, base);
  }

  render(proposal: FlexibleTurnProposal, locale: ConversationLocale) {
    return renderGovernedResponse(proposal, locale);
  }
}
