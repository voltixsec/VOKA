import { PrismaCatalogItemRepository } from "@/features/catalog/infrastructure/prisma/PrismaCatalogItemRepository";
import { prisma } from "@/lib/prisma";
import type { CommercialSystemResearchPort } from "@/src/application/agentic-commercial-intelligence";
import type { SolutionCandidateResolverPort } from "@/src/application/conversation-runtime";

export class PrismaSolutionCandidateResolver implements SolutionCandidateResolverPort {
  private readonly catalog = new PrismaCatalogItemRepository(prisma);
  constructor(private readonly research: CommercialSystemResearchPort | null, private readonly now = () => new Date().toISOString()) {}

  async resolve(input: Parameters<SolutionCandidateResolverPort["resolve"]>[0]) {
    const productLines = input.graph.salesBom.filter((line) => line.type === "PRODUCT").slice(0, 12);
    const preference = input.graph.requirements.filter((item) => item.key.startsWith("product.")).map((item) => String(item.value)).join(" ");
    const batches = await Promise.all(productLines.map(async (line) => ({ line, items: await this.catalog.findAll({ companyId: input.companyId, search: `${input.locale === "ar" ? line.itemNameAr : line.itemNameEn} ${preference}`.trim(), type: "PRODUCT", isActive: true, take: 5 }) })));
    const seen = new Set<string>();
    const catalogCandidates = batches.flatMap(({ line, items }) => items.flatMap((item) => {
      const id = item.id.toString();
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ id, componentKey: line.id, name: item.name, nameAr: item.nameAr, nameEn: item.nameEn, brand: null, model: null, sku: item.sku, price: item.salePrice, source: "VERIFIED_CATALOG" as const }];
    }));
    if (catalogCandidates.length) return { graph: { ...input.graph, candidateProducts: catalogCandidates, catalogResolution: "CATALOG_MATCHED" as const } };
    if (!input.allowResearchFallback || !this.research || !input.graph.system) return { graph: { ...input.graph, catalogResolution: "CATALOG_INSUFFICIENT" as const } };
    const model = await this.research.researchSystem({ companyId: input.companyId, query: `${input.graph.system.nameEn} mid-tier product options and manufacturer technical sources`, locale: input.locale, jurisdiction: null });
    if (!model) return { graph: { ...input.graph, catalogResolution: "CATALOG_INSUFFICIENT" as const } };
    const researchCandidates = model.evidence.filter((source) => source.sourceType === "MANUFACTURER_PRODUCT" || source.sourceType === "MANUFACTURER_TECHNICAL").slice(0, 6).map((source, index) => ({ id: `research-${index}-${source.url}`, componentKey: productLines[0]?.id ?? input.graph.system!.key, name: source.title, nameAr: null, nameEn: source.title, brand: source.publisher || null, model: null, sku: null, price: null, source: "RESEARCHED" as const, sourceUrl: source.url }));
    const observation = { kind: "RESEARCH" as const, status: "COMPLETED" as const, summary: [model.purpose, ...model.limitations].join(" ").slice(0, 2_000), evidence: model.evidence.map(({ title, url, publisher }) => ({ title, url, publisher })), createdAt: this.now() };
    return { graph: { ...input.graph, candidateProducts: researchCandidates, catalogResolution: "RESEARCHED_SUGGESTIONS" as const }, researchObservation: observation };
  }
}
