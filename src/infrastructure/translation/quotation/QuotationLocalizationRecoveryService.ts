import type { IQuotationLocalizationRecoveryRepository } from "../../../application/quotation/repositories/IQuotationRepository";
import type { QuotationLocalizationJobResult } from "./QuotationLocalizationJobRunner";

type Runner = {
  run(params: { companyId: string; quotationId: string }): Promise<QuotationLocalizationJobResult>;
};

export type QuotationLocalizationRecoverySummary = {
  scanned: number;
  completed: number;
  failed: number;
  stale: number;
  noClaim: number;
  notFound: number;
  claimFailed: number;
};

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 10;

export class QuotationLocalizationRecoveryService {
  constructor(
    private readonly repository: IQuotationLocalizationRecoveryRepository,
    private readonly runner: Runner,
  ) {}

  async runBatch(input: { limit?: number } = {}): Promise<QuotationLocalizationRecoverySummary> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_BATCH_SIZE, 1), MAX_BATCH_SIZE);
    const candidates = await this.repository.findRecoverableLocalizationJobs({
      limit,
      now: new Date(),
    });
    const summary: QuotationLocalizationRecoverySummary = {
      scanned: candidates.length,
      completed: 0,
      failed: 0,
      stale: 0,
      noClaim: 0,
      notFound: 0,
      claimFailed: 0,
    };

    for (const candidate of candidates) {
      let result: QuotationLocalizationJobResult;
      try {
        result = await this.runner.run(candidate);
      } catch {
        result = "CLAIM_FAILED";
      }
      if (result === "COMPLETED") summary.completed += 1;
      else if (result === "FAILED") summary.failed += 1;
      else if (result === "STALE") summary.stale += 1;
      else if (result === "NO_CLAIM") summary.noClaim += 1;
      else if (result === "NOT_FOUND") summary.notFound += 1;
      else summary.claimFailed += 1;
    }
    return summary;
  }
}
