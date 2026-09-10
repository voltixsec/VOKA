import { detectExplicitScopeType, detectExplicitSystemIdentity, detectExplicitVehicleElevatorFacts } from "./explicit-system-normalizer";
import { asksForFreshProductResearch, asksForProductOptions, renderProductOptionsReply } from "./product-options";
import { resolveProductSelection } from "./product-selection";
import type { ConversationBrainPort, ConversationToolPort, WorkspaceDefaultsPort } from "./ports";
import type { NormalizedRequirementPort } from "@/src/application/source-artifacts";
import { promotePendingCandidateFacts, reduceFactProposals, rejectPendingCandidateFacts } from "./fact-reducer";
import type { CommercialSolutionHandoff, ConversationRuntimeState, ConversationToolKind, ConversationTurnInput, FlexibleTurnProposal, RuntimeMessage, ToolRequest } from "./types";
import { buildSystemConfigurationGraph, emptySystemConfigurationGraph } from "./solution-graph";
import { StrictBrain } from "./StrictBrain";
import { isQuotationScopeType } from "@/src/domain/quotation";

const MAX_MESSAGES = 100;
const MAX_TOOL_ITERATIONS = 3;

export class ConversationRuntime {
  constructor(private readonly brain: ConversationBrainPort, private readonly tools: ConversationToolPort, private readonly now = () => new Date().toISOString(), private readonly id = () => crypto.randomUUID(), private readonly defaults?: WorkspaceDefaultsPort, private readonly strict = new StrictBrain(), private readonly requirements?: NormalizedRequirementPort) {}

  async execute(input: ConversationTurnInput): Promise<ConversationRuntimeState> {
    const reconcile = input.action === "RECONCILE";
    const message = input.message.trim();
    const attachmentOnly = !message && Boolean(input.attachment?.id);
    if ((!message && !attachmentOnly) || message.length > 4_000) throw new Error("CONVERSATION_RUNTIME_MESSAGE_INVALID");
    const base = this.normalizeState(input.state, input.locale);
    if (isVehicleElevator(base.confirmedFacts)) base.candidateFacts = base.candidateFacts.filter(candidate => !vehicleControlledFact(candidate.key));
    const userMessage: RuntimeMessage = { id: this.id(), role: "USER", text: message, source: input.source, createdAt: this.now() };
    const candidateResolution = rejectPendingCandidateFacts(
      base.candidateFacts,
      message,
      this.now(),
    );
    const approval = promotePendingCandidateFacts(
      base.confirmedFacts,
      candidateResolution.candidates,
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
          !["system.recorderCount", "product.brand", "product.model", "product.origin", "commercial.payment", "commercial.delivery", "commercial.warranty", "commercial.validity", "commercial.exclusions", "commercial.notes", "project.siteRequirement"].includes(key),
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
    const vehicleIdentity = String(turnFacts["system.identity"]?.value ?? "").match(/vehicle\s*elevator|car\s*elevator|مصعد\s*(?:سيارات|سيارة)|رافعة\s*سيارات/iu);
    if (vehicleIdentity) {
      const explicit = detectExplicitVehicleElevatorFacts(message, this.now());
      for (const [key, value] of Object.entries(explicit)) {
        turnFacts = { ...turnFacts, [key]: { ...value, provenance: turnFacts[key] ? "USER_CORRECTION" : "USER_EXPLICIT" } };
      }
    }
    const explicitScope = detectExplicitScopeType(message, this.now()) ?? (!turnFacts["scope.type"]
      ? [...base.messages].reverse().filter((item) => item.role === "USER").map((item) => detectExplicitScopeType(item.text, this.now())).find(Boolean) ?? null : null);
    if (explicitScope && turnFacts["scope.type"]?.value !== explicitScope.value) {
      turnFacts = { ...turnFacts, "scope.type": { ...explicitScope, provenance: turnFacts["scope.type"] ? "USER_CORRECTION" : "USER_EXPLICIT" } };
    }

    const wantsProductOptions = asksForProductOptions(message);
    const heuristicProductRetrieval = wantsProductOptions && (!(base.workspace?.products.candidates.length) || asksForFreshProductResearch(message));
    const recentMessages = (reconcile || attachmentOnly ? base.messages : [...base.messages, userMessage]).slice(-MAX_MESSAGES);
    const patchEvidence = reconcile
      ? recentMessages.filter((item) => item.role === "USER").map((item) => item.text).join("\n")
      : message;
    const attachment = input.attachment ? { id: input.attachment.id ?? null, name: input.attachment.name, type: input.attachment.type } : null;
    const priorEngineeringRules = base.toolResults.flatMap((observation) => observation.engineeringRules ?? []);
    const initialGraph = buildSystemConfigurationGraph(turnFacts, { engineeringRules: priorEngineeringRules });
    let workingGraph = this.strict.project(this.strict.synchronize(base.workspace, turnFacts, initialGraph, this.now()), initialGraph);
    const brainInput = (toolResults: typeof base.toolResults) => ({ locale: input.locale, currentMessage: attachmentOnly ? "Inspect the stored attachment using the attachment inspection tool; report only observed content and limitations. This is an internal attachment-analysis intent, not a user statement." : message, recentMessages, confirmedFacts: turnFacts, workspace: this.strict.synchronize(base.workspace, turnFacts, workingGraph, this.now()), compactMemory: base.compactMemory, toolResults, attachmentAvailable: Boolean(input.attachment?.id), attachment, availableTools: ["ENGINEERING_KNOWLEDGE", "RESEARCH", "CATALOG_LOOKUP", "PRICING_LOOKUP", "CUSTOMER_LOOKUP", "ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"] as ConversationToolKind[] });
    let decision = this.strict.normalizeProposal(await this.brain.decide(brainInput([])));
    const requiresProductRetrieval = heuristicProductRetrieval || decision.researchRequests.some((request) => request.kind === "CATALOG_LOOKUP");
    const proposals: FlexibleTurnProposal[] = [decision];
    const legacyFactProposals = [...decision.legacyFactProposals];
    const observations = systemChanged ? [] : [...base.toolResults];
    const turnObservations: typeof observations = [];
    const completedRequests = new Set<string>();
    let targetMarketRequired = false;
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      workingGraph = this.previewGraph(base, turnFacts, proposals, patchEvidence, userMessage.id, observations);
      const latestCandidates = [...turnObservations].reverse().find((observation) => observation.candidateProducts);
      if (latestCandidates?.candidateProducts) workingGraph = { ...workingGraph, candidateProducts: latestCandidates.candidateProducts, catalogResolution: latestCandidates.catalogResolution ?? workingGraph.catalogResolution };
      const catalogObservation = turnObservations.find((observation) => observation.kind === "CATALOG_LOOKUP");
      const researchObservation = turnObservations.find((observation) => observation.kind === "RESEARCH" && observation.purpose !== "JURISDICTION_RULE");
      const jurisdictionAttempted = observations.some((observation) => observation.kind === "RESEARCH" && observation.purpose === "JURISDICTION_RULE");
      const jurisdictionRuleNeeded = Boolean(
        workingGraph.system
        && workingGraph.requirements.some((item) => item.key === "system.jurisdiction" && String(item.value).trim())
        && workingGraph.engineeringRuleSnapshot?.trust === "ENGINEERING_DEFAULT"
        && workingGraph.engineeringCalculations.some((calculation) => calculation.status === "ESTIMATED"),
      );
      let request: ToolRequest | null = decision.researchRequests[0] ?? null;
      if (jurisdictionRuleNeeded && !jurisdictionAttempted) {
        const jurisdiction = workingGraph.requirements.find((item) => item.key === "system.jurisdiction")?.value;
        request = { kind: "RESEARCH", purpose: "JURISDICTION_RULE", query: `Authoritative jurisdiction engineering rules for ${workingGraph.system?.nameEn} in ${jurisdiction}. Return only explicit rule values supported by government or standards authority evidence.`, attachmentId: null };
      } else if (requiresProductRetrieval && !catalogObservation) {
        request = { kind: "CATALOG_LOOKUP", query: message, attachmentId: null };
      } else if (requiresProductRetrieval && catalogObservation?.catalogResolution === "CATALOG_INSUFFICIENT" && !researchObservation) {
        request = { kind: "RESEARCH", query: message, attachmentId: null };
      } else if (requiresProductRetrieval && catalogObservation?.catalogResolution === "CATALOG_MATCHED" && request?.kind === "RESEARCH") {
        request = null;
      } else if (requiresProductRetrieval && catalogObservation && request?.kind === "CATALOG_LOOKUP") {
        request = null;
      }
      if (request && ["ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"].includes(request.kind) && !request.attachmentId) {
        request = { ...request, attachmentId: input.attachment?.id ?? null };
      }
      if (attachmentOnly && iteration === 0) request = { kind: "ATTACHMENT_INSPECTION", query: "Inspect retained file content", attachmentId: input.attachment?.id ?? null };
      if (!request) break;
      const jurisdictionKnown = workingGraph.requirements.some((item) => item.key === "system.jurisdiction" && String(item.value).trim());
      if (requiresProductRetrieval && request.kind === "RESEARCH" && !jurisdictionKnown) {
        targetMarketRequired = true;
        decision = { ...decision, responseMode: "QUESTION", responseContent: input.locale === "ar" ? "أقدر أبحث لك عن بدائل متاحة في السوق المناسب." : "I can research alternatives available in the relevant market.", blockingQuestion: input.locale === "ar" ? "السوق أو البلد المستهدف إيه؟" : "What is the target market or country?", researchRequests: [] };
        break;
      }
      const requestKey = request.kind + ":" + (request.purpose ?? "") + ":" + request.query + ":" + (request.attachmentId ?? "");
      if (completedRequests.has(requestKey)) break;
      completedRequests.add(requestKey);
      const rawObservation = await this.tools.execute({ request, runtimeId: base.runtimeId, companyId: input.companyId, locale: input.locale, graph: workingGraph });
      const observation = { ...rawObservation, purpose: rawObservation.purpose ?? request.purpose };
      observations.push(observation);
      turnObservations.push(observation);
      if (observation.candidateProducts) {
        workingGraph = { ...workingGraph, candidateProducts: observation.candidateProducts, catalogResolution: observation.catalogResolution ?? workingGraph.catalogResolution };
      }
      decision = this.strict.normalizeProposal(await this.brain.decide(brainInput(observations.slice(-MAX_TOOL_ITERATIONS))));
      proposals.push(decision);
      legacyFactProposals.push(...decision.legacyFactProposals);
    }
    const vehicleElevator = isVehicleElevator(turnFacts);
    const governedPatches = governedVehiclePatches(turnFacts, proposals.flatMap(proposal => proposal.patches ?? []));
    const patchFacts = governedPatches.flatMap((patch) => {
      if (!patch.path.startsWith("facts.") || !["SET", "REPLACE", "PROPOSE"].includes(patch.operation)) return [];
      const value = patch.value;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return [];
      return [{ key: patch.path.slice(6), value, provenance: patch.provenance, evidence: patch.evidence }];
    });
    const reduced = reduceFactProposals(turnFacts, [...legacyFactProposals.filter(proposal => !vehicleElevator || !vehicleControlledFact(proposal.key)), ...patchFacts], message, this.now(), userMessage.id);
    const productSelection = vehicleElevator ? { confirmed: reduced.confirmed, reply: null } : resolveProductSelection({ graph: workingGraph, confirmed: reduced.confirmed, message, locale: input.locale, now: this.now(), patches: governedPatches, engineeringRules: observations.flatMap((observation) => observation.engineeringRules ?? []) });
    reduced.confirmed = productSelection.confirmed;
    const engineeringRules = observations.flatMap((observation) => observation.engineeringRules ?? []);
    const proposedSystemGraph = buildSystemConfigurationGraph(reduced.confirmed, { engineeringRules });
    const resolvedSystemChanged = Boolean(base.workspace?.engineering.system?.key && proposedSystemGraph.system?.key && base.workspace.engineering.system.key !== proposedSystemGraph.system.key);
    if (resolvedSystemChanged) {
      reduced.confirmed = Object.fromEntries(Object.entries(reduced.confirmed).filter(([key, current]) => {
        const systemSpecific = key.startsWith("product.selection.") || ["system.recorderCount", "product.brand", "product.model", "product.origin", "commercial.payment", "commercial.delivery", "commercial.warranty", "commercial.validity", "commercial.exclusions", "commercial.notes", "project.siteRequirement"].includes(key);
        return !systemSpecific || approval.confirmed[key] !== current;
      }));
    }
    if (productSelection.reply) decision = { ...decision, responseMode: "ACK", responseContent: productSelection.reply, blockingQuestion: null };
    const canHandoff = decision.solutionReadiness === "READY_FOR_HANDOFF" && Boolean(reduced.confirmed["system.identity"]);
    const transitionState = decision.transition === "CONFIRM" && canHandoff
      ? "TRANSITION_REQUESTED"
      : decision.transition === "PROPOSE" ? "PROPOSED" : decision.transition === "REOPEN" ? "EXPLORING" : base.transitionState;
    let solutionGraph = buildSystemConfigurationGraph(reduced.confirmed, { engineeringRules });
    const candidateObservation = [...turnObservations].reverse().find((observation) => observation.candidateProducts);
    if (candidateObservation?.candidateProducts) {
      const componentKeys = new Set([...solutionGraph.salesBom, ...workingGraph.salesBom].map((line) => line.id));
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
    workspace = this.strict.applyProposal(workspace, { ...decision, patches: governedPatches }, patchEvidence, this.now());
    workspace = this.strict.synchronize(workspace, reduced.confirmed, solutionGraph, this.now());
    if (this.defaults) {
      const scope = workspace.commercialContext.scope;
      if (!workspace.terms.defaultsLoaded || !workspace.terms.currencyCode || workspace.terms.defaultsScope !== scope) {
        const loaded = await this.defaults.loadDefaults(input.companyId, isQuotationScopeType(scope) ? scope : null, input.locale);
        workspace = this.strict.applyDefaults(workspace, loaded, scope);
      }
    }
    if (productSelection.reply && Object.keys(reduced.confirmed).some((key) => key.startsWith("product.selection.") && reduced.confirmed[key] !== turnFacts[key])) {
      const newlyApprovedIds = Object.entries(reduced.confirmed).flatMap(([key, fact]) =>
        key.startsWith("product.selection.") && key.endsWith(".id") && fact.provenance === "USER_APPROVED" && fact.evidence === message.trim() && typeof fact.value === "string"
          ? [fact.value]
          : [],
      );
      const approvalIsVisible = newlyApprovedIds.length > 0 && newlyApprovedIds.every((id) =>
        workspace.products.approvedCandidateIds.includes(id) && workspace.products.candidates.some((candidate) => candidate.id === id),
      );
      if (newlyApprovedIds.length && !approvalIsVisible) {
        decision = {
          ...decision,
          responseMode: "WARNING",
          responseContent: input.locale === "ar"
            ? "لم يثبت اعتماد المنتج في مساحة الحل، لذلك أبقيته غير معتمد للمراجعة."
            : "The product approval did not persist in the Solution Workspace, so it remains unapproved for review.",
        };
      }
    }
    solutionGraph = this.strict.project(workspace, solutionGraph);
    if (this.requirements) {
      await this.requirements.synchronize({
        companyId: input.companyId,
        runtimeId: base.runtimeId,
        userId: input.userId ?? null,
        facts: reduced.confirmed,
        graph: solutionGraph,
        citations: turnObservations.flatMap((observation) => observation.citations ?? []),
      });
    }
    const missingCustomer = !workspace.commercialContext.customer;
    const missingAttention = !workspace.commercialContext.attention;
    const alreadyAsksUsefulQuestion = /[?؟]/u.test(decision.responseContent);
    if (solutionGraph.system && (missingCustomer || missingAttention) && !decision.blockingQuestion && !alreadyAsksUsefulQuestion && !researchAttempted && !productRetrievalAttempted && decision.responseMode !== "WARNING") {
      const question = input.locale === "ar"
        ? missingCustomer && missingAttention ? "اسم العميل والعرض لعناية مين؟" : missingCustomer ? "اسم العميل إيه؟" : "العرض لعناية مين؟"
        : missingCustomer && missingAttention ? "What is the customer name, and who should the quotation be addressed to?" : missingCustomer ? "What is the customer name?" : "Who should the quotation be addressed to?";
      decision = { ...decision, responseMode: "QUESTION", blockingQuestion: question };
    }
    const handoff: CommercialSolutionHandoff | null = null;
    const truthfulDecision = { ...decision, responseContent: enforceTruthfulAssistantResponse(decision.responseContent, input.locale, observations, workspace, reduced.confirmed) };
    const renderedReply = this.strict.render(truthfulDecision, input.locale, workspace);
    const reply = enforceTruthfulAssistantResponse(renderedReply, input.locale, observations, workspace, reduced.confirmed);
    if (!reply) throw new Error("CONVERSATION_RUNTIME_EMPTY_REPLY");
    const assistantMessage: RuntimeMessage = { id: this.id(), role: "ASSISTANT", text: reply, source: "AI", createdAt: this.now() };
    const suggestedReplies = decision.suggestedReplies.filter((reply) => solutionGraph.system?.key !== "CCTV" || !/(?:retention|storage\s*days|مدة\s*(?:التسجيل|الاحتفاظ))/iu.test(reply));
    return { ...base, locale: input.locale, messages: [...recentMessages, assistantMessage].slice(-MAX_MESSAGES), confirmedFacts: reduced.confirmed, candidateFacts: (resolvedSystemChanged ? reduced.candidates : [...approval.candidates, ...reduced.candidates]).slice(-100), unresolvedImportantQuestions: decision.unresolvedImportantQuestions.slice(0, 8), toolResults: (resolvedSystemChanged ? turnObservations : observations).slice(-12), solutionReadiness: decision.solutionReadiness, transitionState, compactMemory: decision.compactMemory.slice(0, 2_000), suggestedReplies: suggestedReplies.slice(0, 4), handoff, handoffToken: null, solutionGraph, workspace };
  }

  private previewGraph(base: ConversationRuntimeState, facts: ConversationRuntimeState["confirmedFacts"], proposals: FlexibleTurnProposal[], message: string, messageId: string, observations: ConversationRuntimeState["toolResults"]) {
    const patches = governedVehiclePatches(facts, proposals.flatMap((proposal) => proposal.patches ?? []));
    const patchFacts = patches.flatMap((patch) => {
      if (!patch.path.startsWith("facts.") || !["SET", "REPLACE", "PROPOSE"].includes(patch.operation)) return [];
      const value = patch.value;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return [];
      return [{ key: patch.path.slice(6), value, provenance: patch.provenance, evidence: patch.evidence }];
    });
    const proposed = reduceFactProposals(facts, patchFacts, message, this.now(), messageId).confirmed;
    const graph = buildSystemConfigurationGraph(proposed, { engineeringRules: observations.flatMap((observation) => observation.engineeringRules ?? []) });
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

function enforceTruthfulAssistantResponse(value: string, locale: "ar" | "en", observations: ConversationRuntimeState["toolResults"], workspace: ConversationRuntimeState["workspace"], facts: ConversationRuntimeState["confirmedFacts"]) {
  const inspected = observations.some((observation) => ["ATTACHMENT_INSPECTION", "BOQ_INSPECTION", "DRAWING_INSPECTION"].includes(observation.kind) && observation.status === "COMPLETED");
  if (!inspected && /(?:(?:file|attachment|document|pdf).*?(?:analy[sz]|read|review|inspect)|(?:analy[sz]|read|review|inspect).*?(?:file|attachment|document|pdf)|(?:الملف|المرفق|المستند).*?(?:حللت|قرأت|راجعت|فحصت)|(?:حللت|قرأت|راجعت|فحصت).*?(?:الملف|المرفق|المستند))/iu.test(value)) {
    return locale === "ar" ? "استلمت المرفق، لكن لم يكتمل فحص محتواه بعد؛ لن أصفه بأنه مُحلل." : "The attachment was received, but its content was not inspected successfully, so I will not describe it as analyzed.";
  }
  const quantityApproved = /(?:quantity|quantities|الكمي(?:ة|ات)).{0,20}(?:approved|confirmed|اعتماد|معتمد|مؤكد)/iu.test(value);
  const quantityApprovedInFacts = Object.entries(facts).some(([key, current]) => /quantity|numberOfStops|cameraCount/iu.test(key) && current.provenance === "USER_APPROVED");
  if (quantityApproved && !quantityApprovedInFacts) return locale === "ar" ? "الكمية ما زالت تحتاج اعتماداً صريحاً في مساحة الحل." : "The quantity still requires explicit approval in the governed workspace.";
  const systemComplete = /(?:system|configuration|solution|النظام|الحل|التكوين).{0,20}(?:complete|completed|جاهز بالكامل|مكتمل)/iu.test(value);
  if (systemComplete && workspace?.readiness.pendingBeforeFinalIssue.some((item) => /engineering components|quantity|مكونات هندسية|كمية/iu.test(item))) return locale === "ar" ? "النظام معروف، لكن المتطلبات والمكونات الهندسية ما زالت جزئية وتحتاج مراجعة." : "The system is known, but engineering requirements and components remain partial and need review.";
  return value;
}

function impliesFutureSearch(value: string) {
  return /(?:\u0633\u0623\u0628\u062d\u062b|\u0633\u0648\u0641\s+\u0623\u0628\u062d\u062b|\u0647(?:\u0627|\u0623)?\u062f\u0648\u0631|\u062e\u0644\u064a\u0646\u064a\s+\u0623\u0628\u062d\u062b|i(?:'ll|\s+will)\s+(?:search|research|look\s+up)|let\s+me\s+(?:search|research|look\s+up))/iu.test(value);
}

function isVehicleElevator(facts: ConversationRuntimeState["confirmedFacts"]) {
  return /vehicle\s*elevator|car\s*elevator|مصعد\s*(?:سيارات|سيارة)|رافعة\s*سيارات/iu.test(String(facts["system.identity"]?.value ?? ""));
}

function vehicleControlledFact(key: string) {
  return ["system.identity", "system.quantity", "system.numberOfStops"].includes(key) || key.startsWith("product.selection.");
}

function governedVehiclePatches(facts: ConversationRuntimeState["confirmedFacts"], patches: NonNullable<FlexibleTurnProposal["patches"]>) {
  if (!isVehicleElevator(facts)) return patches;
  return patches.filter(patch => !["engineering", "products", "requirements", "readiness", "commercialSolution"].some(root => patch.path === root || patch.path.startsWith(root + "."))
    && !(patch.path.startsWith("facts.") && vehicleControlledFact(patch.path.slice(6))));
}
