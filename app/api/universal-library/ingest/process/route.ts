import { NextResponse } from "next/server";
import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  PrismaUniversalLibraryRepository,
  ProcessIngestionBatch,
} from "@/features/universal-library";

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN"],
  async (request: Request) => {
    try {
      const text = await request.text();
      let body: unknown = {};
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          return NextResponse.json({ error: "Malformed JSON request body." }, { status: 400 });
        }
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
      }

      const batchSize = (body as Record<string, unknown>).batchSize;
      if (batchSize !== undefined && (!Number.isInteger(batchSize) || (batchSize as number) < 1 || (batchSize as number) > 100)) {
        return NextResponse.json({ error: "batchSize must be an integer between 1 and 100." }, { status: 400 });
      }

      const repository = new PrismaUniversalLibraryRepository(prisma);
      const useCase = new ProcessIngestionBatch(repository);

      const summary = await useCase.execute({ batchSize: batchSize as number | undefined });

      return apiSuccess(summary, { status: 200 });
    } catch {
      return NextResponse.json(
        { error: "Failed to process ingestion batch." },
        { status: 500 }
      );
    }
  }
);
