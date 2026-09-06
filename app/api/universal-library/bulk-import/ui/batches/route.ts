import { NextResponse } from "next/server";

import { ListBulkImportBatches } from "@/features/universal-library/application/bulk-import/ListBulkImportBatches";
import { PrismaBulkImportBatchHistoryRepository } from "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchHistoryRepository";
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

export const GET = withPlatformAdminAuth(
  ["OWNER", "ADMIN"],
  async (request) => {
    const operationalSecret =
      process.env.VOKA_UCL_BULK_IMPORT_SECRET?.trim();

    if (!operationalSecret) {
      return errorResponse(
        503,
        "UCL_BULK_IMPORT_DISABLED",
        "Global UCL bulk import operations are not enabled.",
      );
    }

    const url = new URL(request.url);

    const rawLimit =
      url.searchParams.get("limit");

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
            "Cache-Control": "no-store",
          },
        },
      );
    } catch (error) {
      return errorResponse(
        500,
        "UCL_BULK_BATCH_HISTORY_FAILED",
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Bulk batch history failed.",
      );
    }
  },
);
