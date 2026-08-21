import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  PrismaUniversalLibraryRepository,
  IngestSourceRecord,
} from "@/features/universal-library";

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN"],
  async (request: Request) => {
    try {
      const body = await request.json();

      if (!body || typeof body !== "object") {
        return NextResponse.json(
          { error: "Invalid request body." },
          { status: 400 }
        );
      }

      const { sourceId, sourceExternalId, entityType, rawPayload } = body;

      if (!sourceId || typeof sourceId !== "string") {
        return NextResponse.json(
          { error: "sourceId is required." },
          { status: 400 }
        );
      }

      if (!sourceExternalId || typeof sourceExternalId !== "string") {
        return NextResponse.json(
          { error: "sourceExternalId is required." },
          { status: 400 }
        );
      }

      if (!rawPayload || typeof rawPayload !== "object") {
        return NextResponse.json(
          { error: "rawPayload object is required." },
          { status: 400 }
        );
      }

      const repository = new PrismaUniversalLibraryRepository(prisma);
      const useCase = new IngestSourceRecord(repository);

      const result = await useCase.execute({
        sourceId,
        sourceExternalId,
        entityType,
        rawPayload,
      });

      return apiSuccess(
        {
          id: result.ingestionRecord.id,
          sourceId: result.ingestionRecord.sourceId,
          sourceExternalId: result.ingestionRecord.sourceExternalId,
          status: result.ingestionRecord.status,
          isDuplicatePayload: result.isDuplicatePayload,
          isNewRecord: result.isNewRecord,
          errorMessage: result.ingestionRecord.errorMessage,
          createdAt: result.ingestionRecord.createdAt.toISOString(),
        },
        { status: result.isNewRecord ? 201 : 200 }
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to ingest source record." },
        { status: 400 }
      );
    }
  }
);
