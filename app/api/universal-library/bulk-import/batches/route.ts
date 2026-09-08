import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import { ListBulkImportBatches } from "@/features/universal-library/application/bulk-import/ListBulkImportBatches";
import { PrismaBulkImportBatchHistoryRepository } from "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchHistoryRepository";
import { PrismaUniversalLibraryRepository } from "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import {
  apiSuccess,
  withPlatformAdminAuth,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(
  left: string,
  right: string,
): boolean {
  const a =
    Buffer.from(left);

  const b =
    Buffer.from(right);

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
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
        "Cache-Control":
          "no-store",
      },
    },
  );
}

export const GET =
  withPlatformAdminAuth(
    ["OWNER", "ADMIN"],
    async (
      request,
    ) => {
      const configuredSecret =
        process.env
          .VOKA_UCL_BULK_IMPORT_SECRET
          ?.trim();

      const suppliedSecret =
        request.headers
          .get(
            "x-voka-ucl-bulk-secret",
          )
          ?.trim();

      if (
        !configuredSecret ||
        !suppliedSecret ||
        !safeEqual(
          configuredSecret,
          suppliedSecret,
        )
      ) {
        return errorResponse(
          403,
          "UCL_BULK_IMPORT_FORBIDDEN",
          "Global UCL bulk import authorization failed.",
        );
      }

      const url =
        new URL(request.url);

      const rawLimit =
        url.searchParams.get(
          "limit",
        );

      const limit =
        rawLimit === null
          ? 50
          : Number(rawLimit);

      const sourceId =
        url.searchParams
          .get("sourceId")
          ?.trim() ||
        undefined;

      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200
      ) {
        return errorResponse(
          400,
          "INVALID_LIMIT",
          "limit must be between 1 and 200.",
        );
      }

      try {
        const useCase =
          new ListBulkImportBatches(
            new PrismaBulkImportBatchHistoryRepository(
              prisma,
            ),
            new PrismaUniversalLibraryRepository(
              prisma,
            ),
          );

        const result =
          await useCase.execute({
            limit,
            sourceId,
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
        return errorResponse(
          500,
          "UCL_BULK_BATCH_HISTORY_FAILED",
          error instanceof Error
            ? error.message.slice(
                0,
                500,
              )
            : "Bulk batch history failed.",
        );
      }
    },
  );
