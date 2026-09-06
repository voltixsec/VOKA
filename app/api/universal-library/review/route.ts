import { NextResponse } from "next/server";

import {
  PrismaUniversalLibraryRepository,
  ReviewIngestionRecord,
} from "@/features/universal-library";
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
) {
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

export const POST =
  withPlatformAdminAuth(
    ["OWNER", "ADMIN"],
    async (
      request: Request,
      auth,
    ) => {
      let body: unknown;

      try {
        body =
          await request.json();
      } catch {
        return errorResponse(
          400,
          "INVALID_JSON",
          "Request body must be valid JSON.",
        );
      }

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {
        return errorResponse(
          400,
          "INVALID_BODY",
          "Request body must be an object.",
        );
      }

      const input =
        body as Record<
          string,
          unknown
        >;

      const ingestionRecordId =
        typeof input.ingestionRecordId ===
        "string"
          ? input.ingestionRecordId.trim()
          : "";

      const decision =
        input.decision;

      const reviewNote =
        typeof input.reviewNote ===
        "string"
          ? input.reviewNote.trim()
          : undefined;

      if (!ingestionRecordId) {
        return errorResponse(
          400,
          "INGESTION_RECORD_REQUIRED",
          "ingestionRecordId is required.",
        );
      }

      if (
        decision !== "APPROVE" &&
        decision !== "REJECT"
      ) {
        return errorResponse(
          400,
          "INVALID_REVIEW_DECISION",
          "decision must be APPROVE or REJECT.",
        );
      }

      if (
        reviewNote &&
        reviewNote.length > 1000
      ) {
        return errorResponse(
          400,
          "REVIEW_NOTE_TOO_LONG",
          "reviewNote must not exceed 1000 characters.",
        );
      }

      try {
        const repository =
          new PrismaUniversalLibraryRepository(
            prisma,
          );

        const useCase =
          new ReviewIngestionRecord(
            repository,
          );

        const result =
          await useCase.execute({
            ingestionRecordId,
            decision,
            reviewedByUserId:
              auth.user.id,
            reviewNote,
          });

        return apiSuccess(
          result,
          {
            status: 200,
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "";

        if (
          message.includes(
            "not awaiting",
          )
        ) {
          return errorResponse(
            409,
            "REVIEW_STATE_CONFLICT",
            "The ingestion record is not awaiting review.",
          );
        }

        return errorResponse(
          500,
          "UCL_REVIEW_FAILED",
          "The governed review decision could not be completed.",
        );
      }
    },
  );
