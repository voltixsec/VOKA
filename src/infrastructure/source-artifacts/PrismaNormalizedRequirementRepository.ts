import { prisma } from "@/lib/prisma";
import { requirementStableKey, runtimeComponentRequirementKey, runtimeFactRequirementKey, type NormalizedRequirementPort } from "@/src/application/source-artifacts";
import type { ConfirmedFact, SolutionBomLine, ToolCitation } from "@/src/application/conversation-runtime";

function factFor(facts: Record<string, ConfirmedFact>, key: string) {
  return facts[key];
}

function reviewState(fact: ConfirmedFact | undefined, quantity: number | null) {
  return quantity !== null && fact && ["USER_EXPLICIT", "USER_CORRECTION", "USER_APPROVED", "VERIFIED_DOCUMENT", "VERIFIED_DATABASE"].includes(fact.provenance) ? "CONFIRMED" as const : "NEEDS_REVIEW" as const;
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

type RequirementRow = {
  stableKey: string; description: string; quantity: number | null; unit: string | null; technicalRequirement: string;
  quantityStatus: "USER_PROVIDED" | "DETERMINISTIC" | "UNKNOWN"; reviewState: "CONFIRMED" | "NEEDS_REVIEW";
  systemKey: string; componentKey: string | null; provenance: string;
  /** Text the requirement is about; a citation is linked only when its claim summary demonstrably contains it. */
  claimTerms: string[];
};

/**
 * Claim-specific linkage: a citation is attached to a requirement only when the citation's own supported-claim text
 * contains the requirement's identifying value or name. Anything less certain stays unlinked (pending review).
 */
export function citationsSupportingRequirement(citations: ToolCitation[], claimTerms: string[]) {
  const terms = claimTerms.map(normalize).filter((term) => term.length >= 2);
  if (!terms.length) return [];
  return citations.filter((citation) => {
    if (!citation.id) return false;
    const claim = normalize(citation.supportedClaimSummary);
    return claim.length > 0 && terms.some((term) => claim.includes(term));
  });
}

export class PrismaNormalizedRequirementRepository implements NormalizedRequirementPort {
  async synchronize(input: Parameters<NormalizedRequirementPort["synchronize"]>[0]) {
    const system = input.graph.system;
    if (!system) return;
    // Scope = tenant (unique key) + conversation runtime (stable key) + structural key; edits in the same conversation
    // keep updating the same rows, while other conversations with identical structures never collide.
    const scope = { context: "SALES_ASSISTANT" as const, conversationRuntimeId: input.conversationRuntimeId };
    const requirements: RequirementRow[] = input.graph.requirements.map((requirement) => {
      const quantity = typeof requirement.value === "number" ? requirement.value : null;
      const valueText = typeof requirement.value === "string" ? requirement.value : String(requirement.value);
      return {
        stableKey: requirementStableKey(scope, runtimeFactRequirementKey(requirement.key)),
        description: requirement.labelEn,
        quantity,
        unit: null,
        technicalRequirement: valueText,
        quantityStatus: quantity !== null ? "USER_PROVIDED" as const : "UNKNOWN" as const,
        reviewState: reviewState(factFor(input.facts, requirement.key), quantity),
        systemKey: system.key,
        componentKey: null,
        provenance: factFor(input.facts, requirement.key)?.provenance ?? "GOVERNED_WORKSPACE",
        claimTerms: typeof requirement.value === "string" ? [requirement.value] : [],
      };
    });
    const lines = input.graph.engineeringBom.map((line) => this.lineRequirement(scope, system.key, line, input.facts));
    const ownedCitationIds = new Set<string>();
    const citationIds = input.citations.flatMap((citation) => citation.id ? [citation.id] : []);
    if (citationIds.length) {
      for (const owned of await prisma.citation.findMany({ where: { id: { in: citationIds }, companyId: input.companyId }, select: { id: true } })) ownedCitationIds.add(owned.id);
    }
    for (const item of [...requirements, ...lines]) {
      const requirement = await prisma.requirement.upsert({
        where: { companyId_stableKey: { companyId: input.companyId, stableKey: item.stableKey } },
        create: { companyId: input.companyId, stableKey: item.stableKey, sourceContext: "SALES_ASSISTANT", description: item.description, quantity: item.quantity, unit: item.unit, technicalRequirement: item.technicalRequirement, quantityStatus: item.quantityStatus, reviewState: item.reviewState, systemKey: item.systemKey, componentKey: item.componentKey, provenance: item.provenance, correctionTrace: { conversationRuntimeId: input.conversationRuntimeId, runtimeFacts: input.facts } as object, createdByUserId: input.userId },
        update: { revision: { increment: 1 }, description: item.description, quantity: item.quantity, unit: item.unit, technicalRequirement: item.technicalRequirement, quantityStatus: item.quantityStatus, reviewState: item.reviewState, systemKey: item.systemKey, componentKey: item.componentKey, provenance: item.provenance, correctionTrace: { conversationRuntimeId: input.conversationRuntimeId, runtimeFacts: input.facts } as object },
        select: { id: true },
      });
      for (const citation of citationsSupportingRequirement(input.citations, item.claimTerms)) {
        if (!citation.id || !ownedCitationIds.has(citation.id)) continue;
        await prisma.requirementCitation.upsert({ where: { requirementId_citationId: { requirementId: requirement.id, citationId: citation.id } }, create: { requirementId: requirement.id, citationId: citation.id, claimSummary: citation.supportedClaimSummary }, update: { claimSummary: citation.supportedClaimSummary } });
      }
    }
  }

  private lineRequirement(scope: { context: "SALES_ASSISTANT"; conversationRuntimeId: string }, systemKey: string, line: SolutionBomLine, facts: Record<string, ConfirmedFact>): RequirementRow {
    const fact = facts[`system.${line.id}.quantity`] ?? facts[`system.quantity`];
    const quantity = line.quantity;
    return {
      stableKey: requirementStableKey(scope, runtimeComponentRequirementKey(systemKey, line.id)),
      description: line.itemNameEn,
      quantity,
      unit: line.unitName,
      technicalRequirement: line.description ?? line.itemNameEn,
      quantityStatus: line.quantityState === "CONFIRMED" ? "DETERMINISTIC" as const : "UNKNOWN" as const,
      reviewState: reviewState(fact, quantity),
      systemKey,
      componentKey: line.id,
      provenance: line.provenance,
      claimTerms: [line.itemNameEn, line.itemNameAr, ...(line.model ? [line.model] : [])],
    };
  }
}
