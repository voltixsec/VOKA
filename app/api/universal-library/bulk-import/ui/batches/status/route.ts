import {
  NextResponse,
} from "next/server";

import { GetBulkImportBatchStatus } from "@/features/universal-library/application/bulk-import/GetBulkImportBatchStatus";
import { PrismaBulkImportBatchStatusRepository } from "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchStatusRepository";
import {
  apiSuccess,
  withPlatformAdminAuth,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

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
    async (request) => {
      const operationalSecret =
        process.env
          .VOKA_UCL_BULK_IMPORT_SECRET
          ?.trim();

      if (
        !operationalSecret
      ) {
        return errorResponse(
          503,
          "UCL_BULK_IMPORT_DISABLED",
          "Global UCL bulk import operations are not enabled.",
        );
      }

      const url =
        new URL(
          request.url,
        );

      const sourceId =
        url.searchParams
          .get("sourceId")
          ?.trim();

      const batchExternalKey =
        url.searchParams
          .get(
            "batchExternalKey",
          )
          ?.trim();

      const sourceNamespace =
        url.searchParams
          .get(
            "sourceNamespace",
          )
          ?.trim() ||
        undefined;

      if (!sourceId) {
        return errorResponse(
          400,
          "SOURCE_ID_REQUIRED",
          "sourceId is required.",
        );
      }

      if (
        !batchExternalKey
      ) {
        return errorResponse(
          400,
          "BATCH_EXTERNAL_KEY_REQUIRED",
          "batchExternalKey is required.",
        );
      }

      try {
        const useCase =
          new GetBulkImportBatchStatus(
            new PrismaBulkImportBatchStatusRepository(
              prisma,
            ),
          );

        const result =
          await useCase.execute({
            sourceId,
            batchExternalKey,
            sourceNamespace,
          });

        if (!result) {
          return errorResponse(
            404,
            "BULK_BATCH_NOT_FOUND",
            "Bulk import batch was not found.",
          );
        }

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
          "UCL_BULK_BATCH_STATUS_FAILED",
          error instanceof Error
            ? error.message.slice(
                0,
                500,
              )
            : "Bulk batch status failed.",
        );
      }
    },
  );
