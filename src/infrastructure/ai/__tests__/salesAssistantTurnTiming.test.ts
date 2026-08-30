import { describe, expect, it, vi } from "vitest";
import { salesAssistantTurnTimingOptions } from "../salesAssistantTurnTiming";

describe("salesAssistantTurnTimingOptions", () => {
  it("does not emit noisy timing logs in production", () => {
    const log = vi.fn();
    const options = salesAssistantTurnTimingOptions("production", log);
    expect(options.onTiming).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it("reports structured turn timings in development", () => {
    const log = vi.fn();
    const options = salesAssistantTurnTimingOptions("development", log);
    options.onTiming?.({ semanticProviderMs: 10, researchMs: 0, deterministicToolsMs: 2, naturalResponseMs: 0, totalMs: 12, researchInvoked: false, aiProviderCallCount: 1,
      providerCallBreakdown: { SEMANTIC: 1, INTENT_FALLBACK: 0, CUSTOMER_REPAIR: 0, RESEARCH: 0, PRICE_ESTIMATE: 0 } });
    expect(log).toHaveBeenCalledWith("[SalesAssistantTurnLatency]", expect.objectContaining({ totalMs: 12, researchInvoked: false, aiProviderCallCount: 1 }));
  });
});
