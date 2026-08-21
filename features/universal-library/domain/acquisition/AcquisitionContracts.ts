export type SourceApprovalState = "DRAFT" | "APPROVED" | "PAUSED" | "BLOCKED";
export type SourcePolicyState = "UNKNOWN" | "ALLOWED" | "DISALLOWED";
export type SourceHealth = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "BLOCKED";
export type AcquisitionRunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "BLOCKED" | "CANCELLED";

export interface GovernedAcquisitionSource {
  id: string;
  name: string;
  url: string | null;
  isActive: boolean;
  approvalState: SourceApprovalState;
  commercialUseState: SourcePolicyState;
  redistributionState: SourcePolicyState;
  healthStatus: SourceHealth;
  licenseInfo: string | null;
  licenseReferenceUrl: string | null;
  robotsPolicy: string | null;
  attributionRequired: boolean;
  maxRequestsPerMinute: number;
  maxRecordsPerRun: number;
  maxRecordsPerDay: number;
  acquisitionTimeoutMs: number;
  maxRetries: number;
}

export interface AcquisitionEnvelope {
  externalRecordId: string;
  rawPayload: Record<string, unknown>;
  canonicalSourceUrl: string;
  fetchedAt: Date;
  attribution?: string;
  licenseReferenceUrl?: string;
}

export interface AcquisitionPage {
  records: AcquisitionEnvelope[];
  continuationCursor?: string;
  retryCount: number;
}

export interface IExternalAcquisitionAdapter {
  acquire(input: { source: GovernedAcquisitionSource; limit: number; cursor?: string }): Promise<AcquisitionPage>;
}

export interface AcquisitionRunCounters {
  fetchedCount: number; acceptedCount: number; stagedCount: number; duplicateCount: number;
  changedCount: number; reviewRequiredCount: number; publishedCount: number;
  rejectedCount: number; failedCount: number; retryCount: number;
}

export interface AcquisitionRunRecord extends AcquisitionRunCounters {
  id: string; sourceId: string; initiatedByUserId: string; dryRun: boolean;
  status: AcquisitionRunStatus; requestedLimit: number; continuationCursor?: string | null;
  safeErrorSummary?: string | null; policySnapshot: Record<string, unknown>;
  startedAt: Date; completedAt?: Date | null;
}

export interface IAcquisitionRepository {
  getGovernedSource(sourceId: string): Promise<GovernedAcquisitionSource | null>;
  reserveRun(input: { source: GovernedAcquisitionSource; initiatedByUserId: string; dryRun: boolean; requestedLimit: number; policySnapshot: Record<string, unknown> }): Promise<AcquisitionRunRecord>;
  completeRun(id: string, status: AcquisitionRunStatus, counters: AcquisitionRunCounters, extra?: { continuationCursor?: string; safeErrorSummary?: string }): Promise<AcquisitionRunRecord>;
  getRun(id: string): Promise<AcquisitionRunRecord | null>;
  listRuns(limit: number): Promise<AcquisitionRunRecord[]>;
}

export class AcquisitionPolicyError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "AcquisitionPolicyError"; }
}

export class SourcePolicyGate {
  public static assertCanAcquire(source: GovernedAcquisitionSource): void {
    if (!source.isActive) throw new AcquisitionPolicyError("SOURCE_INACTIVE", "Source is inactive.");
    if (source.approvalState !== "APPROVED") throw new AcquisitionPolicyError("SOURCE_NOT_APPROVED", "Source is not approved.");
    if (source.healthStatus === "BLOCKED") throw new AcquisitionPolicyError("SOURCE_HEALTH_BLOCKED", "Source health is blocked.");
    if (source.commercialUseState !== "ALLOWED") throw new AcquisitionPolicyError("COMMERCIAL_USE_NOT_ALLOWED", "Commercial use is not explicitly allowed.");
    if (source.redistributionState !== "ALLOWED") throw new AcquisitionPolicyError("REDISTRIBUTION_NOT_ALLOWED", "Redistribution is not explicitly allowed.");
    if (!source.url) throw new AcquisitionPolicyError("SOURCE_URL_MISSING", "Source endpoint is missing.");
    if (!source.licenseInfo?.trim() || !source.licenseReferenceUrl?.trim()) throw new AcquisitionPolicyError("LICENSE_EVIDENCE_MISSING", "License evidence is incomplete.");
    if (source.robotsPolicy === "DISALLOWED") throw new AcquisitionPolicyError("SOURCE_POLICY_BLOCKED", "Source usage policy blocks acquisition.");
  }
}

export const UCL6_GLOBAL_PILOT_LIMIT = 1000;
export const UCL6_MAX_RESPONSE_BYTES = 1_048_576;
