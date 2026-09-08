import { NextResponse } from "next/server";

import { ProcessBulkImportWizardBatch } from "@/features/universal-library/application/bulk-import/ProcessBulkImportWizardBatch";
import { MAX_WIZARD_PROCESS_RECORDS } from "@/features/universal-library/application/bulk-import/ProcessBulkImportWizardBatch";
import { MAX_INGESTION_BATCH_LIMIT } from "@/features/universal-library/domain/repositories/UniversalLibraryRepository";
import { PrismaBulkImportBatchStatusRepository } from "@/features/universal-library/infrastructure/bulk-import/PrismaBulkImportBatchStatusRepository";
import { PrismaUniversalLibraryRepository } from "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import { apiSuccess, withPlatformAdminAuth } from "@/lib/api";
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

export const POST = withPlatformAdminAuth(
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

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        400,
        "INVALID_JSON",
        "Request body must be valid JSON.",
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return errorResponse(
        400,
        "INVALID_BODY",
        "Request body must be an object.",
      );
    }

    const input = body as Record<string, unknown>;
    const sourceId =
      typeof input.sourceId === "string" ? input.sourceId.trim() : "";
    const batchExternalKey =
      typeof input.batchExternalKey === "string"
        ? input.batchExternalKey.trim()
        : "";
    const sourceNamespace =
      typeof input.sourceNamespace === "string"
        ? input.sourceNamespace.trim()
        : undefined;
    const batchSize =
      input.batchSize === undefined ? undefined : input.batchSize;
    const maxRecords =
      input.maxRecords === undefined ? undefined : input.maxRecords;

    for (const [field, value, maximum] of [["batchSize", batchSize, MAX_INGESTION_BATCH_LIMIT], ["maxRecords", maxRecords, MAX_WIZARD_PROCESS_RECORDS]] as const) {
      if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum)) {
        return errorResponse(400, "INVALID_PROCESS_LIMIT", `${field} must be an integer between 1 and ${maximum}.`);
      }
    }

    if (!sourceId) {
      return errorResponse(
        400,
        "SOURCE_ID_REQUIRED",
        "sourceId is required.",
      );
    }

    if (!batchExternalKey) {
      return errorResponse(
        400,
        "BATCH_EXTERNAL_KEY_REQUIRED",
        "batchExternalKey is required.",
      );
    }

    try {
      const useCase = new ProcessBulkImportWizardBatch(
        new PrismaBulkImportBatchStatusRepository(prisma),
        new PrismaUniversalLibraryRepository(prisma),
      );

      const result = await useCase.execute({
        sourceId,
        batchExternalKey,
        sourceNamespace,
        batchSize: typeof batchSize === "number" ? batchSize : undefined,
        maxRecords: typeof maxRecords === "number" ? maxRecords : undefined,
      });

      if (result.publishedCount !== 0) {
        return errorResponse(
          500,
          "UCL_BULK_PUBLICATION_SAFETY_VIOLATION",
          "Bulk wizard processing unexpectedly published canonical records.",
        );
      }

      return apiSuccess(result, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bulk wizard process failed.";

      if (message === "Bulk import batch was not found.") {
        return errorResponse(404, "BULK_BATCH_NOT_FOUND", message);
      }

      console.error("UCL batch wizard process failed:", error);
      return errorResponse(
        500,
        "UCL_BULK_WIZARD_PROCESS_FAILED",
        "The batch could not be processed. Refresh its status before retrying.",
      );
    }
  },
);
