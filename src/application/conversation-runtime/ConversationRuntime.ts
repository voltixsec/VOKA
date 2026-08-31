import type { ConversationBrainPort, ConversationToolPort } from "./ports";
import { reduceFactProposals } from "./fact-reducer";
import type { CommercialSolutionHandoff, ConversationRuntimeState, ConversationTurnInput, RuntimeMessage } from "./types";

const MAX_MESSAGES = 30;
const MAX_TOOL_ITERATIONS = 1;

export class ConversationRuntime {
  constructor(private readonly brain: ConversationBrainPort, private readonly tools: ConversationToolPort, private readonly now = () => new Date().toISOString(), private readonly id = () => crypto.randomUUID()) {}

  async execute(input: ConversationTurnInput): Promise<ConversationRuntimeState> {
    const message = input.message.trim();
    if (!message || message.length > 4_000) throw new Error("CONVERSATION_RUNTIME_MESSAGE_INVALID");
    const base = this.normalizeState(input.state, input.locale);
    const userMessage: RuntimeMessage = { id: this.id(), role: "USER", text: message, source: input.source, createdAt: this.now() };
    const recentMessages = [...base.messages, userMessage].slice(-MAX_MESSAGES);
    const attachment = input.attachment ? { id: input.attachment.id ?? null, name: input.attachment.name, type: input.attachment.type } : null;
    let decision = await this.brain.decide({ locale: input.locale, currentMessage: message, recentMessages, confirmedFacts: base.confirmedFacts, compactMemory: base.compactMemory, toolResults: [], attachmentAvailable: Boolean(input.attachment), attachment, availableTools: ["ENGINEERING_KNOWLEDGE", "RESEARCH", "CATALOG_LOOKUP", "PRICING_LOOKUP", "CUSTOMER_LOOKUP", "ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"] });
    const observations = [...base.toolResults];
    if (decision.toolRequest && MAX_TOOL_ITERATIONS > 0) {
      const observation = await this.tools.execute({ request: decision.toolRequest, companyId: input.companyId, locale: input.locale });
      observations.push(observation);
      decision = await this.brain.decide({ locale: input.locale, currentMessage: message, recentMessages, confirmedFacts: base.confirmedFacts, compactMemory: base.compactMemory, toolResults: [observation], attachmentAvailable: Boolean(input.attachment), attachment, availableTools: ["ENGINEERING_KNOWLEDGE", "RESEARCH", "CATALOG_LOOKUP", "PRICING_LOOKUP", "CUSTOMER_LOOKUP", "ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"] });
    }
    if (!decision.reply.trim()) throw new Error("CONVERSATION_RUNTIME_EMPTY_REPLY");
    const reduced = reduceFactProposals(base.confirmedFacts, decision.factProposals, message, this.now());
    const canHandoff = base.transitionState === "PROPOSED" && decision.solutionReadiness === "READY_FOR_HANDOFF" && Boolean(reduced.confirmed["system.identity"]);
    const transitionState = decision.transition === "CONFIRM" && canHandoff
      ? "COMMERCIAL_HANDOFF"
      : decision.transition === "PROPOSE" ? "PROPOSED" : decision.transition === "REOPEN" ? "EXPLORING" : base.transitionState;
    const handoff: CommercialSolutionHandoff | null = transitionState === "COMMERCIAL_HANDOFF" ? { runtimeId: base.runtimeId, confirmedFacts: reduced.confirmed, commercialLines: [], toolEvidence: observations, createdAt: this.now() } : null;
    const assistantMessage: RuntimeMessage = { id: this.id(), role: "ASSISTANT", text: decision.reply.trim(), source: "AI", createdAt: this.now() };
    return { ...base, locale: input.locale, messages: [...recentMessages, assistantMessage].slice(-MAX_MESSAGES), confirmedFacts: reduced.confirmed, candidateFacts: [...base.candidateFacts, ...reduced.candidates].slice(-100), unresolvedImportantQuestions: decision.unresolvedImportantQuestions.slice(0, 8), toolResults: observations.slice(-12), solutionReadiness: decision.solutionReadiness, transitionState, compactMemory: decision.compactMemory.slice(0, 2_000), suggestedReplies: decision.suggestedReplies.slice(0, 4), handoff, handoffToken: null };
  }

  private normalizeState(state: ConversationRuntimeState | null, locale: "ar" | "en"): ConversationRuntimeState {
    if (state?.version === 1 && typeof state.runtimeId === "string" && Array.isArray(state.messages) && state.confirmedFacts && typeof state.confirmedFacts === "object" && Array.isArray(state.candidateFacts) && Array.isArray(state.unresolvedImportantQuestions) && Array.isArray(state.toolResults) && Array.isArray(state.suggestedReplies) && typeof state.compactMemory === "string") return state;
    return { runtimeId: this.id(), version: 1, locale, messages: [], confirmedFacts: {}, candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING", transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null, handoffToken: null };
  }
}
