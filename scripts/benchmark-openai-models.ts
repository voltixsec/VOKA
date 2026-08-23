import { OpenAITranslationAdapter } from "../src/infrastructure/translation/openai/OpenAITranslationAdapter";
import { COMMERCIAL_TEST_CORPUS } from "../src/application/translation/__tests__/testCorpus";
import { ProtectedTokenValidator } from "../src/application/translation/services/ProtectedTokenValidator";

const CANDIDATE_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] as const;

export type BenchmarkModelResult = {
  model: string;
  totalItems: number;
  successCount: number;
  failedCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  protectedTokensTotal: number;
  protectedTokensPreserved: number;
  tokenPreservationRatio: number;
  errors: string[];
};

export async function runBenchmark(): Promise<Record<string, BenchmarkModelResult>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const results: Record<string, BenchmarkModelResult> = {};

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required; no benchmark was executed and no results were produced.");
  }
  if (process.env.VOKA_RUN_LIVE_OPENAI_BENCHMARK !== "true") {
    throw new Error("Set VOKA_RUN_LIVE_OPENAI_BENCHMARK=true to explicitly authorize live benchmark requests.");
  }

  console.log("------------------------------------------------------------");
  console.log("Running LIVE OpenAI Translation Benchmark across models...");
  console.log("------------------------------------------------------------");

  for (const model of CANDIDATE_MODELS) {
    const adapter = new OpenAITranslationAdapter({
      apiKey,
      model,
      maxRetries: 1,
      enforceProtectedTokens: true,
    });

    let successCount = 0;
    let failedCount = 0;
    let protectedTokensTotal = 0;
    let protectedTokensPreserved = 0;
    const errors: string[] = [];

    const startTime = Date.now();

    for (const item of COMMERCIAL_TEST_CORPUS) {
      const targetLocale = item.sourceLocale === "ar" ? "en" : "ar";
      const tokensInItem = ProtectedTokenValidator.extractProtectedTokens(item.text);
      protectedTokensTotal += tokensInItem.length;

      try {
        const res = await adapter.translateMany({
          sourceLocale: item.sourceLocale,
          targetLocale,
          items: [{ key: item.id, text: item.text }],
        });

        const translated = res[item.id];
        if (translated) {
          const val = ProtectedTokenValidator.validateTokens(item.text, translated);
          protectedTokensPreserved += tokensInItem.length - val.missingTokens.length;
          successCount++;
        } else {
          failedCount++;
          errors.push(`Item ${item.id} returned empty translation`);
        }
      } catch (err: unknown) {
        failedCount++;
        errors.push(`Item ${item.id} error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const duration = Date.now() - startTime;

    results[model] = {
      model,
      totalItems: COMMERCIAL_TEST_CORPUS.length,
      successCount,
      failedCount,
      totalLatencyMs: duration,
      avgLatencyMs: duration / COMMERCIAL_TEST_CORPUS.length,
      protectedTokensTotal,
      protectedTokensPreserved,
      tokenPreservationRatio:
        protectedTokensTotal > 0
          ? protectedTokensPreserved / protectedTokensTotal
          : 1.0,
      errors,
    };
  }

  return results;
}

if (require.main === module) {
  runBenchmark()
    .then((res) => {
      console.log("\n=================== BENCHMARK RESULTS ===================");
      console.dir(res, { depth: null });
    })
    .catch((err) => {
      console.error("Benchmark failed:", err);
      process.exit(1);
    });
}
