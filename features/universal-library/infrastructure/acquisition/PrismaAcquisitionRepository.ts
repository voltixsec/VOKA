import type { PrismaClient } from "@/lib/generated/prisma/client";
import { AcquisitionPolicyError, AcquisitionRunCounters, AcquisitionRunRecord, GovernedAcquisitionSource, IAcquisitionRepository, UCL6_GLOBAL_PILOT_LIMIT } from "../../domain";

export class PrismaAcquisitionRepository implements IAcquisitionRepository {
  constructor(private readonly prisma: PrismaClient) {}
  public async getGovernedSource(sourceId: string): Promise<GovernedAcquisitionSource | null> {
    const source: any = await (this.prisma as any).universalSource.findUnique({ where: { id: sourceId } });
    return source ? this.mapSource(source) : null;
  }
  public async reserveRun(input: { source: GovernedAcquisitionSource; initiatedByUserId: string; dryRun: boolean; requestedLimit: number; policySnapshot: Record<string, unknown> }): Promise<AcquisitionRunRecord> {
    return (this.prisma as any).$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(8546006)`;
      const now = new Date(); const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
      const minuteStart = new Date(now.getTime() - 60_000);
      const [daily, global, recent] = await Promise.all([
        tx.universalAcquisitionRun.aggregate({ where: { sourceId: input.source.id, createdAt: { gte: dayStart }, status: { notIn: ["BLOCKED", "CANCELLED"] } }, _sum: { requestedLimit: true } }),
        tx.universalAcquisitionRun.aggregate({ where: { dryRun: false, status: { notIn: ["BLOCKED", "CANCELLED"] } }, _sum: { requestedLimit: true } }),
        tx.universalAcquisitionRun.aggregate({ where: { sourceId: input.source.id, createdAt: { gte: minuteStart } }, _sum: { reservedRequestCount: true } }),
      ]);
      if ((daily._sum.requestedLimit ?? 0) + input.requestedLimit > input.source.maxRecordsPerDay) throw new AcquisitionPolicyError("DAILY_QUOTA_EXCEEDED", "Source daily quota is exhausted.");
      if (!input.dryRun && (global._sum.requestedLimit ?? 0) + input.requestedLimit > UCL6_GLOBAL_PILOT_LIMIT) throw new AcquisitionPolicyError("GLOBAL_PILOT_LIMIT", "Global UCL-6 pilot limit is exhausted.");
      const requestReservation = 1 + input.source.maxRetries;
      if ((recent._sum.reservedRequestCount ?? 0) + requestReservation > input.source.maxRequestsPerMinute) throw new AcquisitionPolicyError("RATE_LIMITED", "Source request rate limit is exhausted.");
      const record = await tx.universalAcquisitionRun.create({ data: { sourceId: input.source.id, initiatedByUserId: input.initiatedByUserId, dryRun: input.dryRun, status: "RUNNING", requestedLimit: input.requestedLimit, reservedRequestCount: requestReservation, policySnapshot: input.policySnapshot } });
      return this.mapRun(record);
    }, { isolationLevel: "Serializable" });
  }
  public async completeRun(id: string, status: any, counters: AcquisitionRunCounters, extra: { continuationCursor?: string; safeErrorSummary?: string } = {}): Promise<AcquisitionRunRecord> {
    if (counters.acceptedCount + counters.rejectedCount > counters.fetchedCount || counters.stagedCount > counters.acceptedCount) throw new Error("Acquisition counters are inconsistent.");
    const record = await (this.prisma as any).universalAcquisitionRun.update({ where: { id }, data: { status, ...counters, continuationCursor: extra.continuationCursor, safeErrorSummary: extra.safeErrorSummary?.slice(0, 500), completedAt: new Date() } });
    await (this.prisma as any).universalSource.update({ where: { id: record.sourceId }, data: status === "COMPLETED" ? { lastAcquisitionSucceededAt: new Date(), healthStatus: "HEALTHY" } : { lastAcquisitionFailedAt: new Date(), healthStatus: "DEGRADED" } });
    return this.mapRun(record);
  }
  public async getRun(id: string): Promise<AcquisitionRunRecord | null> { const record = await (this.prisma as any).universalAcquisitionRun.findUnique({ where: { id } }); return record ? this.mapRun(record) : null; }
  public async listRuns(limit: number): Promise<AcquisitionRunRecord[]> { const records = await (this.prisma as any).universalAcquisitionRun.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: Math.min(Math.max(limit, 1), 100) }); return records.map((record: any) => this.mapRun(record)); }
  private mapSource(s: any): GovernedAcquisitionSource { return { id: s.id, name: s.name, url: s.url, isActive: s.isActive, approvalState: s.approvalState, commercialUseState: s.commercialUseState, redistributionState: s.redistributionState, healthStatus: s.healthStatus, licenseInfo: s.licenseInfo, licenseReferenceUrl: s.licenseReferenceUrl, robotsPolicy: s.robotsPolicy, attributionRequired: s.attributionRequired, maxRequestsPerMinute: s.maxRequestsPerMinute, maxRecordsPerRun: s.maxRecordsPerRun, maxRecordsPerDay: s.maxRecordsPerDay, acquisitionTimeoutMs: s.acquisitionTimeoutMs, maxRetries: s.maxRetries }; }
  private mapRun(r: any): AcquisitionRunRecord { return { id: r.id, sourceId: r.sourceId, initiatedByUserId: r.initiatedByUserId, dryRun: r.dryRun, status: r.status, requestedLimit: r.requestedLimit, fetchedCount: r.fetchedCount, acceptedCount: r.acceptedCount, stagedCount: r.stagedCount, duplicateCount: r.duplicateCount, changedCount: r.changedCount, reviewRequiredCount: r.reviewRequiredCount, publishedCount: r.publishedCount, rejectedCount: r.rejectedCount, failedCount: r.failedCount, retryCount: r.retryCount, continuationCursor: r.continuationCursor, safeErrorSummary: r.safeErrorSummary, policySnapshot: r.policySnapshot as Record<string, unknown>, startedAt: r.startedAt, completedAt: r.completedAt }; }
}
