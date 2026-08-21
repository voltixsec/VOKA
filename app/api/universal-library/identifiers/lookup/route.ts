import type { UniversalIdentifierType } from "../../../../../lib/generated/prisma/client";
import {
  LookupByUniversalIdentifier,
  PrismaUniversalLibraryRepository,
  AmbiguousUniversalIdentifierError,
  InvalidUniversalIdentifierError,
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
    const manufacturerId = searchParams.get("manufacturerId") ?? undefined;
    const source = searchParams.get("source") ?? undefined;

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

    let item;
    try {
      item = await lookupByUniversalIdentifier.execute({
        identifierType: type as UniversalIdentifierType,
        value: value.trim(),
        manufacturerId,
        source,
      });
    } catch (error) {
      if (error instanceof InvalidUniversalIdentifierError) {
        throw ApiError.badRequest(error.code, "Identifier value or scope is invalid.");
      }
      if (error instanceof AmbiguousUniversalIdentifierError) {
        throw ApiError.conflict(
          "AMBIGUOUS_UNIVERSAL_IDENTIFIER",
          "Identifier matched more than one universal item."
        );
      }
      throw error;
    }

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
