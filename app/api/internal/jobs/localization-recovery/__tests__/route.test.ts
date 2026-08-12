import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runBatch: vi.fn() }));
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository", () => ({ PrismaQuotationRepository: class {} }));
vi.mock("@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner", () => ({ QuotationLocalizationJobRunner: class {} }));
vi.mock("@/src/infrastructure/translation/quotation/QuotationLocalizationRecoveryService", () => ({
  QuotationLocalizationRecoveryService: class { runBatch = mocks.runBatch; },
}));

import { POST } from "../route";

describe("localization recovery trigger", () => {
  beforeEach(() => {
    process.env.VOKA_CRON_SECRET = "test-cron-secret";
    mocks.runBatch.mockReset();
  });
  afterEach(() => { delete process.env.VOKA_CRON_SECRET; });

  it("rejects unauthorized requests", async () => {
    const response = await POST(new Request("http://localhost/api/internal/jobs/localization-recovery", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.runBatch).not.toHaveBeenCalled();
  });

  it("runs one batch and returns only the safe summary", async () => {
    const summary = { scanned: 2, completed: 1, failed: 1, stale: 0, noClaim: 0, notFound: 0, claimFailed: 0 };
    mocks.runBatch.mockResolvedValue(summary);
    const response = await POST(new Request("http://localhost/api/internal/jobs/localization-recovery", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.runBatch).toHaveBeenCalledOnce();
    expect(body).toEqual({ success: true, data: summary });
    expect(JSON.stringify(body)).not.toContain("quotation");
    expect(JSON.stringify(body)).not.toContain("error");
  });
});
