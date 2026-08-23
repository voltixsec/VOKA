import { afterEach, describe, expect, it } from "vitest";
import { runBenchmark } from "@/scripts/benchmark-openai-models";

describe("OpenAI localization benchmark safety", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAuthorization = process.env.VOKA_RUN_LIVE_OPENAI_BENCHMARK;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalAuthorization === undefined) delete process.env.VOKA_RUN_LIVE_OPENAI_BENCHMARK;
    else process.env.VOKA_RUN_LIVE_OPENAI_BENCHMARK = originalAuthorization;
  });

  it("does not fabricate benchmark results when the API key is absent", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.VOKA_RUN_LIVE_OPENAI_BENCHMARK;
    await expect(runBenchmark()).rejects.toThrow("no benchmark was executed");
  });

  it("requires explicit live-request authorization even when a key exists", async () => {
    process.env.OPENAI_API_KEY = "test-only";
    delete process.env.VOKA_RUN_LIVE_OPENAI_BENCHMARK;
    await expect(runBenchmark()).rejects.toThrow("explicitly authorize live benchmark requests");
  });
});
