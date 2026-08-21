export type IngestionStatus =
  | "RECEIVED"
  | "NORMALIZED"
  | "MATCHED"
  | "PROCESSING"
  | "PUBLISHED"
  | "NEEDS_REVIEW"
  | "REJECTED"
  | "FAILED";

export interface UniversalIngestionRecordProps {
  id: string;
  sourceId: string;
  sourceExternalId: string;
  entityType?: string;
  rawPayload: Record<string, unknown>;
  payloadHash: string;
  status: IngestionStatus;
  normalizedData?: Record<string, unknown> | null;
  matchedItemId?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  processingStartedAt?: Date | null;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UniversalIngestionRecord {
  public readonly id: string;
  public readonly sourceId: string;
  public readonly sourceExternalId: string;
  public readonly entityType: string;
  public readonly rawPayload: Record<string, unknown>;
  public readonly payloadHash: string;
  public readonly status: IngestionStatus;
  public readonly normalizedData: Record<string, unknown> | null;
  public readonly matchedItemId: string | null;
  public readonly errorMessage: string | null;
  public readonly retryCount: number;
  public readonly processingStartedAt: Date | null;
  public readonly processedAt: Date | null;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: UniversalIngestionRecordProps) {
    if (!props.sourceId || props.sourceId.trim() === "") {
      throw new Error("sourceId cannot be empty");
    }
    if (!props.sourceExternalId || props.sourceExternalId.trim() === "") {
      throw new Error("sourceExternalId cannot be empty");
    }
    if (!props.payloadHash || props.payloadHash.trim() === "") {
      throw new Error("payloadHash cannot be empty");
    }

    this.id = props.id;
    this.sourceId = props.sourceId.trim();
    this.sourceExternalId = props.sourceExternalId.trim();
    this.entityType = props.entityType ?? "ITEM";
    this.rawPayload = props.rawPayload;
    this.payloadHash = props.payloadHash.trim();
    this.status = props.status;
    this.normalizedData = props.normalizedData ?? null;
    this.matchedItemId = props.matchedItemId ?? null;
    this.errorMessage = props.errorMessage ?? null;
    this.retryCount = props.retryCount ?? 0;
    if (!Number.isInteger(this.retryCount) || this.retryCount < 0) throw new Error("retryCount cannot be negative");
    this.processingStartedAt = props.processingStartedAt ?? null;
    this.processedAt = props.processedAt ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
