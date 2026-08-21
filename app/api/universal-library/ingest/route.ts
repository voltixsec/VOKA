import { NextResponse } from "next/server";
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
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (Number.isFinite(contentLength) && contentLength > 262_144) {
        return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Malformed JSON request body." }, { status: 400 });
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
          { error: "Invalid request body." },
          { status: 400 }
        );
      }

      const { sourceId, sourceExternalId, entityType, rawPayload } = body as Record<string, unknown>;

      if (typeof sourceId !== "string" || !sourceId.trim() || sourceId.length > 200) {
        return NextResponse.json(
          { error: "sourceId is required." },
          { status: 400 }
        );
      }

      if (typeof sourceExternalId !== "string" || !sourceExternalId.trim() || sourceExternalId.length > 500) {
        return NextResponse.json(
          { error: "sourceExternalId is required." },
          { status: 400 }
        );
      }

      if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
        return NextResponse.json(
          { error: "rawPayload object is required." },
          { status: 400 }
        );
      }
      if (entityType !== undefined && entityType !== "ITEM") {
        return NextResponse.json({ error: "entityType must be ITEM." }, { status: 400 });
      }
      if (Buffer.byteLength(JSON.stringify(rawPayload), "utf8") > 262_144) {
        return NextResponse.json({ error: "rawPayload is too large." }, { status: 413 });
      }

      const repository = new PrismaUniversalLibraryRepository(prisma);
      const useCase = new IngestSourceRecord(repository);

      const result = await useCase.execute({
        sourceId: sourceId.trim(),
        sourceExternalId: sourceExternalId.trim(),
        entityType: entityType as string | undefined,
        rawPayload: rawPayload as Record<string, unknown>,
      });

      return apiSuccess(
        {
          id: result.ingestionRecord.id,
          sourceId: result.ingestionRecord.sourceId,
          sourceExternalId: result.ingestionRecord.sourceExternalId,
          status: result.ingestionRecord.status,
          isDuplicatePayload: result.isDuplicatePayload,
          isNewRecord: result.isNewRecord,
          createdAt: result.ingestionRecord.createdAt.toISOString(),
        },
        { status: result.isNewRecord ? 201 : 200 }
      );
    } catch {
      return NextResponse.json(
        { error: "Ingestion request could not be accepted." },
        { status: 400 }
      );
    }
  }
);
