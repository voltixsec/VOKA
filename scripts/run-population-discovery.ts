import { OpenAiWebDiscoveryAdapter } from "../features/universal-library/infrastructure/discovery/OpenAiWebDiscoveryAdapter";
import { SystemPopulationPipeline } from "../features/universal-library/application/population/SystemPopulationPipeline";
import { PrismaUniversalLibraryRepository } from "../features/universal-library/infrastructure/prisma/PrismaUniversalLibraryRepository";
import { prisma } from "../lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  let prompt = "CCTV IP Surveillance System";
  let domainHint = "Security Equipment";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && args[i + 1]) {
      prompt = args[i + 1];
      i++;
    } else if (args[i] === "--domain" && args[i + 1]) {
      domainHint = args[i + 1];
      i++;
    }
  }

  console.log("=========================================================================");
  console.log("VOKA Governed Product Intelligence Population CLI");
  console.log("=========================================================================");
  console.log(`Query:        "${prompt}"`);
  console.log(`Domain Hint:  "${domainHint}"`);
  const apiKey = process.env.OPENAI_API_KEY?.trim();

if (!apiKey) {
  console.error(
    "ERROR: OPENAI_API_KEY is not configured. Real web discovery requires OPENAI_API_KEY."
  );
  process.exit(1);
}

console.log(`Mode:         LIVE OpenAI + Web Search`);
console.log("-------------------------------------------------------------------------");

const provider = new OpenAiWebDiscoveryAdapter();
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
