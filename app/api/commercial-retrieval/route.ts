import { CatalogItemType } from "@/features/catalog";
import {
  PrismaHybridRetrievalRepository,
  RetrieveCommercialCandidates,
  toAICandidateProjection,
  SearchStrategy,
} from "@/features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaHybridRetrievalRepository(prisma);
const retrieveCommercialCandidates = new RetrieveCommercialCandidates(repository);

const allowedTypes: CatalogItemType[] = [
  "PRODUCT",
  "SERVICE",
  "SHIPPING",
  "LABOR",
  "DISCOUNT",
  "CUSTOM",
];

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 50) {
    throw ApiError.badRequest(
      "INVALID_LIMIT",
      "limit must be an integer between 1 and 50.",
      { field: "limit" }
    );
  }
  return parsed;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw ApiError.badRequest(
    "INVALID_BOOLEAN",
    "Boolean filter must be 'true' or 'false'.",
    { field: "isActive" }
  );
}

function parseLocale(value: string | null): "ar" | "en" | undefined {
  if (!value) return undefined;
  if (value === "ar" || value === "en") return value;
  throw ApiError.badRequest(
    "INVALID_LOCALE",
    "locale must be 'ar' or 'en'.",
    { field: "locale" }
  );
}

function parseBoundedText(value: string | null, field: string, maxLength: number): string | undefined {
  if (value === null) return undefined;
  const normalized = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!normalized && field === "q") return undefined;
  if (!normalized || normalized.length > maxLength) {
    throw ApiError.badRequest("INVALID_QUERY_PARAMETER", `${field} is invalid.`, { field });
  }
  return normalized;
}

function parseStrategy(value: string | null): SearchStrategy | undefined {
  if (!value) return undefined;
  if (value === "lexical" || value === "hybrid") return value;
  throw ApiError.badRequest(
    "INVALID_STRATEGY",
    "strategy must be 'lexical' or 'hybrid'.",
    { field: "strategy" }
  );
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request: Request, _auth, company) => {
    const searchParams = new URL(request.url).searchParams;

    const rawType = searchParams.get("type");
    if (rawType && !allowedTypes.includes(rawType as CatalogItemType)) {
      throw ApiError.badRequest(
        "INVALID_CATALOG_ITEM_TYPE",
        "Catalog item type is invalid.",
        { field: "type" }
      );
    }

    const query = parseBoundedText(searchParams.get("q") ?? searchParams.get("query"), "q", 200);
    const categoryId = parseBoundedText(searchParams.get("categoryId"), "categoryId", 200);
    const manufacturerId = parseBoundedText(searchParams.get("manufacturerId"), "manufacturerId", 200);
    const brandId = parseBoundedText(searchParams.get("brandId"), "brandId", 200);
    const locale = parseLocale(searchParams.get("locale"));
    const isActive = parseBoolean(searchParams.get("isActive"));
    if (isActive === false) {
      throw ApiError.badRequest("INACTIVE_RETRIEVAL_NOT_ALLOWED", "Commercial retrieval only returns active candidates.", { field: "isActive" });
    }
    const limit = parseLimit(searchParams.get("limit"));
    const strategy = parseStrategy(searchParams.get("strategy"));

    const result = await retrieveCommercialCandidates.execute({
      companyId: company.companyId,
      query,
      type: rawType as CatalogItemType | undefined,
      categoryId,
      manufacturerId,
      brandId,
      locale,
      isActive: true,
      limit,
      strategy,
    });

    return apiSuccess(result.candidates.map(toAICandidateProjection), {
      meta: result.meta,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
