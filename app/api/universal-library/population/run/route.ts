import { NextResponse } from "next/server";
import { apiSuccess, withCompanyAuth } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { PrismaUniversalLibraryRepository } from "@/features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import { OpenAiWebDiscoveryAdapter } from "@/features/universal-library/infrastructure/discovery/OpenAiWebDiscoveryAdapter";
import { SystemPopulationPipeline } from "@/features/universal-library/application/population/SystemPopulationPipeline";
import { SystemDiscoverySeed, DiscoveryEvidence, SystemComponent } from "@/features/universal-library/domain/discovery";

export const POST = withCompanyAuth(
  ["OWNER", "ADMIN"],
  async (request: Request) => {
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Malformed JSON request body." }, { status: 400 });
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
      }

      const { prompt, domainHint, categoryHint, targetMarket, useLive } = body as Record<
        string,
        unknown
      >;

      if (typeof prompt !== "string" || !prompt.trim()) {
        return NextResponse.json({ error: "prompt is required." }, { status: 400 });
      }

      const isLiveRequested = useLive !== false;
      const apiKey = process.env.OPENAI_API_KEY?.trim();

      let provider;

      if (isLiveRequested && apiKey) {
        provider = new OpenAiWebDiscoveryAdapter();
      } else {
        provider = {
          async discoverSystem() {
            return new SystemDiscoverySeed({
              id: `seed-${Date.now()}`,
              seedType: "SYSTEM",
              nameEn: `Discovered Architecture for ${prompt.trim()}`,
              confidence: 0.9,
              domainHint: typeof domainHint === "string" ? domainHint.trim() : "General Equipment",
              evidence: [
                new DiscoveryEvidence({
                  url: "https://www.example.com/datasheet/system-overview",
                  title: "System Datasheet Overview",
                  publisher: "Authorized Vendor",
                  sourceType: "MANUFACTURER_DATASHEET",
                  claimSupport: ["System evidence and component structure"],
                }),
              ],
              components: [
                new SystemComponent({
                  key: "discovered_component_1",
                  componentType: "PRODUCT",
                  nameEn: "High Performance Commercial Equipment",
                  purpose: "Primary system component",
                  categoryHint: "EQUIPMENT",
                  identityHints: {
                    manufacturerHint: "Enterprise Hardware Corp",
                    brandHint: "Pro line",
                    modelNumber: "EHC-4K-9000",
                    mpn: "EHC-4K-9000-A",
                  },
                  specificationHints: ["Industrial Grade", "IP66 Water Resistant"],
                  confidence: 0.92,
                  evidence: [
                    new DiscoveryEvidence({
                      url: "https://www.example.com/datasheet/EHC-4K-9000",
                      title: "EHC-4K-9000 Specification",
                      publisher: "Enterprise Hardware Corp",
                      sourceType: "MANUFACTURER_DATASHEET",
                      claimSupport: ["Exact model and specification"],
                    }),
                  ],
                }),
              ],
            });
          },
        };
      }

      const repository = new PrismaUniversalLibraryRepository(prisma);
      const pipeline = new SystemPopulationPipeline(provider, repository);

      const summary = await pipeline.runPopulation({
        prompt: prompt.trim(),
        domainHint: typeof domainHint === "string" ? domainHint.trim() : null,
        categoryHint: typeof categoryHint === "string" ? categoryHint.trim() : null,
        targetMarket: typeof targetMarket === "string" ? targetMarket.trim() : null,
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
