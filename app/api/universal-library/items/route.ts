import { CatalogItemType } from "../../../../features/catalog";
import {
  PrismaUniversalLibraryRepository,
  SearchUniversalLibrary,
} from "../../../../features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "../../../../lib/api";
import { prisma } from "../../../../lib/prisma";
import { serializeUniversalItem } from "../serialize-universal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaUniversalLibraryRepository(prisma);
const searchUniversalLibrary = new SearchUniversalLibrary(repository);

const allowedTypes: CatalogItemType[] = [
  "PRODUCT",
  "SERVICE",
  "SHIPPING",
  "LABOR",
  "DISCOUNT",
  "CUSTOM",
];

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request: Request) => {
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
    const isActive = parseBoolean(searchParams.get("isActive"));
    const limit = parsePositiveInteger(searchParams.get("limit"));
    const cursor = searchParams.get("cursor") ?? undefined;

    const result = await searchUniversalLibrary.execute({
      query,
      type: rawType as CatalogItemType | undefined,
      categoryId,
      isActive,
      limit,
      cursor,
    });

    return apiSuccess(result.items.map(serializeUniversalItem), {
      meta: {
        total: result.total,
        nextCursor: result.nextCursor ?? null,
      },
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
