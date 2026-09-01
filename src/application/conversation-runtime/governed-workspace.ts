import type {
  ConfirmedFact,
  ConversationLocale,
  FlexibleTurnProposal,
  GovernedWorkspaceState,
  SolutionBomLine,
  SystemConfigurationGraph,
  WorkspacePatch,
} from "./types";

const LIST_PATHS = new Set([
  "siteAndResponsibilities.siteRequirements",
  "siteAndResponsibilities.supplierResponsibilities",
  "siteAndResponsibilities.customerResponsibilities",
  "siteAndResponsibilities.exclusions",
  "siteAndResponsibilities.notes",
]);

function text(facts: Record<string, ConfirmedFact>, key: string) {
  const value = facts[key]?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 24);
}

function isSafeBomLine(value: unknown): value is SolutionBomLine {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SolutionBomLine>;
  return typeof row.id === "string" && Boolean(row.id.trim()) &&
    typeof row.itemNameAr === "string" && typeof row.itemNameEn === "string" &&
    (row.type === "PRODUCT" || row.type === "SERVICE") &&
    (row.quantity == null || (typeof row.quantity === "number" && Number.isFinite(row.quantity) && row.quantity > 0)) &&
    row.unitPrice == null;
}

export function synchronizeWorkspace(
  prior: GovernedWorkspaceState | undefined,
  facts: Record<string, ConfirmedFact>,
  graph: SystemConfigurationGraph,
  now: string,
): GovernedWorkspaceState {
  const requirements = Object.fromEntries(graph.requirements.map((item) => [item.key, item.value]));
  const sameSystem = prior?.engineering.system?.key === graph.system?.key;
  const approvedCandidateIds = Object.entries(facts).flatMap(([key, fact]) =>
    key.startsWith("product.selection.") && key.endsWith(".id") && fact.provenance === "USER_APPROVED" && typeof fact.value === "string"
      ? [fact.value]
      : [],
  );
  const emptySiteState = { siteRequirements: [], supplierResponsibilities: [], customerResponsibilities: [], exclusions: [], notes: [] };
  return {
    commercialContext: {
      customer: text(facts, "customer.name"),
      project: text(facts, "project.name"),
      attention: text(facts, "attention.name"),
      scope: text(facts, "scope.type"),
      jurisdiction: text(facts, "system.jurisdiction"),
    },
    requirements,
    engineering: {
      system: graph.system,
      calculations: graph.engineeringCalculations,
      bom: graph.engineeringBom.length ? graph.engineeringBom : sameSystem ? prior?.engineering.bom ?? [] : [],
      assumptions: graph.assumptions.length ? graph.assumptions : sameSystem ? prior?.engineering.assumptions ?? [] : [],
    },
    commercialSolution: { bom: graph.salesBom.length ? graph.salesBom : sameSystem ? prior?.commercialSolution.bom ?? [] : [] },
    products: {
      candidates: graph.candidateProducts.length ? graph.candidateProducts : sameSystem ? prior?.products.candidates ?? [] : [],
      approvedCandidateIds: [...new Set([...(sameSystem ? prior?.products.approvedCandidateIds ?? [] : []), ...approvedCandidateIds])],
    },
    siteAndResponsibilities: sameSystem ? prior?.siteAndResponsibilities ?? emptySiteState : emptySiteState,
    terms: {
      payment: text(facts, "commercial.payment"),
      delivery: text(facts, "commercial.delivery"),
      warranty: text(facts, "commercial.warranty"),
      validity: text(facts, "commercial.validity"),
      currencyCode: prior?.terms.currencyCode ?? null,
      companyTermsAr: prior?.terms.companyTermsAr ?? null,
      companyTermsEn: prior?.terms.companyTermsEn ?? null,
      defaultsScope: prior?.terms.defaultsScope ?? null,
    },
    readiness: graph.readiness,
    updatedAt: now,
  };
}

export function applyWorkspaceDefaults(workspace: GovernedWorkspaceState, defaults: { currencyCode: string; termsAr: string | null; termsEn: string | null }, scope: string | null) {
  return {
    ...workspace,
    terms: {
      ...workspace.terms,
      currencyCode: defaults.currencyCode,
      companyTermsAr: defaults.termsAr,
      companyTermsEn: defaults.termsEn,
      defaultsScope: scope,
    },
  };
}

export function applyWorkspacePatches(workspace: GovernedWorkspaceState, patches: WorkspacePatch[] | undefined, userMessage: string, now: string) {
  const next = structuredClone(workspace);
  const normalizedMessage = userMessage.normalize("NFKC").toLocaleLowerCase();
  for (const patch of (patches ?? []).slice(0, 32)) {
    const isUserPatch = patch.provenance === "USER_EXPLICIT" || patch.provenance === "USER_CORRECTION";
    if (isUserPatch && (!patch.evidence.trim() || !normalizedMessage.includes(patch.evidence.normalize("NFKC").toLocaleLowerCase()))) continue;
    if (LIST_PATHS.has(patch.path)) {
      const key = patch.path.split(".").at(-1) as keyof GovernedWorkspaceState["siteAndResponsibilities"];
      if (patch.operation === "REMOVE" || patch.operation === "REJECT") next.siteAndResponsibilities[key] = [];
      else next.siteAndResponsibilities[key] = stringList(patch.value);
      continue;
    }
    if (patch.path === "engineering.bom" && patch.operation === "PROPOSE") {
      const canConfirmQuantity = patch.provenance === "USER_EXPLICIT" || patch.provenance === "USER_CORRECTION";
      const lines = (Array.isArray(patch.value) ? patch.value : [patch.value]).filter(isSafeBomLine).map((line) => ({
        ...line,
        quantity: canConfirmQuantity ? line.quantity ?? null : null,
        quantityState: canConfirmQuantity && line.quantity != null ? "CONFIRMED" as const : "PENDING" as const,
        unitPrice: null,
        priceState: "PENDING" as const,
        provenance: patch.provenance === "RESEARCHED" ? "RESEARCHED" as const : "AI_INFERRED" as const,
      }));
      if (lines.length) {
        next.engineering.bom = lines;
        next.commercialSolution.bom = lines;
      }
      continue;
    }
    if (patch.path === "engineering.components" && patch.operation === "PROPOSE") {
      const names = stringList(patch.value);
      if (names.length) {
        const lines = names.map((name, index): SolutionBomLine => ({
          id: "AI_COMPONENT_" + index + "_" + name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 32),
          componentKeys: [], category: "PRODUCT", itemName: name, itemNameAr: name, itemNameEn: name,
          description: null, unitName: null, quantity: null, quantityState: "PENDING",
          unitPrice: null, priceState: "PENDING", type: "PRODUCT", provenance: "AI_INFERRED",
        }));
        next.engineering.bom = lines;
        next.commercialSolution.bom = lines;
      }
      continue;
    }
    if (patch.path.startsWith("products.candidates.") && patch.operation === "APPROVE") {
      const id = patch.path.slice("products.candidates.".length);
      if (next.products.candidates.some((candidate) => candidate.id === id)) {
        next.products.approvedCandidateIds = [...new Set([...next.products.approvedCandidateIds, id])];
      }
    }
    if (patch.path.startsWith("products.candidates.") && patch.operation === "REJECT") {
      const id = patch.path.slice("products.candidates.".length);
      next.products.approvedCandidateIds = next.products.approvedCandidateIds.filter((candidateId) => candidateId !== id);
    }
  }
  next.updatedAt = now;
  return next;
}

export function projectWorkspaceGraph(workspace: GovernedWorkspaceState, base: SystemConfigurationGraph): SystemConfigurationGraph {
  return {
    ...base,
    system: workspace.engineering.system,
    engineeringCalculations: workspace.engineering.calculations,
    engineeringBom: workspace.engineering.bom,
    salesBom: workspace.commercialSolution.bom,
    candidateProducts: workspace.products.candidates,
    assumptions: workspace.engineering.assumptions,
    readiness: workspace.readiness,
  };
}

export function renderGovernedResponse(decision: FlexibleTurnProposal, locale: ConversationLocale) {
  const fallback = locale === "ar" ? "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u062d\u0644." : "The solution is updated.";
  const bounded = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit).trim();
  const content = bounded(decision.responseContent?.trim() || fallback, 700);
  const recommendations = (decision.recommendations ?? []).slice(0, 3);
  const recommendationText = recommendations.length
    ? "\n" + recommendations.map((item) => "- " + bounded(item.title, 100) + (item.rationale ? ": " + bounded(item.rationale, 180) : "")).join("\n")
    : "";
  const question = decision.blockingQuestion ? bounded(decision.blockingQuestion, 240) : "";
  const statement = question ? (content + recommendationText).replace(/[?\u061f]/g, "") : content + recommendationText;
  const rendered = [statement, question].filter(Boolean).join("\n\n").trim();
  let seenQuestion = false;
  return [...rendered].filter((character) => {
    if (character !== "?" && character !== "\u061f") return true;
    if (seenQuestion) return false;
    seenQuestion = true;
    return true;
  }).join("");
}
