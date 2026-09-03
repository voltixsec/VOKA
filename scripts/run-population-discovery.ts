import { OpenAiWebDiscoveryAdapter } from "../features/universal-library/infrastructure/discovery/OpenAiWebDiscoveryAdapter";
import { SystemPopulationPipeline } from "../features/universal-library/application/population/SystemPopulationPipeline";
import { PrismaUniversalLibraryRepository } from "../features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import { prisma } from "../lib/prisma";
import { SystemDiscoverySeed, DiscoveryEvidence, SystemComponent } from "../features/universal-library/domain/discovery";

async function main() {
  const args = process.argv.slice(2);
  let prompt = "CCTV IP Surveillance System";
  let domainHint = "Security Equipment";
  let isLive = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && args[i + 1]) {
      prompt = args[i + 1];
      i++;
    } else if (args[i] === "--domain" && args[i + 1]) {
      domainHint = args[i + 1];
      i++;
    } else if (args[i] === "--live") {
      isLive = true;
    }
  }

  console.log("=========================================================================");
  console.log("VOKA Governed Product Intelligence Population CLI");
  console.log("=========================================================================");
  console.log(`Query:        "${prompt}"`);
  console.log(`Domain Hint:  "${domainHint}"`);
  console.log(`Mode:         ${isLive ? "LIVE OpenAI + Web Search" : "CI Mock Fixture"}`);
  console.log("-------------------------------------------------------------------------");

  let provider;

  if (isLive && process.env.OPENAI_API_KEY) {
    provider = new OpenAiWebDiscoveryAdapter();
  } else {
    if (isLive && !process.env.OPENAI_API_KEY) {
      console.warn("WARNING: --live requested but OPENAI_API_KEY is missing. Falling back to mock fixture.");
    }

    provider = {
      async discoverSystem() {
        return new SystemDiscoverySeed({
          id: "cli-cctv-seed-01",
          seedType: "SYSTEM",
          nameEn: "Commercial IP CCTV Surveillance Architecture",
          confidence: 0.95,
          domainHint,
          evidence: [
            new DiscoveryEvidence({
              url: "https://www.hikvision.com/en/products/IP-Products/",
              title: "Hikvision Enterprise IP Cameras",
              publisher: "Hikvision",
              sourceType: "MANUFACTURER_DATASHEET",
              claimSupport: ["Commercial camera models and specs"],
            }),
          ],
          components: [
            new SystemComponent({
              key: "hikvision_4k_dome",
              componentType: "PRODUCT",
              nameEn: "Hikvision 4K Vandal Dome Camera",
              purpose: "Outdoor optical surveillance",
              categoryHint: "IP_CAMERAS",
              identityHints: {
                manufacturerHint: "Hikvision",
                brandHint: "Pro Series",
                modelNumber: "DS-2CD2143G0-I",
                mpn: "DS-2CD2143G0-I-4MM",
              },
              specificationHints: ["4K Resolution", "30m IR", "IP67"],
              confidence: 0.94,
              evidence: [
                new DiscoveryEvidence({
                  url: "https://www.hikvision.com/en/products/IP-Products/Network-Cameras/DS-2CD2143G0-I/",
                  title: "DS-2CD2143G0-I Datasheet",
                  publisher: "Hikvision",
                  sourceType: "MANUFACTURER_DATASHEET",
                  claimSupport: ["Exact model and MPN"],
                }),
              ],
            }),
            new SystemComponent({
              key: "dahua_32ch_nvr",
              componentType: "PRODUCT",
              nameEn: "Dahua 32-Channel 4K NVR",
              purpose: "Centralized video recording",
              categoryHint: "RECORDERS",
              identityHints: {
                manufacturerHint: "Dahua",
                brandHint: "Ultra Series",
                modelNumber: "NVR5432-16P-I",
                mpn: "NVR5432-16P-I",
              },
              specificationHints: ["32 Channels", "16 PoE", "AI Face Recognition"],
              confidence: 0.92,
              evidence: [
                new DiscoveryEvidence({
                  url: "https://www.dahuasecurity.com/products/All-Products/Network-Recorders/NVR5432-16P-I",
                  title: "Dahua NVR5432-16P-I Datasheet",
                  publisher: "Dahua",
                  sourceType: "MANUFACTURER_DATASHEET",
                  claimSupport: ["Exact Dahua model"],
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

  console.log("Initiating population run...");
  const summary = await pipeline.runPopulation({
    prompt,
    domainHint,
  });

  console.log("\n=========================================================================");
  console.log("RUN SUMMARY RESULTS");
  console.log("=========================================================================");
  console.log(`Run ID:                 ${summary.runId}`);
  console.log(`Run Status:             ${summary.status}`);
  console.log(`Discovered System:     "${summary.seed.nameEn}" (confidence: ${summary.seed.confidence})`);
  console.log("-------------------------------------------------------------------------");
  console.log("GOVERNED PIPELINE COUNTS:");
  console.log(`  Discovered Components: ${summary.counts.discoveredComponentsCount}`);
  console.log(`  Planned Work Items:    ${summary.counts.plannedWorkItemsCount}`);
  console.log(`  Staged Records:        ${summary.counts.stagedRecordsCount}`);
  console.log(`  Duplicate Records:     ${summary.counts.duplicateRecordsCount}`);
  console.log(`  Needs Review:          ${summary.counts.needsReviewCount}`);
  console.log(`  Rejected:              ${summary.counts.rejectedCount}`);
  console.log(`  Published:             ${summary.counts.publishedCount} (ALWAYS 0)`);
  console.log("-------------------------------------------------------------------------");
  console.log("EVIDENCE SOURCE URLS:");
  summary.evidenceUrls.forEach((url, i) => console.log(`  [${i + 1}] ${url}`));
  console.log("-------------------------------------------------------------------------");
  console.log("STAGED CANDIDATES:");
  summary.stagedCandidates.forEach((c) => {
    console.log(`  - [${c.componentKey}] ${c.nameEn}`);
    console.log(`    Manufacturer: ${c.manufacturer || "N/A"} | Model: ${c.modelNumber || "N/A"} | MPN: ${c.mpn || "N/A"}`);
    console.log(`    Status:       ${c.status} | IngestionRecordId: ${c.ingestionRecordId}`);
    if (c.evidenceUrl) console.log(`    Evidence:     ${c.evidenceUrl}`);
  });

  if (summary.errors.length > 0) {
    console.log("-------------------------------------------------------------------------");
    console.log("ERRORS/REJECTIONS:");
    summary.errors.forEach((err) => console.log(`  * ${err}`));
  }

  console.log("=========================================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("CLI run failed:", err);
  process.exit(1);
});
