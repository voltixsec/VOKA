import { PrismaCatalogItemRepository } from "@/features/catalog/infrastructure/prisma/PrismaCatalogItemRepository";
import { prisma } from "@/lib/prisma";
import type { CommercialSystemResearchPort } from "@/src/application/agentic-commercial-intelligence";
import type {
  CandidateProduct,
  SolutionCandidateResolverPort,
  SystemConfigurationGraph,
} from "@/src/application/conversation-runtime";

type ResearchResult = NonNullable<
  Awaited<ReturnType<CommercialSystemResearchPort["researchSystem"]>>
>;

const TARGET_OPTIONS = 3;

const PRIMARY_COMPONENT_KEYS = new Set([
  "CERAMIC_TILES",
  "CCTV_CAMERAS",
  "GYPSUM_BOARDS",
  "NVR_RECORDER",
  "ACCESS_CONTROL_CONTROLLER",
  "FIRE_ALARM_PANEL",
]);

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
}

function requirement(
  graph: SystemConfigurationGraph,
  key: string,
) {
  const current = graph.requirements.find((item) => item.key === key);
  return current ? String(current.value).trim() : null;
}

function primaryLines(graph: SystemConfigurationGraph) {
  const products = graph.salesBom.filter((line) => line.type === "PRODUCT");

  const explicitPrimary = products.filter((line) =>
    PRIMARY_COMPONENT_KEYS.has(line.id),
  );

  if (explicitPrimary.length) {
    return explicitPrimary;
  }

  return products.slice(0, 1);
}

function researchCandidate(
  product: NonNullable<ResearchResult["productAlternatives"]>[number],
  index: number,
): CandidateProduct {
  return {
    id: `research-${product.componentKey}-${index}-${product.sourceUrl}`,
    componentKey: product.componentKey,
    name: product.productName,
    nameAr: null,
    nameEn: product.productName,
    brand: product.brand,
    model: product.model,
    sku: null,
    price: null,
    source: "RESEARCHED",
    sourceUrl: product.sourceUrl,
    sourceTitle: product.sourceTitle,
    jurisdictionRelevance: product.jurisdictionRelevance,
    confidence: product.confidence,
    evidenceBasis: product.evidenceBasis,
    evidenceRole: product.evidenceRole,
  };
}

function candidateIdentity(candidate: CandidateProduct) {
  return [
    normalize(candidate.brand),
    normalize(candidate.model),
    normalize(candidate.name),
  ].filter(Boolean).join("|");
}

function mergeDistinct(
  existing: CandidateProduct[],
  incoming: CandidateProduct[],
  limit = TARGET_OPTIONS,
) {
  const result = [...existing];
  const seen = new Set(result.map(candidateIdentity));

  for (const candidate of incoming) {
    const key = candidateIdentity(candidate);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(candidate);

    if (result.length >= limit) break;
  }

  return result;
}

export class PrismaSolutionCandidateResolver
  implements SolutionCandidateResolverPort {
  constructor(
    private readonly research: CommercialSystemResearchPort | null,
    private readonly now = () => new Date().toISOString(),
    private readonly catalog: Pick<PrismaCatalogItemRepository, "findAll"> = new PrismaCatalogItemRepository(prisma),
  ) {}

  async resolve(
    input: Parameters<SolutionCandidateResolverPort["resolve"]>[0],
  ) {
    const lines = primaryLines(input.graph);

    if (!lines.length) {
      return {
        graph: {
          ...input.graph,
          candidateProducts: [],
          catalogResolution: "NOT_REQUIRED" as const,
        },
      };
    }

    const jurisdiction =
      requirement(input.graph, "system.jurisdiction");

    const qualityTier =
      requirement(input.graph, "system.qualityTier");

    const origin =
      requirement(input.graph, "product.origin");

    const preferredBrand =
      requirement(input.graph, "product.brand");

    const allCandidates: CandidateProduct[] = [];
    const researchModels: ResearchResult[] = [];
    let researchAttempted = false;
    let everyComponentComplete = true;

    for (const line of lines) {
      const queryParts = [
        input.locale === "ar" ? line.itemNameAr : line.itemNameEn,
        preferredBrand,
        origin,
      ].filter(Boolean) as string[];

      const catalogQueries = Array.from(
        new Set([
          queryParts.join(" ").trim(),
          line.itemNameEn.trim(),
          line.itemNameAr.trim(),
        ].filter(Boolean)),
      ).slice(0, 3);

      const catalogBatches = await Promise.all(
        catalogQueries.map((search) =>
          this.catalog.findAll({
            companyId: input.companyId,
            search,
            type: "PRODUCT",
            isActive: true,
            take: 6,
          }),
        ),
      );

      const catalogSeen = new Set<string>();

      const catalogCandidates = catalogBatches
        .flat()
        .flatMap((item): CandidateProduct[] => {
          const id = item.id.toString();

          if (catalogSeen.has(id)) return [];
          catalogSeen.add(id);

          return [{
            id,
            componentKey: line.id,
            name: item.name,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            brand: null,
            model: null,
            sku: item.sku,
            price: item.salePrice,
            source: "VERIFIED_CATALOG",
          }];
        });

      let componentCandidates =
        mergeDistinct([], catalogCandidates);

      if (
        componentCandidates.length < TARGET_OPTIONS &&
        input.allowResearchFallback &&
        this.research &&
        input.graph.system
      ) {
        researchAttempted = true;

        const remaining =
          TARGET_OPTIONS - componentCandidates.length;

        const searchIntent = [
          `Component key: ${line.id}. Find up to ${Math.max(remaining, TARGET_OPTIONS)} distinct real current product, brand, or model alternatives for: ${line.itemNameEn}.`,
          jurisdiction
            ? `Project market/jurisdiction: ${jurisdiction}.`
            : "",
          qualityTier
            ? `Requested quality tier: ${qualityTier}.`
            : "",
          origin
            ? `Preferred origin when suitable: ${origin}.`
            : "",
          preferredBrand
            ? `Preferred brand context: ${preferredBrand}.`
            : "",
          "Search broadly but truthfully.",
          "Use official manufacturer product pages first.",
          "Also search local distributors, suppliers, dealers, marketplaces, and public business/social pages when useful for market availability discovery.",
          "Public Facebook, Instagram, LinkedIn, YouTube, TikTok or similar pages may be used only for discovery/availability evidence, never as sole technical specification authority.",
          "Prefer sources relevant to the project country.",
          "Return genuinely different alternatives, not multiple pages for the same brand.",
          "Do not invent products, models, prices, availability, or compliance.",
        ].filter(Boolean).join(" ");

        const model = await this.research.researchSystem({
          companyId: input.companyId,
          query: searchIntent,
          locale: input.locale,
          jurisdiction,
        });

        if (model) {
          researchModels.push(model);
          const researched = (model.productAlternatives ?? [])
            .filter((product) => normalize(product.componentKey) === normalize(line.id))
            .sort((a, b) => b.confidence - a.confidence)
            .map((product, index) => researchCandidate(product, index));

          componentCandidates = mergeDistinct(
            componentCandidates,
            researched,
          );
        }
      }

      allCandidates.push(
        ...componentCandidates.slice(0, TARGET_OPTIONS),
      );
      if (componentCandidates.length < TARGET_OPTIONS) everyComponentComplete = false;
    }

    const hasResearch =
      allCandidates.some(
        (candidate) => candidate.source === "RESEARCHED",
      );

    const catalogResolution: SystemConfigurationGraph["catalogResolution"] =
      allCandidates.length === 0 || (!hasResearch && !everyComponentComplete)
        ? "CATALOG_INSUFFICIENT"
        : hasResearch
          ? "RESEARCHED_SUGGESTIONS"
          : "CATALOG_MATCHED";

    const researchEvidence =
      researchModels.flatMap((model) => model.evidence);

    const researchObservation =
      researchAttempted
        ? {
            kind: "RESEARCH" as const,
            status:
              researchModels.length > 0
                ? "COMPLETED" as const
                : "UNAVAILABLE" as const,
            summary: JSON.stringify({
              type: "PRODUCT_MARKET_OPTIONS",
              jurisdiction,
              qualityTier,
              options: allCandidates.slice(0, 12).map((candidate) => ({
                componentKey: candidate.componentKey,
                name: candidate.name,
                brand: candidate.brand,
                model: candidate.model,
                source: candidate.source,
                sourceUrl: candidate.sourceUrl ?? null,
              })),
            }).slice(0, 2_000),
            evidence: researchEvidence
              .filter(
                (source, index, all) =>
                  all.findIndex(
                    (candidate) =>
                      candidate.url === source.url,
                  ) === index,
              )
              .slice(0, 10)
              .map(({ title, url, publisher }) => ({
                title,
                url,
                publisher,
              })),
            createdAt: this.now(),
          }
        : undefined;

    return {
      graph: {
        ...input.graph,
        candidateProducts: allCandidates,
        catalogResolution,
      },
      ...(researchObservation
        ? { researchObservation }
        : {}),
    };
  }
}
