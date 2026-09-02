import { PrismaCatalogItemRepository } from "@/features/catalog/infrastructure/prisma/PrismaCatalogItemRepository";
import { prisma } from "@/lib/prisma";
import type { CommercialSystemResearchPort, ResearchDiagnosticCode } from "@/src/application/agentic-commercial-intelligence";
import type {
  CandidateProduct,
  SolutionBomLine,
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
  "SURVEILLANCE_HDD",
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

  if (products.length) return products.slice(0, 1);

  if (!graph.system) return [];

  return [{
    id: `${graph.system.key}_SYSTEM`,
    componentKeys: [`${graph.system.key}_SYSTEM`],
    category: "PRODUCT",
    itemName: graph.system.nameEn,
    itemNameAr: graph.system.nameAr,
    itemNameEn: graph.system.nameEn,
    unitName: null,
    quantity: null,
    quantityState: "PENDING",
    unitPrice: null,
    priceState: "PENDING",
    type: "PRODUCT",
    provenance: "AI_INFERRED",
  } satisfies SolutionBomLine];
}

function researchCandidate(
  product: NonNullable<ResearchResult["productAlternatives"]>[number],
  index: number,
): CandidateProduct | null {
  const name = product.productName.trim();
  const brand = product.brand?.trim() || null;
  const model = product.model?.trim() || null;
  let host = "";
  try { host = new URL(product.sourceUrl).hostname.replace(/^www\./, "").split(".")[0] ?? ""; } catch { return null; }
  const identityTokens = [normalize(name), normalize(brand), normalize(model)].filter(Boolean);
  const forbidden = new Set([normalize(host), "facebook", "instagram", "linkedin", "youtube", "tiktok", "amazon", "noon", "google"]);
  if (!name || (!brand && !model) || identityTokens.every((value) => forbidden.has(value))) return null;
  return {
    id: `research-${product.componentKey}-${index}-${product.sourceUrl}`,
    componentKey: product.componentKey,
    name,
    nameAr: null,
    nameEn: product.productName,
    brand,
    model,
    sku: null,
    price: null,
    source: "RESEARCHED",
    sourceUrl: product.sourceUrl,
    sourceTitle: product.sourceTitle,
    jurisdictionRelevance: product.jurisdictionRelevance,
    confidence: product.confidence,
    evidenceBasis: product.evidenceBasis,
    evidenceRole: product.evidenceRole,
    imageUrl: product.imageUrl ?? null,
    marketPrice: product.marketPrice ?? null,
    capabilities: product.capabilities ?? null,
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
    const requestedCount = Math.max(1, Math.min(3, Math.floor(input.requestedCount) || TARGET_OPTIONS));

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

    let allCandidates = input.mode === "WEB_FALLBACK"
      ? input.graph.candidateProducts.slice(0, requestedCount)
      : [];

    if (input.mode === "CATALOG_ONLY") for (const line of lines) {
      if (allCandidates.length >= requestedCount) break;
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

      allCandidates = mergeDistinct(allCandidates, catalogCandidates, requestedCount);
    }

    if (input.mode === "CATALOG_ONLY") {
      return {
        graph: {
          ...input.graph,
          candidateProducts: allCandidates,
          catalogResolution: allCandidates.length >= requestedCount ? "CATALOG_MATCHED" as const : "CATALOG_INSUFFICIENT" as const,
        },
      };
    }

    const remaining = requestedCount - allCandidates.length;
    let model: ResearchResult | null = null;
    let diagnostic: ResearchDiagnosticCode | null = null;
    if (remaining > 0 && this.research && input.graph.system) {
      const requestedComponents = lines.map((line) => ({ componentKey: line.id, product: line.itemNameEn }));
      const explicitSpecifications = input.graph.requirements.map((item) => `${item.labelEn}: ${item.value}`).join(", ");
      const searchIntent = [
        input.query,
        requestedComponents.map((item) => item.product).join("; "),
        explicitSpecifications ? `Required specifications: ${explicitSpecifications}.` : "",
        `Find up to ${remaining} distinct real current product alternatives total for these exact component keys: ${JSON.stringify(requestedComponents)}.`,
        jurisdiction ? `Target market: ${jurisdiction}. Prefer manufacturer, authorized distributor, or reputable supplier serving ${jurisdiction}; include local availability and listed market-price evidence when explicit.` : "",
        qualityTier ? `Requested quality tier: ${qualityTier}.` : "",
        origin ? `Preferred origin when suitable: ${origin}.` : "",
        preferredBrand ? `Preferred brand context: ${preferredBrand}.` : "",
        "Use official manufacturer product pages first and local market sources only as supporting availability evidence.",
        "Return genuinely different products, never page titles or publisher names as product identities.",
        "Do not invent products, models, prices, availability, or compliance.",
      ].filter(Boolean).join(" ");
      const researchInput = { companyId: input.companyId, query: searchIntent, locale: input.locale, jurisdiction };
      if (this.research.researchSystemWithDiagnostic) {
        const result = await this.research.researchSystemWithDiagnostic(researchInput);
        model = result.model; diagnostic = result.diagnostic;
      } else model = await this.research.researchSystem(researchInput);
    }

    const componentKeys = new Set(lines.map((line) => normalize(line.id)));
    const candidatesBeforeResearch = new Set(allCandidates.map((candidate) => candidate.id));
    const researched = (model?.productAlternatives ?? [])
      .filter((product) => componentKeys.has(normalize(product.componentKey)))
      .sort((a, b) => localRank(b, jurisdiction) - localRank(a, jurisdiction) || b.confidence - a.confidence)
      .map((product, index) => researchCandidate(product, index))
      .filter((candidate): candidate is CandidateProduct => candidate !== null);
    allCandidates = mergeDistinct(allCandidates, researched, requestedCount);
    const usableResearchCount = allCandidates.filter((candidate) => candidate.source === "RESEARCHED" && !candidatesBeforeResearch.has(candidate.id)).length;
    const evidence = (model?.evidence ?? [])
      .filter((source, index, values) => values.findIndex((candidate) => candidate.url === source.url) === index)
      .slice(0, 10)
      .map(({ title, url, publisher }) => ({ title, url, publisher }));
    const researchObservation = {
      kind: "RESEARCH" as const,
      status: usableResearchCount > 0 ? "COMPLETED" as const : "UNAVAILABLE" as const,
      summary: usableResearchCount > 0
        ? JSON.stringify({ type: "PRODUCT_MARKET_OPTIONS", candidateCount: allCandidates.length, researchedCandidateCount: usableResearchCount }).slice(0, 2_000)
        : diagnostic ?? (model?.productAlternatives?.length ? "WEB_SEARCH_ALL_CANDIDATES_REJECTED" : model ? "WEB_SEARCH_NO_NORMALIZABLE_PRODUCTS" : "WEB_SEARCH_PROVIDER_FAILURE"),
      evidence,
      createdAt: this.now(),
    };

    return {
      graph: {
        ...input.graph,
        candidateProducts: allCandidates,
        catalogResolution: usableResearchCount > 0 ? "RESEARCHED_SUGGESTIONS" as const : "CATALOG_INSUFFICIENT" as const,
      },
      researchObservation,
    };
  }
}

function localRank(product: NonNullable<ResearchResult["productAlternatives"]>[number], jurisdiction: string | null) {
  if (!jurisdiction) return product.evidenceRole === "GLOBAL_PRODUCT_AUTHORITY" ? 20 : 0;
  const relevant = normalize(product.jurisdictionRelevance).includes(normalize(jurisdiction));
  if (product.evidenceRole === "LOCAL_SUPPLIER_EVIDENCE" && relevant) return 100;
  if ((product.evidenceRole === "AVAILABILITY" || product.evidenceRole === "TECHNICAL_AND_AVAILABILITY") && relevant) return 75;
  if (product.evidenceRole === "GLOBAL_PRODUCT_AUTHORITY") return 35;
  return relevant ? 45 : 0;
}
