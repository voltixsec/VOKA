import { prisma } from "@/lib/prisma";
import type { NormalizedRequirementPort } from "@/src/application/source-artifacts";
import type { ConfirmedFact, SolutionBomLine } from "@/src/application/conversation-runtime";

function factFor(facts: Record<string, ConfirmedFact>, key: string) {
  return facts[key];
}

function reviewState(fact: ConfirmedFact | undefined, quantity: number | null) {
  return quantity !== null && fact && ["USER_EXPLICIT", "USER_CORRECTION", "USER_APPROVED", "VERIFIED_DOCUMENT", "VERIFIED_DATABASE"].includes(fact.provenance) ? "CONFIRMED" as const : "NEEDS_REVIEW" as const;
}

export class PrismaNormalizedRequirementRepository implements NormalizedRequirementPort {
  async synchronize(input: Parameters<NormalizedRequirementPort["synchronize"]>[0]) {
    const system = input.graph.system;
    if (!system) return;
    const requirements = input.graph.requirements.map((requirement) => ({
      stableKey: `runtime:${requirement.key}`,
      description: requirement.labelEn,
      quantity: typeof requirement.value === "number" ? requirement.value : null,
      unit: null,
      technicalRequirement: typeof requirement.value === "string" ? requirement.value : String(requirement.value),
      quantityStatus: typeof requirement.value === "number" ? "USER_PROVIDED" as const : "UNKNOWN" as const,
      reviewState: reviewState(factFor(input.facts, requirement.key), typeof requirement.value === "number" ? requirement.value : null),
      systemKey: system.key,
      componentKey: null,
      provenance: factFor(input.facts, requirement.key)?.provenance ?? "GOVERNED_WORKSPACE",
    }));
    const lines = input.graph.engineeringBom.map((line) => this.lineRequirement(system.key, line, input.facts));
    for (const item of [...requirements, ...lines]) {
      const requirement = await prisma.requirement.upsert({
        where: { companyId_stableKey: { companyId: input.companyId, stableKey: item.stableKey } },
        create: { companyId: input.companyId, stableKey: item.stableKey, sourceContext: "SALES_ASSISTANT", description: item.description, quantity: item.quantity, unit: item.unit, technicalRequirement: item.technicalRequirement, quantityStatus: item.quantityStatus, reviewState: item.reviewState, systemKey: item.systemKey, componentKey: item.componentKey, provenance: item.provenance, correctionTrace: { runtimeFacts: input.facts } as object, createdByUserId: input.userId },
        update: { revision: { increment: 1 }, description: item.description, quantity: item.quantity, unit: item.unit, technicalRequirement: item.technicalRequirement, quantityStatus: item.quantityStatus, reviewState: item.reviewState, systemKey: item.systemKey, componentKey: item.componentKey, provenance: item.provenance, correctionTrace: { runtimeFacts: input.facts } as object },
        select: { id: true },
      });
      for (const citation of input.citations) {
        if (!citation.id) continue;
        const owned = await prisma.citation.findFirst({ where: { id: citation.id, companyId: input.companyId }, select: { id: true } });
        if (!owned) continue;
        await prisma.requirementCitation.upsert({ where: { requirementId_citationId: { requirementId: requirement.id, citationId: citation.id } }, create: { requirementId: requirement.id, citationId: citation.id, claimSummary: citation.supportedClaimSummary }, update: { claimSummary: citation.supportedClaimSummary } });
      }
    }
  }

  private lineRequirement(systemKey: string, line: SolutionBomLine, facts: Record<string, ConfirmedFact>) {
    const fact = facts[`system.${line.id}.quantity`] ?? facts[`system.quantity`];
    const quantity = line.quantity;
    return {
      stableKey: `runtime:${systemKey}:component:${line.id}`,
      description: line.itemNameEn,
      quantity,
      unit: line.unitName,
      technicalRequirement: line.description ?? line.itemNameEn,
      quantityStatus: line.quantityState === "CONFIRMED" ? "DETERMINISTIC" as const : "UNKNOWN" as const,
      reviewState: reviewState(fact, quantity),
      systemKey,
      componentKey: line.id,
      provenance: line.provenance,
    };
  }
}
