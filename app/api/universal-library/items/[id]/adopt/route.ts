import {
  AdoptUniversalItem,
  PrismaUniversalLibraryRepository,
  UniversalAdoptionError,
} from "../../../../../../features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "../../../../../../lib/api";
import { prisma } from "../../../../../../lib/prisma";
import { serializeCatalogItem } from "../../../../catalog/items/serialize-catalog-item";
import { serializeUniversalAdoption } from "../../../serialize-universal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaUniversalLibraryRepository(prisma);
const adoptUniversalItem = new AdoptUniversalItem(repository);

type AdoptBody = {
  code?: unknown;
  salePrice?: unknown;
  unitId?: unknown;
  taxRateId?: unknown;
};

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw ApiError.badRequest("INVALID_ADOPTION_INPUT", `${field} must be a string.`, { field });
  }
  return value.trim() || undefined;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw ApiError.badRequest(
      "INVALID_ADOPTION_INPUT",
      `${field} must be a non-negative finite number.`,
      { field }
    );
  }
  return value;
}

function getItemIdFromAdoptUrl(request: Request): string {
  // Path format: /api/universal-library/items/[id]/adopt
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const adoptIdx = parts.lastIndexOf("adopt");
  if (adoptIdx > 0) {
    return decodeURIComponent(parts[adoptIdx - 1]);
  }
  throw ApiError.badRequest("MISSING_ITEM_ID", "Universal item ID is required.");
}

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES"],
  async (request: Request, auth, company) => {
    const universalItemId = getItemIdFromAdoptUrl(request);

    const rawBody = await request.text();
    let body: AdoptBody = {};
    if (rawBody.trim()) {
      try {
        const parsed: unknown = JSON.parse(rawBody);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("invalid body");
        }
        body = parsed as AdoptBody;
      } catch {
        throw ApiError.badRequest("INVALID_JSON", "Request body must be a JSON object.");
      }
    }

    const code = optionalString(body.code, "code")?.toUpperCase();
    if (code && !/^[A-Z0-9][A-Z0-9-_]{0,49}$/.test(code)) {
      throw ApiError.badRequest("INVALID_ADOPTION_INPUT", "code is invalid.", { field: "code" });
    }

    let result;
    try {
      result = await adoptUniversalItem.execute({
        companyId: company.companyId,
        universalItemId,
        adoptedByUserId: auth.user.id,
        code,
        salePrice: optionalNumber(body.salePrice, "salePrice"),
        unitId: optionalString(body.unitId, "unitId"),
        taxRateId: optionalString(body.taxRateId, "taxRateId"),
      });
    } catch (error) {
      if (error instanceof UniversalAdoptionError) {
        if (error.code === "CATALOG_CODE_CONFLICT") {
          throw ApiError.conflict(error.code, "Catalog item code is already in use.");
        }
        throw ApiError.badRequest(error.code, "A referenced adoption value is unavailable.");
      }
      throw error;
    }

    if (!result.isSuccess) {
      const error = result.error!;
      if (error.code === "UNIVERSAL_ITEM_NOT_FOUND") {
        throw ApiError.notFound(error.code, error.message);
      }
      throw ApiError.badRequest(error.code, error.message);
    }

    const { catalogItem, adoption, isNewAdoption } = result.value!;

    return apiSuccess(
      {
        catalogItem: serializeCatalogItem(catalogItem),
        adoption: serializeUniversalAdoption(adoption),
        isNewAdoption,
      },
      {
        status: isNewAdoption ? 201 : 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
);
