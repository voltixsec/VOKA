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
    if (!input.runtimeId.trim()) throw new Error("REQUIREMENT_RUNTIME_REQUIRED");
    const system = input.graph.system;
    if (!system) return;
    const requirements = input.graph.requirements.map((requirement) => ({
      stableKey: `runtime:${input.runtimeId}:requirement:${requirement.key}`,
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
    const lines = input.graph.engineeringBom.map((line) => this.lineRequirement(input.runtimeId, system.key, line, input.facts));
    for (const item of [...requirements, ...lines]) {
      await prisma.requirement.upsert({
        where: { companyId_stableKey: { companyId: input.companyId, stableKey: item.stableKey } },
        create: { companyId: input.companyId, stableKey: item.stableKey, sourceContext: "SALES_ASSISTANT", description: item.description, quantity: item.quantity, unit: item.unit, technicalRequirement: item.technicalRequirement, quantityStatus: item.quantityStatus, reviewState: item.reviewState, systemKey: item.systemKey, componentKey: item.componentKey, provenance: item.provenance, correctionTrace: { runtimeFacts: input.facts } as object, createdByUserId: input.userId },
        update: { revision: { increment: 1 }, description: item.description, quantity: item.quantity, unit: item.unit, technicalRequirement: item.technicalRequirement, quantityStatus: item.quantityStatus, reviewState: item.reviewState, systemKey: item.systemKey, componentKey: item.componentKey, provenance: item.provenance, correctionTrace: { runtimeFacts: input.facts } as object },
        select: { id: true },
      });
      // Graph facts do not carry a verified claim-to-citation mapping. Leave evidence unlinked.

    }
  }

  private lineRequirement(runtimeId: string, systemKey: string, line: SolutionBomLine, facts: Record<string, ConfirmedFact>) {
    const fact = facts[`system.${line.id}.quantity`] ?? facts[`system.quantity`];
    const quantity = line.quantity;
    return {
      stableKey: `runtime:${runtimeId}:${systemKey}:component:${line.id}`,
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
