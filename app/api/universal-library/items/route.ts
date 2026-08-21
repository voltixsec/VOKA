import { CatalogItemType } from "../../../../features/catalog";
import type { UniversalIdentifierType } from "../../../../lib/generated/prisma/client";
import {
  PrismaUniversalLibraryRepository,
  InvalidUniversalCursorError,
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

const allowedIdentifierTypes: UniversalIdentifierType[] = [
  "GTIN",
  "GTIN_8",
  "GTIN_12",
  "GTIN_13",
  "GTIN_14",
  "EAN",
  "UPC",
  "MPN",
  "MODEL_NO",
  "EXTERNAL_ID",
];

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw ApiError.badRequest("INVALID_LIMIT", "limit must be a positive integer.");
  }
  return parsed;
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

    const rawIdentifierType = searchParams.get("identifierType");
    if (
      rawIdentifierType &&
      !allowedIdentifierTypes.includes(rawIdentifierType as UniversalIdentifierType)
    ) {
      throw ApiError.badRequest(
        "INVALID_IDENTIFIER_TYPE",
        "Identifier type is invalid.",
        { field: "identifierType" }
      );
    }

    const query = searchParams.get("q") ?? searchParams.get("query") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const manufacturerId = searchParams.get("manufacturerId") ?? undefined;
    const brandId = searchParams.get("brandId") ?? undefined;
    const familyId = searchParams.get("familyId") ?? undefined;
    const modelNumber = searchParams.get("modelNumber") ?? undefined;
    const identifierValue = searchParams.get("identifierValue") ?? undefined;
    const isActive = parseBoolean(searchParams.get("isActive"));
    const limit = parsePositiveInteger(searchParams.get("limit"));
    const cursor = searchParams.get("cursor") ?? undefined;

    let result;
    try {
      result = await searchUniversalLibrary.execute({
        query,
        type: rawType as CatalogItemType | undefined,
        categoryId,
        manufacturerId,
        brandId,
        familyId,
        modelNumber,
        identifierType: rawIdentifierType as UniversalIdentifierType | undefined,
        identifierValue,
        isActive,
        limit,
        cursor,
      });
    } catch (error) {
      if (error instanceof InvalidUniversalCursorError) {
        throw ApiError.badRequest("INVALID_CURSOR", "Universal Library cursor is invalid.");
      }
      throw error;
    }

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
