import type { UniversalIdentifierType } from "../../../../../lib/generated/prisma/client";
import {
  LookupByUniversalIdentifier,
  PrismaUniversalLibraryRepository,
} from "../../../../../features/universal-library";
import { ApiError, apiSuccess, withCompanyAuth } from "../../../../../lib/api";
import { prisma } from "../../../../../lib/prisma";
import { serializeUniversalItem } from "../../serialize-universal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repository = new PrismaUniversalLibraryRepository(prisma);
const lookupByUniversalIdentifier = new LookupByUniversalIdentifier(repository);

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

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request: Request) => {
    const searchParams = new URL(request.url).searchParams;
    const type = searchParams.get("type");
    const value = searchParams.get("value") ?? searchParams.get("v");

    if (!type || !allowedIdentifierTypes.includes(type as UniversalIdentifierType)) {
      throw ApiError.badRequest(
        "INVALID_IDENTIFIER_TYPE",
        "Identifier type is missing or invalid.",
        { field: "type" }
      );
    }

    if (!value || !value.trim()) {
      throw ApiError.badRequest(
        "MISSING_IDENTIFIER_VALUE",
        "Identifier value is required.",
        { field: "value" }
      );
    }

    const item = await lookupByUniversalIdentifier.execute({
      identifierType: type as UniversalIdentifierType,
      value: value.trim(),
    });

    if (!item) {
      throw ApiError.notFound(
        "UNIVERSAL_ITEM_NOT_FOUND",
        "No universal catalog item found matching identifier."
      );
    }

    return apiSuccess(serializeUniversalItem(item), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
);
