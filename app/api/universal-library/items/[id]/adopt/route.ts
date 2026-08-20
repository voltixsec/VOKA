import {
  AdoptUniversalItem,
  PrismaUniversalLibraryRepository,
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

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" ? value : undefined;
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

    let body: AdoptBody = {};
    try {
      body = (await request.json()) as AdoptBody;
    } catch {
      // Empty body is allowed
    }

    const result = await adoptUniversalItem.execute({
      companyId: company.companyId,
      universalItemId,
      adoptedByUserId: auth.user.id,
      code: optionalString(body.code),
      salePrice: optionalNumber(body.salePrice),
      unitId: optionalString(body.unitId),
      taxRateId: optionalString(body.taxRateId),
    });

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
