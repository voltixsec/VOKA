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
      const body = await request.json().catch(() => ({}));

      const batchSize = typeof body?.batchSize === "number" ? body.batchSize : undefined;

      const repository = new PrismaUniversalLibraryRepository(prisma);
      const useCase = new ProcessIngestionBatch(repository);

      const summary = await useCase.execute({ batchSize });

      return apiSuccess(summary, { status: 200 });
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to process ingestion batch." },
        { status: 400 }
      );
    }
  }
);
