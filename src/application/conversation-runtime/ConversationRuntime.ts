import { detectExplicitScopeType, detectExplicitSystemIdentity } from "./explicit-system-normalizer";
import { asksForProductOptions, renderProductOptionsReply } from "./product-options";
import { resolveProductSelection } from "./product-selection";
import type { ConversationBrainPort, ConversationToolPort, WorkspaceDefaultsPort } from "./ports";
import { promotePendingCandidateFacts, reduceFactProposals } from "./fact-reducer";
import type { CommercialSolutionHandoff, ConversationRuntimeState, ConversationToolKind, ConversationTurnInput, RuntimeMessage } from "./types";
import { buildSystemConfigurationGraph, emptySystemConfigurationGraph } from "./solution-graph";
import { StrictBrain } from "./StrictBrain";
import { isQuotationScopeType } from "@/src/domain/quotation";

const MAX_MESSAGES = 100;
const MAX_TOOL_ITERATIONS = 3;

export class ConversationRuntime {
  constructor(private readonly brain: ConversationBrainPort, private readonly tools: ConversationToolPort, private readonly now = () => new Date().toISOString(), private readonly id = () => crypto.randomUUID(), private readonly defaults?: WorkspaceDefaultsPort, private readonly strict = new StrictBrain()) {}

  async execute(input: ConversationTurnInput): Promise<ConversationRuntimeState> {
    const reconcile = input.action === "RECONCILE";
    const message = input.message.trim();
    if (!message || message.length > 4_000) throw new Error("CONVERSATION_RUNTIME_MESSAGE_INVALID");
    const base = this.normalizeState(input.state, input.locale);
    const userMessage: RuntimeMessage = { id: this.id(), role: "USER", text: message, source: input.source, createdAt: this.now() };
    const approval = promotePendingCandidateFacts(
      base.confirmedFacts,
      base.candidateFacts,
      message,
      this.now(),
    );
    const existingSystem = approval.confirmed["system.identity"];
    const explicitSystem = detectExplicitSystemIdentity(
      message,
      input.locale,
      this.now(),
      Boolean(existingSystem),
    );

    let turnFacts =
      explicitSystem &&
      (!existingSystem ||
        String(existingSystem.value) !==
          String(explicitSystem.value))
        ? {
            ...approval.confirmed,
            "system.identity": explicitSystem,
          }
        : approval.confirmed;
    const explicitScope = detectExplicitScopeType(message, this.now());
    if (explicitScope && turnFacts["scope.type"]?.value !== explicitScope.value) {
      turnFacts = { ...turnFacts, "scope.type": { ...explicitScope, provenance: turnFacts["scope.type"] ? "USER_CORRECTION" : "USER_EXPLICIT" } };
    }

    const wantsProductOptions = asksForProductOptions(message);
    const recentMessages = (reconcile ? base.messages : [...base.messages, userMessage]).slice(-MAX_MESSAGES);
    const attachment = input.attachment ? { id: input.attachment.id ?? null, name: input.attachment.name, type: input.attachment.type } : null;
    let workingGraph = buildSystemConfigurationGraph(turnFacts);
    const brainInput = (toolResults: typeof base.toolResults) => ({ locale: input.locale, currentMessage: message, recentMessages, confirmedFacts: turnFacts, workspace: this.strict.synchronize(base.workspace, turnFacts, workingGraph, this.now()), compactMemory: base.compactMemory, toolResults, attachmentAvailable: Boolean(input.attachment), attachment, availableTools: ["ENGINEERING_KNOWLEDGE", "RESEARCH", "CATALOG_LOOKUP", "PRICING_LOOKUP", "CUSTOMER_LOOKUP", "ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"] as ConversationToolKind[] });
    let decision = this.strict.normalizeProposal(await this.brain.decide(brainInput([])));
    const observations = [...base.toolResults];
    const completedRequests = new Set<string>();
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const request = decision.researchRequests[0] ?? null;
      if (!request) break;
      const requestKey = request.kind + ":" + request.query + ":" + (request.attachmentId ?? "");
      if (completedRequests.has(requestKey)) break;
      completedRequests.add(requestKey);
      const observation = await this.tools.execute({ request, companyId: input.companyId, locale: input.locale, graph: workingGraph });
      observations.push(observation);
      if (observation.candidateProducts) {
        workingGraph = { ...workingGraph, candidateProducts: observation.candidateProducts, catalogResolution: observation.catalogResolution ?? workingGraph.catalogResolution };
      }
      decision = this.strict.normalizeProposal(await this.brain.decide(brainInput(observations.slice(-MAX_TOOL_ITERATIONS))));
    }
    const patchFacts = (decision.patches ?? []).flatMap((patch) => {
      if (!patch.path.startsWith("facts.") || !["SET", "REPLACE", "PROPOSE"].includes(patch.operation)) return [];
      if (!["string", "number", "boolean"].includes(typeof patch.value)) return [];
      return [{ key: patch.path.slice(6), value: patch.value as string | number | boolean, provenance: patch.provenance, evidence: patch.evidence }];
    });
    const reduced = reduceFactProposals(turnFacts, [...decision.legacyFactProposals, ...patchFacts], message, this.now(), userMessage.id);
    const productSelection = resolveProductSelection({ graph: base.solutionGraph, confirmed: reduced.confirmed, message, locale: input.locale, now: this.now() });
    reduced.confirmed = productSelection.confirmed;
    if (productSelection.reply) decision = { ...decision, responseMode: "ACK", responseContent: productSelection.reply, blockingQuestion: null };
    const canHandoff = decision.solutionReadiness === "READY_FOR_HANDOFF" && Boolean(reduced.confirmed["system.identity"]);
    const transitionState = decision.transition === "CONFIRM" && canHandoff
      ? "TRANSITION_REQUESTED"
      : decision.transition === "PROPOSE" ? "PROPOSED" : decision.transition === "REOPEN" ? "EXPLORING" : base.transitionState;
    let solutionGraph = buildSystemConfigurationGraph(reduced.confirmed);
    const candidateObservation = [...observations].reverse().find((observation) => observation.candidateProducts);
    if (candidateObservation?.candidateProducts) {
      const componentKeys = new Set(solutionGraph.salesBom.map((line) => line.id));
      solutionGraph = { ...solutionGraph, candidateProducts: candidateObservation.candidateProducts.filter((candidate) => componentKeys.has(candidate.componentKey)), catalogResolution: candidateObservation.catalogResolution ?? solutionGraph.catalogResolution };
    }
    if (wantsProductOptions && solutionGraph.candidateProducts.length) {
      decision = {
        ...decision,
        responseMode: "RESEARCH_RESULT",
        responseContent: renderProductOptionsReply(solutionGraph, input.locale, Boolean(candidateObservation?.evidence.length)),
        blockingQuestion: null,
      };
    }
    let workspace = this.strict.synchronize(base.workspace, reduced.confirmed, solutionGraph, this.now());
    workspace = this.strict.applyProposal(workspace, decision, message, this.now());
    if (this.defaults) {
      const scope = workspace.commercialContext.scope;
      if (!workspace.terms.currencyCode || workspace.terms.defaultsScope !== scope) {
        const loaded = await this.defaults.loadDefaults(input.companyId, isQuotationScopeType(scope) ? scope : null);
        workspace = this.strict.applyDefaults(workspace, loaded, scope);
      }
    }
    solutionGraph = this.strict.project(workspace, solutionGraph);
    const handoff: CommercialSolutionHandoff | null = null;
    const reply = this.strict.render(decision, input.locale);
    if (!reply) throw new Error("CONVERSATION_RUNTIME_EMPTY_REPLY");
    const assistantMessage: RuntimeMessage = { id: this.id(), role: "ASSISTANT", text: reply, source: "AI", createdAt: this.now() };
    return { ...base, locale: input.locale, messages: [...recentMessages, assistantMessage].slice(-MAX_MESSAGES), confirmedFacts: reduced.confirmed, candidateFacts: [...approval.candidates, ...reduced.candidates].slice(-100), unresolvedImportantQuestions: decision.unresolvedImportantQuestions.slice(0, 8), toolResults: observations.slice(-12), solutionReadiness: decision.solutionReadiness, transitionState, compactMemory: decision.compactMemory.slice(0, 2_000), suggestedReplies: decision.suggestedReplies.slice(0, 4), handoff, handoffToken: null, solutionGraph, workspace };
  }

  private normalizeState(state: ConversationRuntimeState | null, locale: "ar" | "en"): ConversationRuntimeState {
    if (state?.version === 1 && typeof state.runtimeId === "string" && Array.isArray(state.messages) && state.confirmedFacts && typeof state.confirmedFacts === "object" && Array.isArray(state.candidateFacts) && Array.isArray(state.unresolvedImportantQuestions) && Array.isArray(state.toolResults) && Array.isArray(state.suggestedReplies) && typeof state.compactMemory === "string") {
      const graph = state.solutionGraph ?? buildSystemConfigurationGraph(state.confirmedFacts);
      return { ...state, solutionGraph: graph, workspace: state.workspace ?? this.strict.synchronize(undefined, state.confirmedFacts, graph, this.now()) };
    }
    const graph = emptySystemConfigurationGraph();
    return { runtimeId: this.id(), version: 1, locale, messages: [], confirmedFacts: {}, candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING", transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null, handoffToken: null, solutionGraph: graph, workspace: this.strict.synchronize(undefined, {}, graph, this.now()) };
  }
}
