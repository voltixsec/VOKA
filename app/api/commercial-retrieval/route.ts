import { CatalogItemType } from "@/features/catalog";
import {
  PrismaHybridRetrievalRepository,
  RetrieveCommercialCandidates,
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

    const query = searchParams.get("q") ?? searchParams.get("query") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const manufacturerId = searchParams.get("manufacturerId") ?? undefined;
    const brandId = searchParams.get("brandId") ?? undefined;
    const locale = parseLocale(searchParams.get("locale"));
    const isActive = parseBoolean(searchParams.get("isActive"));
    const limit = parseLimit(searchParams.get("limit"));

    const result = await retrieveCommercialCandidates.execute({
      companyId: company.companyId,
      query,
      type: rawType as CatalogItemType | undefined,
      categoryId,
      manufacturerId,
      brandId,
      locale,
      isActive,
      limit,
    });

    return apiSuccess(result.candidates, {
      meta: result.meta,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
