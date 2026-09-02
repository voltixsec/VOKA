import type { CommercialSystemResearchPort } from "@/src/application/agentic-commercial-intelligence";
import type { ConversationToolPort, SolutionCandidateResolverPort, ToolObservation } from "@/src/application/conversation-runtime";

export class ConversationToolRegistry implements ConversationToolPort {
  constructor(private readonly research: CommercialSystemResearchPort | null, private readonly candidates: SolutionCandidateResolverPort | null, private readonly now = () => new Date().toISOString()) {}

  async execute(input: Parameters<ConversationToolPort["execute"]>[0]): Promise<ToolObservation> {
    if (["ATTACHMENT_INSPECTION", "DRAWING_INSPECTION", "BOQ_INSPECTION"].includes(input.request.kind) && !input.request.attachmentId) return { kind: input.request.kind, status: "ATTACHMENT_REQUIRED", summary: "The referenced evidence must be attached before it can be inspected.", evidence: [], createdAt: this.now() };
    if (input.request.kind === "CATALOG_LOOKUP" && this.candidates) {
      const resolved = await this.candidates.resolve({ graph: input.graph, companyId: input.companyId, locale: input.locale, mode: "CATALOG_ONLY", query: input.request.query, requestedCount: requestedCount(input.request.query) });
      return {
        kind: "CATALOG_LOOKUP",
        status: resolved.graph.candidateProducts.length ? "COMPLETED" : "UNAVAILABLE",
        summary: resolved.graph.catalogResolution === "CATALOG_MATCHED" ? "Company catalog contains enough reliable product options." : "Company catalog does not contain enough reliable product options.",
        evidence: [],
        candidateProducts: resolved.graph.candidateProducts,
        catalogResolution: resolved.graph.catalogResolution,
        createdAt: this.now(),
      };
    }
    if (input.request.kind === "RESEARCH" && this.candidates && input.graph.catalogResolution === "CATALOG_INSUFFICIENT") {
      const resolved = await this.candidates.resolve({ graph: input.graph, companyId: input.companyId, locale: input.locale, mode: "WEB_FALLBACK", query: input.request.query, requestedCount: requestedCount(input.request.query) });
      if (resolved.researchObservation) return { ...resolved.researchObservation, purpose: input.request.purpose ?? "PRODUCT_RESEARCH", candidateProducts: resolved.graph.candidateProducts, catalogResolution: resolved.graph.catalogResolution };
    }
    if (input.request.kind === "RESEARCH" && this.research) {
      const jurisdiction = input.graph.requirements.find((requirement) => requirement.key === "system.jurisdiction")?.value;
      const researchInput = { companyId: input.companyId, query: input.request.query, locale: input.locale, jurisdiction: jurisdiction == null ? null : String(jurisdiction) };
      const detailed = this.research.researchSystemWithDiagnostic ? await this.research.researchSystemWithDiagnostic(researchInput) : null;
      const result = detailed ? detailed.model : await this.research.researchSystem(researchInput);
      if (result) {
        const engineeringRules = (result.engineeringRules ?? []).filter((rule) =>
          rule.jurisdiction.normalize("NFKC").toLocaleLowerCase() === (jurisdiction == null ? "" : String(jurisdiction)).normalize("NFKC").toLocaleLowerCase()
          && ["GOVERNMENT_AUTHORITY", "STANDARDS_ORGANIZATION"].includes(rule.sourceType)
          && result.evidence.some((source) => source.url === rule.authoritySourceUrl && source.sourceType === rule.sourceType),
        );
        const usable = input.request.purpose === "JURISDICTION_RULE" ? engineeringRules.length > 0 : result.evidence.length > 0;
        return { kind: "RESEARCH", purpose: input.request.purpose, status: usable ? "COMPLETED" : "UNAVAILABLE", summary: [result.purpose, ...result.limitations].filter(Boolean).join(" ").slice(0, 2_000), evidence: result.evidence.map(({ title, url, publisher }) => ({ title, url, publisher })), engineeringRules, createdAt: this.now() };
      }
      if (detailed?.diagnostic) return { kind: "RESEARCH", purpose: input.request.purpose, status: "UNAVAILABLE", summary: detailed.diagnostic, evidence: [], createdAt: this.now() };
    }
    return { kind: input.request.kind, purpose: input.request.purpose, status: "UNAVAILABLE", summary: "This capability is not connected in the clean runtime yet.", evidence: [], createdAt: this.now() };
  }
}

function requestedCount(query: string) {
  const match = query.normalize("NFKC").match(/(?:top|best|أفضل|احسن|أحسن)\s*([1-3١-٣])|([1-3١-٣])\s*(?:options?|choices?|alternatives?|اختيارات|خيارات|بدائل|ماركات)/iu);
  const value = match?.[1] ?? match?.[2];
  if (!value) return 3;
  const arabicDigits: Record<string, number> = { "١": 1, "٢": 2, "٣": 3 };
  return arabicDigits[value] ?? Number(value);
}
