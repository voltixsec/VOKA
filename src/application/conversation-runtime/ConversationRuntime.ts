import { detectExplicitScopeType, detectExplicitSystemIdentity } from "./explicit-system-normalizer";
import { asksForFreshProductResearch, asksForProductOptions, renderProductOptionsReply } from "./product-options";
import { resolveProductSelection } from "./product-selection";
import type { ConversationBrainPort, ConversationToolPort, WorkspaceDefaultsPort } from "./ports";
import { promotePendingCandidateFacts, reduceFactProposals } from "./fact-reducer";
import type { CommercialSolutionHandoff, ConversationRuntimeState, ConversationToolKind, ConversationTurnInput, FlexibleTurnProposal, RuntimeMessage, ToolRequest } from "./types";
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

    const systemChanged = Boolean(explicitSystem && existingSystem && String(existingSystem.value) !== String(explicitSystem.value));
    const retainedFacts = systemChanged
      ? Object.fromEntries(Object.entries(approval.confirmed).filter(([key]) =>
          !key.startsWith("product.selection.") &&
          !["product.brand", "product.model", "product.origin", "commercial.payment", "commercial.delivery", "commercial.warranty", "commercial.validity", "commercial.exclusions", "commercial.notes", "project.siteRequirement"].includes(key),
        ))
      : approval.confirmed;
    let turnFacts =
      explicitSystem &&
      (!existingSystem ||
        String(existingSystem.value) !==
          String(explicitSystem.value))
        ? {
            ...retainedFacts,
            "system.identity": explicitSystem,
          }
        : retainedFacts;
    const explicitScope = detectExplicitScopeType(message, this.now());
    if (explicitScope && turnFacts["scope.type"]?.value !== explicitScope.value) {
      turnFacts = { ...turnFacts, "scope.type": { ...explicitScope, provenance: turnFacts["scope.type"] ? "USER_CORRECTION" : "USER_EXPLICIT" } };
    }

    const wantsProductOptions = asksForProductOptions(message);
    const heuristicProductRetrieval = wantsProductOptions && (!(base.workspace?.products.candidates.length) || asksForFreshProductResearch(message));
    const recentMessages = (reconcile ? base.messages : [...base.messages, userMessage]).slice(-MAX_MESSAGES);
    const patchEvidence = reconcile
      ? recentMessages.filter((item) => item.role === "USER").map((item) => item.text).join("\n")
      : message;
    const attachment = input.attachment ? { id: input.attachment.id ?? null, name: input.attachment.name, type: input.attachment.type } : null;
    const initialGraph = buildSystemConfigurationGraph(turnFacts);
    let workingGraph = this.strict.project(this.strict.synchronize(base.workspace, turnFacts, initialGraph, this.now()), initialGraph);
    const brainInput = (toolResults: typeof base.toolResults) => ({ locale: input.locale, currentMessage: message, recentMessages, confirmedFacts: turnFacts, workspace: this.strict.synchronize(base.workspace, turnFacts, workingGraph, this.now()), compactMemory: base.compactMemory, toolResults, attachmentAvailable: Boolean(input.attachment), attachment, availableTools: ["ENGINEERING_KNOWLEDGE", "RESEARCH", "CATALOG_LOOKUP", "PRICING_LOOKUP", "CUSTOMER_LOOKUP", "ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"] as ConversationToolKind[] });
    let decision = this.strict.normalizeProposal(await this.brain.decide(brainInput([])));
    const requiresProductRetrieval = heuristicProductRetrieval || decision.researchRequests.some((request) => request.kind === "CATALOG_LOOKUP");
    const proposals: FlexibleTurnProposal[] = [decision];
    const legacyFactProposals = [...decision.legacyFactProposals];
    const observations = systemChanged ? [] : [...base.toolResults];
    const turnObservations: typeof observations = [];
    const completedRequests = new Set<string>();
    let targetMarketRequired = false;
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      workingGraph = this.previewGraph(base, turnFacts, proposals, patchEvidence, userMessage.id);
      const latestCandidates = [...turnObservations].reverse().find((observation) => observation.candidateProducts);
      if (latestCandidates?.candidateProducts) workingGraph = { ...workingGraph, candidateProducts: latestCandidates.candidateProducts, catalogResolution: latestCandidates.catalogResolution ?? workingGraph.catalogResolution };
      const catalogObservation = turnObservations.find((observation) => observation.kind === "CATALOG_LOOKUP");
      const researchObservation = turnObservations.find((observation) => observation.kind === "RESEARCH");
      let request: ToolRequest | null = decision.researchRequests[0] ?? null;
      if (requiresProductRetrieval && !catalogObservation) {
        request = { kind: "CATALOG_LOOKUP", query: message, attachmentId: null };
      } else if (requiresProductRetrieval && catalogObservation?.catalogResolution === "CATALOG_INSUFFICIENT" && !researchObservation) {
        request = { kind: "RESEARCH", query: message, attachmentId: null };
      } else if (requiresProductRetrieval && catalogObservation?.catalogResolution === "CATALOG_MATCHED" && request?.kind === "RESEARCH") {
        request = null;
      } else if (requiresProductRetrieval && catalogObservation && request?.kind === "CATALOG_LOOKUP") {
        request = null;
      }
      if (!request) break;
      const jurisdictionKnown = workingGraph.requirements.some((item) => item.key === "system.jurisdiction" && String(item.value).trim());
      if (requiresProductRetrieval && request.kind === "RESEARCH" && !jurisdictionKnown) {
        targetMarketRequired = true;
        decision = { ...decision, responseMode: "QUESTION", responseContent: input.locale === "ar" ? "أقدر أبحث لك عن بدائل متاحة في السوق المناسب." : "I can research alternatives available in the relevant market.", blockingQuestion: input.locale === "ar" ? "السوق أو البلد المستهدف إيه؟" : "What is the target market or country?", researchRequests: [] };
        break;
      }
      const requestKey = request.kind + ":" + request.query + ":" + (request.attachmentId ?? "");
      if (completedRequests.has(requestKey)) break;
      completedRequests.add(requestKey);
      const observation = await this.tools.execute({ request, companyId: input.companyId, locale: input.locale, graph: workingGraph });
      observations.push(observation);
      turnObservations.push(observation);
      if (observation.candidateProducts) {
        workingGraph = { ...workingGraph, candidateProducts: observation.candidateProducts, catalogResolution: observation.catalogResolution ?? workingGraph.catalogResolution };
      }
      decision = this.strict.normalizeProposal(await this.brain.decide(brainInput(observations.slice(-MAX_TOOL_ITERATIONS))));
      proposals.push(decision);
      legacyFactProposals.push(...decision.legacyFactProposals);
    }
    const allPatches = proposals.flatMap((proposal) => proposal.patches ?? []);
    const patchFacts = allPatches.flatMap((patch) => {
      if (!patch.path.startsWith("facts.") || !["SET", "REPLACE", "PROPOSE"].includes(patch.operation)) return [];
      if (!["string", "number", "boolean"].includes(typeof patch.value)) return [];
      return [{ key: patch.path.slice(6), value: patch.value as string | number | boolean, provenance: patch.provenance, evidence: patch.evidence }];
    });
    const reduced = reduceFactProposals(turnFacts, [...legacyFactProposals, ...patchFacts], message, this.now(), userMessage.id);
    const productSelection = resolveProductSelection({ graph: base.solutionGraph, confirmed: reduced.confirmed, message, locale: input.locale, now: this.now() });
    reduced.confirmed = productSelection.confirmed;
    const proposedSystemGraph = buildSystemConfigurationGraph(reduced.confirmed);
    const resolvedSystemChanged = Boolean(base.workspace?.engineering.system?.key && proposedSystemGraph.system?.key && base.workspace.engineering.system.key !== proposedSystemGraph.system.key);
    if (resolvedSystemChanged) {
      reduced.confirmed = Object.fromEntries(Object.entries(reduced.confirmed).filter(([key, current]) => {
        const systemSpecific = key.startsWith("product.selection.") || ["product.brand", "product.model", "product.origin", "commercial.payment", "commercial.delivery", "commercial.warranty", "commercial.validity", "commercial.exclusions", "commercial.notes", "project.siteRequirement"].includes(key);
        return !systemSpecific || approval.confirmed[key] !== current;
      }));
    }
    if (productSelection.reply) decision = { ...decision, responseMode: "ACK", responseContent: productSelection.reply, blockingQuestion: null };
    const canHandoff = decision.solutionReadiness === "READY_FOR_HANDOFF" && Boolean(reduced.confirmed["system.identity"]);
    const transitionState = decision.transition === "CONFIRM" && canHandoff
      ? "TRANSITION_REQUESTED"
      : decision.transition === "PROPOSE" ? "PROPOSED" : decision.transition === "REOPEN" ? "EXPLORING" : base.transitionState;
    let solutionGraph = buildSystemConfigurationGraph(reduced.confirmed);
    const candidateObservation = [...turnObservations].reverse().find((observation) => observation.candidateProducts);
    if (candidateObservation?.candidateProducts) {
      const componentKeys = new Set(solutionGraph.salesBom.map((line) => line.id));
      const candidates = componentKeys.size ? candidateObservation.candidateProducts.filter((candidate) => componentKeys.has(candidate.componentKey)) : candidateObservation.candidateProducts;
      solutionGraph = { ...solutionGraph, candidateProducts: candidates, catalogResolution: candidateObservation.catalogResolution ?? solutionGraph.catalogResolution };
    }
    const researchAttempted = turnObservations.some((observation) => observation.kind === "RESEARCH");
    const successfulResearch = turnObservations.some((observation) => observation.kind === "RESEARCH" && observation.status === "COMPLETED" && observation.evidence.length > 0);
    const productRetrievalAttempted = turnObservations.some((observation) => observation.candidateProducts !== undefined);
    if (targetMarketRequired) {
      decision = { ...decision, responseMode: "QUESTION" };
    } else if (productRetrievalAttempted) {
      decision = {
        ...decision,
        responseMode: solutionGraph.candidateProducts.length ? "RESEARCH_RESULT" : "WARNING",
        responseContent: renderProductOptionsReply(solutionGraph, input.locale, researchAttempted),
        blockingQuestion: null,
      };
    } else if (researchAttempted && !successfulResearch) {
      decision = { ...decision, responseMode: "WARNING", responseContent: input.locale === "ar" ? "تعذر الوصول لنتائج موثوقة الآن." : "I could not reach reliable research results right now.", blockingQuestion: null };
    } else if (researchAttempted && successfulResearch && impliesFutureSearch(decision.responseContent)) {
      decision = { ...decision, responseMode: "RESEARCH_RESULT", responseContent: input.locale === "ar" ? "راجعت المصادر المتاحة وحدثت الحل بالمعلومات التي أمكن توثيقها." : "I reviewed the available sources and updated the solution with the evidence that could be verified.", blockingQuestion: null };
    }
    let workspace = this.strict.synchronize(base.workspace, reduced.confirmed, solutionGraph, this.now());
    workspace = this.strict.applyProposal(workspace, { ...decision, patches: allPatches }, patchEvidence, this.now());
    if (this.defaults) {
      const scope = workspace.commercialContext.scope;
      if (!workspace.terms.defaultsLoaded || !workspace.terms.currencyCode || workspace.terms.defaultsScope !== scope) {
        const loaded = await this.defaults.loadDefaults(input.companyId, isQuotationScopeType(scope) ? scope : null, input.locale);
        workspace = this.strict.applyDefaults(workspace, loaded, scope);
      }
    }
    solutionGraph = this.strict.project(workspace, solutionGraph);
    const missingCustomer = !workspace.commercialContext.customer;
    const missingAttention = !workspace.commercialContext.attention;
    const alreadyAsksUsefulQuestion = /[?؟]/u.test(decision.responseContent);
    if (solutionGraph.readiness.draftReady && (missingCustomer || missingAttention) && !decision.blockingQuestion && !alreadyAsksUsefulQuestion && !researchAttempted && !productRetrievalAttempted && decision.responseMode !== "WARNING") {
      const question = input.locale === "ar"
        ? missingCustomer && missingAttention ? "اسم العميل والعرض لعناية مين؟" : missingCustomer ? "اسم العميل إيه؟" : "العرض لعناية مين؟"
        : missingCustomer && missingAttention ? "What is the customer name, and who should the quotation be addressed to?" : missingCustomer ? "What is the customer name?" : "Who should the quotation be addressed to?";
      decision = { ...decision, responseMode: "QUESTION", blockingQuestion: question };
    }
    const handoff: CommercialSolutionHandoff | null = null;
    const reply = this.strict.render(decision, input.locale);
    if (!reply) throw new Error("CONVERSATION_RUNTIME_EMPTY_REPLY");
    const assistantMessage: RuntimeMessage = { id: this.id(), role: "ASSISTANT", text: reply, source: "AI", createdAt: this.now() };
    return { ...base, locale: input.locale, messages: [...recentMessages, assistantMessage].slice(-MAX_MESSAGES), confirmedFacts: reduced.confirmed, candidateFacts: (resolvedSystemChanged ? reduced.candidates : [...approval.candidates, ...reduced.candidates]).slice(-100), unresolvedImportantQuestions: decision.unresolvedImportantQuestions.slice(0, 8), toolResults: (resolvedSystemChanged ? turnObservations : observations).slice(-12), solutionReadiness: decision.solutionReadiness, transitionState, compactMemory: decision.compactMemory.slice(0, 2_000), suggestedReplies: decision.suggestedReplies.slice(0, 4), handoff, handoffToken: null, solutionGraph, workspace };
  }

  private previewGraph(base: ConversationRuntimeState, facts: ConversationRuntimeState["confirmedFacts"], proposals: FlexibleTurnProposal[], message: string, messageId: string) {
    const patches = proposals.flatMap((proposal) => proposal.patches ?? []);
    const patchFacts = patches.flatMap((patch) => {
      if (!patch.path.startsWith("facts.") || !["SET", "REPLACE", "PROPOSE"].includes(patch.operation)) return [];
      if (!["string", "number", "boolean"].includes(typeof patch.value)) return [];
      return [{ key: patch.path.slice(6), value: patch.value as string | number | boolean, provenance: patch.provenance, evidence: patch.evidence }];
    });
    const proposed = reduceFactProposals(facts, patchFacts, message, this.now(), messageId).confirmed;
    const graph = buildSystemConfigurationGraph(proposed);
    let workspace = this.strict.synchronize(base.workspace, proposed, graph, this.now());
    workspace = this.strict.applyProposal(workspace, { ...proposals.at(-1)!, patches }, message, this.now());
    return this.strict.project(workspace, graph);
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

function impliesFutureSearch(value: string) {
  return /(?:\u0633\u0623\u0628\u062d\u062b|\u0633\u0648\u0641\s+\u0623\u0628\u062d\u062b|\u0647(?:\u0627|\u0623)?\u062f\u0648\u0631|\u062e\u0644\u064a\u0646\u064a\s+\u0623\u0628\u062d\u062b|i(?:'ll|\s+will)\s+(?:search|research|look\s+up)|let\s+me\s+(?:search|research|look\s+up))/iu.test(value);
}
