import {
  AcquisitionEnvelope, AcquisitionPolicyError, AcquisitionRunCounters, AcquisitionRunRecord,
  IAcquisitionRepository, IExternalAcquisitionAdapter, SourcePolicyGate, UCL6_GLOBAL_PILOT_LIMIT,
} from "../../domain";

export type PreviewDisposition = "NEW" | "DUPLICATE" | "CHANGED" | "REJECTED";
export interface IAcquisitionStager {
  preview(sourceId: string, envelope: AcquisitionEnvelope): Promise<PreviewDisposition>;
  stage(sourceId: string, runId: string, envelope: AcquisitionEnvelope): Promise<{ disposition: PreviewDisposition; status: string }>;
}

export class RunControlledAcquisition {
  constructor(
    private readonly repository: IAcquisitionRepository,
    private readonly adapter: IExternalAcquisitionAdapter,
    private readonly stager: IAcquisitionStager
  ) {}

  public async execute(input: { sourceId: string; initiatedByUserId: string; dryRun: boolean; limit: number; cursor?: string }): Promise<AcquisitionRunRecord> {
    if (!input.sourceId?.trim() || input.sourceId.length > 200) throw new AcquisitionPolicyError("INVALID_SOURCE_ID", "sourceId is invalid.");
    if (!input.initiatedByUserId?.trim()) throw new AcquisitionPolicyError("INVALID_ACTOR", "Authenticated actor is required.");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > UCL6_GLOBAL_PILOT_LIMIT) throw new AcquisitionPolicyError("INVALID_LIMIT", "limit must be between 1 and 1000.");
    if (input.cursor && input.cursor.length > 500) throw new AcquisitionPolicyError("INVALID_CURSOR", "cursor is invalid.");
    const source = await this.repository.getGovernedSource(input.sourceId.trim());
    if (!source) throw new AcquisitionPolicyError("SOURCE_NOT_FOUND", "Source was not found.");
    SourcePolicyGate.assertCanAcquire(source);
    if (input.limit > source.maxRecordsPerRun) throw new AcquisitionPolicyError("RUN_QUOTA_EXCEEDED", "Requested limit exceeds the source run quota.");
    const policySnapshot = {
      approvalState: source.approvalState, commercialUseState: source.commercialUseState,
      redistributionState: source.redistributionState, healthStatus: source.healthStatus,
      licenseReferenceUrl: source.licenseReferenceUrl, maxRecordsPerRun: source.maxRecordsPerRun,
      maxRecordsPerDay: source.maxRecordsPerDay, maxRequestsPerMinute: source.maxRequestsPerMinute,
    };
    const run = await this.repository.reserveRun({ source, initiatedByUserId: input.initiatedByUserId, dryRun: input.dryRun, requestedLimit: input.limit, policySnapshot });
    const counters: AcquisitionRunCounters = { fetchedCount: 0, acceptedCount: 0, stagedCount: 0, duplicateCount: 0, changedCount: 0, reviewRequiredCount: 0, publishedCount: 0, rejectedCount: 0, failedCount: 0, retryCount: 0 };
    try {
      const page = await this.adapter.acquire({ source, limit: input.limit, cursor: input.cursor });
      if (page.records.length > input.limit) throw new Error("Adapter exceeded the reserved record bound.");
      const governedOrigin = new URL(source.url!).origin;
      for (const envelope of page.records) {
        if (new URL(envelope.canonicalSourceUrl).origin !== governedOrigin) throw new Error("Adapter returned a record outside the governed source origin.");
      }
      counters.fetchedCount = page.records.length; counters.retryCount = page.retryCount;
      for (const envelope of page.records) {
        try {
          const outcome = input.dryRun ? { disposition: await this.stager.preview(source.id, envelope), status: "PREVIEW" } : await this.stager.stage(source.id, run.id, envelope);
          if (outcome.disposition === "REJECTED") { counters.rejectedCount++; continue; }
          counters.acceptedCount++;
          if (outcome.disposition === "DUPLICATE") counters.duplicateCount++;
          if (outcome.disposition === "CHANGED") counters.changedCount++;
          if (!input.dryRun && outcome.disposition !== "DUPLICATE") counters.stagedCount++;
          if (outcome.status === "NEEDS_REVIEW") counters.reviewRequiredCount++;
        } catch { counters.rejectedCount++; }
      }
      const status = counters.failedCount ? "PARTIAL" : "COMPLETED";
      return await this.repository.completeRun(run.id, status, counters, { continuationCursor: page.continuationCursor });
    } catch {
      counters.failedCount++;
      return await this.repository.completeRun(run.id, "FAILED", counters, { safeErrorSummary: "Acquisition failed at the governed external boundary." });
    }
  }
}
