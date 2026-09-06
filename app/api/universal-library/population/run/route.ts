import { NextResponse } from "next/server";
import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PrismaUniversalLibraryRepository } from "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import { OpenAiWebDiscoveryAdapter } from "@/features/universal-library/infrastructure/discovery/OpenAiWebDiscoveryAdapter";
import { SystemPopulationPipeline } from "@/features/universal-library/application/population/SystemPopulationPipeline";

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN"],
  async (request: Request) => {
    try {
      let body: unknown;

      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Malformed JSON request body." },
          { status: 400 }
        );
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
          { error: "Invalid request body." },
          { status: 400 }
        );
      }

      const { prompt, domainHint, categoryHint, targetMarket } = body as Record<
        string,
        unknown
      >;

      if (typeof prompt !== "string" || !prompt.trim()) {
        return NextResponse.json(
          { error: "prompt is required." },
          { status: 400 }
        );
      }

      const apiKey = process.env.OPENAI_API_KEY?.trim();

      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              "OPENAI_API_KEY is not configured. Real web discovery requires OPENAI_API_KEY.",
          },
          { status: 500 }
        );
      }

      const provider = new OpenAiWebDiscoveryAdapter();
      const repository = new PrismaUniversalLibraryRepository(prisma);
      const pipeline = new SystemPopulationPipeline(provider, repository);

      const summary = await pipeline.runPopulation({
        prompt: prompt.trim(),
        domainHint: typeof domainHint === "string" ? domainHint.trim() : null,
        categoryHint:
          typeof categoryHint === "string" ? categoryHint.trim() : null,
        targetMarket:
          typeof targetMarket === "string" ? targetMarket.trim() : null,
      });

      return apiSuccess(summary, { status: 200 });
    } catch {
      return NextResponse.json(
        { error: "Population discovery run could not be executed." },
        { status: 500 }
      );
    }
  }
);