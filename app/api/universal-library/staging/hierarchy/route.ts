import { NextResponse } from "next/server";

import { GetStagedHierarchy } from "@/features/universal-library/application/staging/GetStagedHierarchy";
import { PrismaStagedHierarchyRepository } from "@/features/universal-library/infrastructure/staging/PrismaStagedHierarchyRepository";
import {
  apiSuccess,
  withPlatformAdminAuth,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export const GET =
  withPlatformAdminAuth(
    ["OWNER", "ADMIN"],
    async (request: Request) => {
      const url =
        new URL(request.url);

      const categoryKey =
        url.searchParams
          .get("categoryKey")
          ?.trim() ||
        undefined;

      const domainKey =
        url.searchParams
          .get("domainKey")
          ?.trim() ||
        undefined;

      const systemKey =
        url.searchParams
          .get("systemKey")
          ?.trim() ||
        undefined;

      const rawLimit =
        url.searchParams
          .get("limit");

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

      try {
        const useCase =
          new GetStagedHierarchy(
            new PrismaStagedHierarchyRepository(
              prisma,
            ),
          );

        const result =
          await useCase.execute({
            categoryKey,
            domainKey,
            systemKey,
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
            "STAGED_CATEGORY_NOT_FOUND"
        ) {
          return errorResponse(
            404,
            "STAGED_CATEGORY_NOT_FOUND",
            "Staged category was not found.",
          );
        }

        if (
          error instanceof Error &&
          error.message ===
            "STAGED_DOMAIN_NOT_FOUND"
        ) {
          return errorResponse(
            404,
            "STAGED_DOMAIN_NOT_FOUND",
            "Staged core domain was not found.",
          );
        }

        if (
          error instanceof Error &&
          error.message ===
            "STAGED_SYSTEM_NOT_FOUND"
        ) {
          return errorResponse(
            404,
            "STAGED_SYSTEM_NOT_FOUND",
            "Staged system was not found.",
          );
        }

        return errorResponse(
          500,
          "STAGED_HIERARCHY_FAILED",
          error instanceof Error
            ? error.message.slice(
                0,
                500,
              )
            : "Staged hierarchy request failed.",
        );
      }
    },
  );
