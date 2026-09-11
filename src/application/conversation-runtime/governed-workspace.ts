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
import { resolveEngineeringState } from "./solution-graph";
import { applyApprovedProductSelection } from "./solution-graph";
import { quotationScopeLabel } from "./scope-labels";

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

function unselectedProposal(line: SolutionBomLine): SolutionBomLine {
  return { ...line, baseItemNameAr: undefined, baseItemNameEn: undefined, brand: null, model: null,
    catalogItemId: null, capabilities: null, marketPrice: null, productSelectionStatus: "GENERIC",
    pricingStatus: "PENDING", unitPrice: null, priceState: "PENDING" };
}

function governedBom(
  prior: SolutionBomLine[] | undefined,
  generated: SolutionBomLine[],
  sameSystem: boolean,
) {
  if (!sameSystem || !prior?.length) return generated;
  if (!generated.length) return prior;
  // Older signed workspaces predate explicit lineage. Retain their known camera split.
  const parentOf = (line: SolutionBomLine) => line.structuralParentId
    ?? (["CCTV_BULLET_CAMERA", "CCTV_DOME_CAMERA"].includes(line.id) ? "CCTV_CAMERAS" : null);
  const children = prior.filter((line) => parentOf(line));
  const result = generated.flatMap((line) => {
    const replacements = children.filter((child) => parentOf(child) === line.id);
    if (replacements.length) {
      const total = replacements.reduce((sum, child) => sum + (child.quantity ?? 0), 0);
      const conflict = line.quantity !== null && replacements.every((child) => child.quantity !== null) && total !== line.quantity;
      return replacements.map((child) => ({ ...child, structuralParentId: line.id,
        ...(conflict ? { engineeringStatus: "CONFLICT" as const, assumptions: ["The structural quantities do not match the current required total; review the split."] } : {}),
      }));
    }
    return [line];
  });
  const generatedIds = new Set(generated.map((line) => line.id));
  const resultIds = new Set(result.map((line) => line.id));
  return [...result, ...prior.filter((line) => !resultIds.has(line.id) && !parentOf(line)
    && !generatedIds.has(line.id) && ["USER_EXPLICIT", "USER_CORRECTION", "USER_APPROVED"].includes(line.provenance))];
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
      candidates: [...new Map([
        ...(sameSystem ? prior?.products.candidates.filter((candidate) => approvedCandidateIds.includes(candidate.id)) ?? [] : []),
        ...(graph.candidateProducts.length ? graph.candidateProducts : sameSystem ? prior?.products.candidates ?? [] : []),
      ].map((candidate) => [candidate.id, candidate])).values()],
      approvedCandidateIds: [...new Set(approvedCandidateIds)],
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
    readiness: {
      ...(commercialBom.some((line) => line.engineeringStatus === "CONFLICT")
        ? { ...graph.readiness, pendingBeforeFinalIssue: [...new Set([...graph.readiness.pendingBeforeFinalIssue, "Compatibility review"])] }
        : graph.readiness),
      // The workspace is the governed authority: its engineering state reflects the effective (retained) BOM, never an assumed one.
      engineeringState: resolveEngineeringState({ ...graph, engineeringBom }),
    },
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
        ...unselectedProposal(line),
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
      const parent = next.engineering.bom.find((line) => line.id === parentId);
      if (!parent) continue;
      const canConfirmQuantity = patch.provenance === "USER_EXPLICIT" || patch.provenance === "USER_CORRECTION";
      const replacements = (Array.isArray(patch.value) ? patch.value : [patch.value]).filter(isSafeBomLine).map((line) => ({
        ...unselectedProposal(line),
        structuralParentId: parent.structuralParentId ?? parentId,
        commercialAttributes: { ...parent.commercialAttributes, ...line.commercialAttributes,
          ...(parentId === "CCTV_CAMERAS" && /BULLET|DOME/.test(line.id) ? { subtype: /BULLET/.test(line.id) ? "Bullet" : "Dome" } : {}),
        },
        quantity: canConfirmQuantity ? line.quantity ?? null : null,
        quantityState: canConfirmQuantity && line.quantity != null ? "CONFIRMED" as const : "PENDING" as const,
        unitPrice: null,
        priceState: "PENDING" as const,
        provenance: patch.provenance,
      }));
      if (!replacements.length) continue;
      // A structural split cannot steal another existing component's slot or lineage.
      const otherIds = new Set(next.engineering.bom.filter((line) => line.id !== parentId).map((line) => line.id));
      if (new Set(replacements.map((line) => line.id)).size !== replacements.length
        || replacements.some((line) => otherIds.has(line.id) || line.componentKeys.some((key) => otherIds.has(key)))) continue;
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
    // Product approval/rejection is reduced to selection facts by the runtime.
    // A presentation patch must never create a second approval authority.
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

export function renderGovernedResponse(decision: FlexibleTurnProposal, locale: ConversationLocale, workspace?: GovernedWorkspaceState) {
  if (workspace?.commercialContext.scope) {
    const redundantQuestion = (value: string) => /(?:what(?:\s+is|'s)\s+(?:the\s+)?scope|(?:supply\s+only).*(?:or|and).*installation|(?:ما\s+(?:هو\s+)?(?:نطاق|النطاق)|(?:نطاق|النطاق).*?(?:إيه|ايه)|توريد\s+فقط.*(?:ولا|أم|او|أو).*تركيب)|where.*terms.*(?:come|from)|(?:مصدر|منين).*الشروط)/iu.test(value);
    const scopeReply = locale === "ar" ? `النطاق المحدد: ${quotationScopeLabel(workspace.commercialContext.scope, locale)}. شروط العرض من إعدادات الشركة لهذا النطاق.` : `Scope: ${quotationScopeLabel(workspace.commercialContext.scope, locale)}. Quotation terms come from Company Settings for this scope.`;
    decision = { ...decision,
      responseContent: redundantQuestion(decision.responseContent) && /[?؟]/u.test(decision.responseContent) ? scopeReply : decision.responseContent,
      blockingQuestion: decision.blockingQuestion && redundantQuestion(decision.blockingQuestion) ? null : decision.blockingQuestion,
    };
  }
  const proposedText = [decision.responseContent, decision.blockingQuestion, ...decision.recommendations.flatMap((item) => [item.title, item.rationale])].join(" ");
  const approvalText = proposedText.replace(/(?:not\s+(?:yet\s+)?approved|unapproved|لم\s+(?:أعتمد|اعتمد)|غير\s+معتمد)/giu, "");
  const approvalClaim = /(?:تم\s+اعتماد|اعتمدنا|(?:المنتج|المنتجات|الاختيار)\s+معتمد|approved\b)/iu.test(approvalText);
  if (workspace && approvalClaim) {
    const approved = workspace.commercialSolution.bom.filter((line) => line.productSelectionStatus === "SELECTED"
      && workspace.products.candidates.some((candidate) => candidate.componentKey === line.id && workspace.products.approvedCandidateIds.includes(candidate.id)));
    const names = approved.map((line) => [line.brand, line.model].filter(Boolean).join(" ") || (locale === "ar" ? line.itemNameAr : line.itemNameEn));
    return names.length ? locale === "ar"
      ? `المنتجات المعتمدة في الحل: ${names.join("، ")}. الكميات الهندسية والتسعير يحتفظان بحالة المراجعة الخاصة بهما.`
      : `Approved products in the solution: ${names.join(", ")}. Engineering quantities and pricing retain their separate review states.`
      : locale === "ar" ? "لم يتم اعتماد أي منتج في الحل بعد. يمكننا مراجعة الخيارات وتأكيد الاختيار." : "No product is approved in the solution yet. We can review the options and confirm a selection.";
  }
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
