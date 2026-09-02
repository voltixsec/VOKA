import type {
  ConfirmedFact,
  ConversationLocale,
  FlexibleTurnProposal,
  GovernedWorkspaceState,
  SolutionBomLine,
  SystemConfigurationGraph,
  WorkspacePatch,
} from "./types";
import type { CommercialDefaultsProfile } from "./commercial-defaults";
import { normalizeCommercialText } from "./commercial-defaults";
import { projectCommercialBomLine } from "./commercial-projection";
import { applyApprovedProductSelection } from "./solution-graph";

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

const TERM_KEYS = ["payment", "delivery", "warranty", "validity"] as const;

function explicitTerm(
  prior: GovernedWorkspaceState | undefined,
  facts: Record<string, ConfirmedFact>,
  key: typeof TERM_KEYS[number],
  sameSystem: boolean,
) {
  const value = text(facts, `commercial.${key}`);
  if (value) return { value, source: "EXPLICIT" as const };
  if (sameSystem && prior?.terms.sources?.[key] === "COMPANY_DEFAULT") {
    return { value: prior.terms[key], source: "COMPANY_DEFAULT" as const };
  }
  return { value: null, source: null };
}

function stringList(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter((item): item is string => typeof item === "string").map((item) => normalizeCommercialText(item)).filter((item): item is string => Boolean(item)))].slice(0, 24);
}

function isSafeBomLine(value: unknown): value is SolutionBomLine {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SolutionBomLine>;
  return typeof row.id === "string" && Boolean(row.id.trim()) &&
    Array.isArray(row.componentKeys) && row.componentKeys.every((key) => typeof key === "string") &&
    typeof row.category === "string" && typeof row.itemName === "string" &&
    typeof row.itemNameAr === "string" && typeof row.itemNameEn === "string" &&
    (typeof row.unitName === "string" || row.unitName == null) &&
    (row.type === "PRODUCT" || row.type === "SERVICE") &&
    (row.quantity == null || (typeof row.quantity === "number" && Number.isFinite(row.quantity) && row.quantity > 0)) &&
    row.unitPrice == null;
}

function governedBom(
  prior: SolutionBomLine[] | undefined,
  generated: SolutionBomLine[],
  sameSystem: boolean,
) {
  if (!sameSystem || !prior?.length) return generated;
  if (!generated.length) return prior;
  const priorIds = prior.map((line) => line.id).join("|");
  const generatedIds = generated.map((line) => line.id).join("|");
  const hasUserGovernedStructure = prior.some((line) =>
    ["USER_EXPLICIT", "USER_CORRECTION", "USER_APPROVED"].includes(line.provenance),
  );
  return hasUserGovernedStructure && priorIds !== generatedIds ? prior : generated;
}

export function synchronizeWorkspace(
  prior: GovernedWorkspaceState | undefined,
  facts: Record<string, ConfirmedFact>,
  graph: SystemConfigurationGraph,
  now: string,
): GovernedWorkspaceState {
  const requirements = Object.fromEntries(graph.requirements.map((item) => [item.key, item.value]));
  const sameSystem = prior?.engineering.system?.key === graph.system?.key;
  const currentScope = text(facts, "scope.type");
  const scopeChanged = Boolean(sameSystem && prior?.commercialContext.scope !== currentScope);
  const supplyOnlyAfterScopeChange = scopeChanged && currentScope === "SUPPLY_ONLY";
  const approvedCandidateIds = Object.entries(facts).flatMap(([key, fact]) =>
    key.startsWith("product.selection.") && key.endsWith(".id") && fact.provenance === "USER_APPROVED" && typeof fact.value === "string"
      ? [fact.value]
      : [],
  );
  const emptySiteState = { siteRequirements: [], supplierResponsibilities: [], customerResponsibilities: [], exclusions: [], notes: [] };
  const commercialTerms = Object.fromEntries(TERM_KEYS.map((key) => [key, explicitTerm(prior, facts, key, Boolean(sameSystem))])) as Record<typeof TERM_KEYS[number], { value: string | null; source: "EXPLICIT" | "COMPANY_DEFAULT" | null }>;
  const engineeringBom = governedBom(prior?.engineering.bom, graph.engineeringBom, Boolean(sameSystem))
    .map((line) => applyApprovedProductSelection(line, facts));
  const commercialBom = governedBom(prior?.commercialSolution.bom, graph.salesBom, Boolean(sameSystem))
    .map((line) => projectCommercialBomLine(applyApprovedProductSelection(line, facts)));
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
      bom: engineeringBom,
      assumptions: graph.assumptions.length ? graph.assumptions : sameSystem ? prior?.engineering.assumptions ?? [] : [],
    },
    commercialSolution: { bom: commercialBom },
    products: {
      candidates: graph.candidateProducts.length ? graph.candidateProducts : sameSystem ? prior?.products.candidates ?? [] : [],
      approvedCandidateIds: [...new Set([...(sameSystem ? prior?.products.approvedCandidateIds ?? [] : []), ...approvedCandidateIds])],
    },
    siteAndResponsibilities: sameSystem
      ? supplyOnlyAfterScopeChange
        ? {
            ...(prior?.siteAndResponsibilities ?? emptySiteState),
            siteRequirements: [],
            supplierResponsibilities: [],
            customerResponsibilities: [],
          }
        : prior?.siteAndResponsibilities ?? emptySiteState
      : emptySiteState,
    terms: {
      payment: commercialTerms.payment.value,
      delivery: commercialTerms.delivery.value,
      warranty: commercialTerms.warranty.value,
      validity: commercialTerms.validity.value,
      sources: Object.fromEntries(TERM_KEYS.map((key) => [key, commercialTerms[key].source])) as GovernedWorkspaceState["terms"]["sources"],
      currencyCode: sameSystem ? prior?.terms.currencyCode ?? null : null,
      companyTermsAr: sameSystem ? prior?.terms.companyTermsAr ?? null : null,
      companyTermsEn: sameSystem ? prior?.terms.companyTermsEn ?? null : null,
      defaultsScope: sameSystem ? prior?.terms.defaultsScope ?? null : null,
      defaultsLoaded: sameSystem ? prior?.terms.defaultsLoaded === true : false,
    },
    readiness: graph.readiness,
    updatedAt: now,
  };
}

export function applyWorkspaceDefaults(workspace: GovernedWorkspaceState, defaults: CommercialDefaultsProfile, scope: string | null) {
  const effective = Object.fromEntries(TERM_KEYS.map((key) => [key,
    workspace.terms.sources?.[key] === "EXPLICIT"
      ? { value: workspace.terms[key], source: "EXPLICIT" as const }
      : { value: defaults[key], source: defaults[key] ? "COMPANY_DEFAULT" as const : null },
  ])) as Record<typeof TERM_KEYS[number], { value: string | null; source: "EXPLICIT" | "COMPANY_DEFAULT" | null }>;
  return {
    ...workspace,
    terms: {
      ...workspace.terms,
      currencyCode: defaults.currencyCode,
      companyTermsAr: defaults.termsAr,
      companyTermsEn: defaults.termsEn,
      defaultsScope: scope,
      defaultsLoaded: true,
      payment: effective.payment.value,
      delivery: effective.delivery.value,
      warranty: effective.warranty.value,
      validity: effective.validity.value,
      sources: Object.fromEntries(TERM_KEYS.map((key) => [key, effective[key].source])) as GovernedWorkspaceState["terms"]["sources"],
    },
    readiness: effective.payment.value ? {
      ...workspace.readiness,
      pendingBeforeFinalIssue: workspace.readiness.pendingBeforeFinalIssue.filter((item) => item !== "Payment terms"),
    } : workspace.readiness,
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
      else if (isUserPatch) next.siteAndResponsibilities[key] = stringList(patch.value);
      continue;
    }
    if (patch.path === "engineering.bom" && (patch.operation === "PROPOSE" || patch.operation === "REPLACE")) {
      const canConfirmQuantity = patch.provenance === "USER_EXPLICIT" || patch.provenance === "USER_CORRECTION";
      const lines = (Array.isArray(patch.value) ? patch.value : [patch.value]).filter(isSafeBomLine).map((line) => ({
        ...line,
        quantity: canConfirmQuantity ? line.quantity ?? null : null,
        quantityState: canConfirmQuantity && line.quantity != null ? "CONFIRMED" as const : "PENDING" as const,
        unitPrice: null,
        priceState: "PENDING" as const,
        provenance: patch.provenance,
      }));
      if (lines.length) {
        next.engineering.bom = lines;
        next.commercialSolution.bom = lines;
      }
      continue;
    }
    if (patch.path.startsWith("engineering.bom.") && patch.operation === "REPLACE") {
      const parentId = patch.path.slice("engineering.bom.".length).trim();
      if (!next.engineering.bom.some((line) => line.id === parentId)) continue;
      const canConfirmQuantity = patch.provenance === "USER_EXPLICIT" || patch.provenance === "USER_CORRECTION";
      const replacements = (Array.isArray(patch.value) ? patch.value : [patch.value]).filter(isSafeBomLine).map((line) => ({
        ...line,
        quantity: canConfirmQuantity ? line.quantity ?? null : null,
        quantityState: canConfirmQuantity && line.quantity != null ? "CONFIRMED" as const : "PENDING" as const,
        unitPrice: null,
        priceState: "PENDING" as const,
        provenance: patch.provenance,
      }));
      if (!replacements.length) continue;
      const replace = (lines: SolutionBomLine[]) => {
        const index = lines.findIndex((line) => line.id === parentId);
        if (index < 0) return lines;
        return [...lines.slice(0, index), ...replacements, ...lines.slice(index + 1)].filter((line, index, all) => all.findIndex((candidate) => candidate.id === line.id) === index);
      };
      next.engineering.bom = replace(next.engineering.bom);
      next.commercialSolution.bom = replace(next.commercialSolution.bom);
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
  next.commercialSolution.bom = next.commercialSolution.bom.map(projectCommercialBomLine);
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
  const content = bounded(normalizeCommercialText(decision.responseContent) || fallback, decision.responseMode === "RESEARCH_RESULT" ? 700 : 360);
  const recommendations = (decision.recommendations ?? []).slice(0, 3);
  const recommendationText = recommendations.length
    ? "\n" + recommendations.map((item) => "- " + bounded(item.title, 100) + (item.rationale ? ": " + bounded(item.rationale, 180) : "")).join("\n")
    : "";
  const question = decision.blockingQuestion ? bounded(normalizeCommercialText(decision.blockingQuestion) ?? "", 240) : "";
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
