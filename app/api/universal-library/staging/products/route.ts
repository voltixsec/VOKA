import { NextResponse } from "next/server";

import {
  GetStagedProducts,
  type StagedProductEntityType,
} from "@/features/universal-library/application/staging-products/GetStagedProducts";
import { PrismaStagedProductsRepository } from "@/features/universal-library/infrastructure/staging-products/PrismaStagedProductsRepository";
import {
  apiSuccess,
  withPlatformAdminAuth,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entityTypes = new Set<StagedProductEntityType>([
  "PRODUCT_MODEL",
  "ITEM",
  "SERVICE",
]);

function textParam(
  url: URL,
  name: string,
): string | undefined {
  return (
    url.searchParams.get(name)?.trim() ||
    undefined
  );
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export const GET = withPlatformAdminAuth(
  ["OWNER", "ADMIN"],
  async (request: Request) => {
    const url = new URL(request.url);

    const rawLimit =
      url.searchParams.get("limit");

    const limit =
      rawLimit === null
        ? undefined
        : Number(rawLimit);

    if (
      limit !== undefined &&
      (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
    ) {
      return errorResponse(
        400,
        "INVALID_LIMIT",
        "limit must be between 1 and 100.",
      );
    }

    const rawEntityType =
      textParam(url, "entityType");

    if (
      rawEntityType &&
      !entityTypes.has(
        rawEntityType as StagedProductEntityType,
      )
    ) {
      return errorResponse(
        400,
        "INVALID_ENTITY_TYPE",
        "entityType must be PRODUCT_MODEL, ITEM or SERVICE.",
      );
    }

    try {
      const useCase =
        new GetStagedProducts(
          new PrismaStagedProductsRepository(
            prisma,
          ),
        );

      const result =
        await useCase.execute({
          search:
            textParam(url, "search"),
          entityType:
            rawEntityType as
              | StagedProductEntityType
              | undefined,
          manufacturer:
            textParam(
              url,
              "manufacturer",
            ),
          brand:
            textParam(url, "brand"),
          family:
            textParam(url, "family"),
          system:
            textParam(url, "system"),
          status:
            textParam(url, "status"),
          cursor:
            textParam(url, "cursor"),
          limit,
        });

      return apiSuccess(
        result,
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "INVALID_STAGED_PRODUCTS_LIMIT"
      ) {
        return errorResponse(
          400,
          "INVALID_LIMIT",
          "limit must be between 1 and 100.",
        );
      }

      return errorResponse(
        500,
        "STAGED_PRODUCTS_FAILED",
        error instanceof Error
          ? error.message.slice(
              0,
              500,
            )
          : "Staged products request failed.",
      );
    }
  },
);
