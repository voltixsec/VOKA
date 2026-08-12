import { describe, expect, it, vi } from "vitest";
import type { IQuotationLocalizationRecoveryRepository } from "../../../../application/quotation/repositories/IQuotationRepository";
import { QuotationLocalizationRecoveryService } from "../QuotationLocalizationRecoveryService";

function repository(): IQuotationLocalizationRecoveryRepository {
  return {
    findRecoverableLocalizationJobs: vi.fn().mockResolvedValue([
      { companyId: "c1", quotationId: "q1" },
      { companyId: "c2", quotationId: "q2" },
      { companyId: "c3", quotationId: "q3" },
    ]),
  };
}

describe("QuotationLocalizationRecoveryService", () => {
  it("uses a bounded query and processes candidates sequentially", async () => {
    const repo = repository();
    let active = 0; let maxActive = 0;
    const runner = { run: vi.fn(async () => {
      active += 1; maxActive = Math.max(maxActive, active);
      await Promise.resolve(); active -= 1; return "COMPLETED" as const;
    }) };
    const result = await new QuotationLocalizationRecoveryService(repo, runner)
      .runBatch({ limit: 999 });
    expect(repo.findRecoverableLocalizationJobs).toHaveBeenCalledWith({
      limit: 10, now: expect.any(Date),
    });
    expect(runner.run).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(1);
    expect(result).toEqual({ scanned: 3, completed: 3, failed: 0, stale: 0, noClaim: 0, notFound: 0, claimFailed: 0 });
  });

  it("counts every operational result and continues after an exception", async () => {
    const repo = repository();
    vi.mocked(repo.findRecoverableLocalizationJobs).mockResolvedValue([
      { companyId: "c", quotationId: "1" }, { companyId: "c", quotationId: "2" },
      { companyId: "c", quotationId: "3" }, { companyId: "c", quotationId: "4" },
      { companyId: "c", quotationId: "5" }, { companyId: "c", quotationId: "6" },
      { companyId: "c", quotationId: "7" },
    ]);
    const runner = { run: vi.fn()
      .mockResolvedValueOnce("COMPLETED").mockResolvedValueOnce("FAILED")
      .mockResolvedValueOnce("STALE").mockResolvedValueOnce("NO_CLAIM")
      .mockResolvedValueOnce("NOT_FOUND").mockResolvedValueOnce("CLAIM_FAILED")
      .mockRejectedValueOnce(new Error("private infrastructure detail")) };
    const result = await new QuotationLocalizationRecoveryService(repo, runner).runBatch();
    expect(result).toEqual({ scanned: 7, completed: 1, failed: 1, stale: 1, noClaim: 1, notFound: 1, claimFailed: 2 });
    expect(runner.run).toHaveBeenCalledTimes(7);
  });
});
