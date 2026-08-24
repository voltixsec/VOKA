export const quotationDeliveryChannels = [
  "EMAIL",
  "WHATSAPP",
] as const;

export type QuotationDeliveryChannel =
  (typeof quotationDeliveryChannels)[number];

export type QuotationDeliveryStatus =
  | "PENDING"
  | "SENT"
  | "FAILED";

export function isQuotationDeliveryChannel(
  value: unknown,
): value is QuotationDeliveryChannel {
  return quotationDeliveryChannels.includes(
    value as QuotationDeliveryChannel,
  );
}

export type QuotationDeliveryProps = {
  id: string;
  companyId: string;
  quotationId: string;
  actorUserId?: string | null;
  requestKey?: string;
  channel: QuotationDeliveryChannel;
  recipient: string;
  provider?: string;
  status?: QuotationDeliveryStatus;
  providerMessageId?: string | null;
  documentSha256?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptedAt: Date;
  sentAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export class QuotationDelivery {
  public readonly id: string;
  public readonly companyId: string;
  public readonly quotationId: string;
  public readonly actorUserId: string | null;
  public readonly requestKey: string;
  public readonly channel: QuotationDeliveryChannel;
  public readonly recipient: string;
  public readonly provider: string;
  public readonly attemptedAt: Date;
  public readonly createdAt: Date;

  private _status: QuotationDeliveryStatus;
  private _providerMessageId: string | null;
  private _documentSha256: string | null;
  private _errorCode: string | null;
  private _errorMessage: string | null;
  private _sentAt: Date | null;
  private _updatedAt: Date;

  constructor(props: QuotationDeliveryProps) {
    if (!props.id.trim()) throw new Error("Delivery id is required.");
    if (!props.companyId.trim()) throw new Error("Company id is required.");
    if (!props.quotationId.trim()) throw new Error("Quotation id is required.");
    if (!isQuotationDeliveryChannel(props.channel)) {
      throw new Error("Quotation delivery channel is invalid.");
    }
    if (!props.recipient.trim()) throw new Error("Delivery recipient is required.");

    this.id = props.id.trim();
    this.companyId = props.companyId.trim();
    this.quotationId = props.quotationId.trim();
    this.actorUserId = props.actorUserId?.trim() || null;
    this.requestKey = props.requestKey?.trim() || this.id;
    this.channel = props.channel;
    this.recipient = props.recipient.trim();
    this.provider = props.provider?.trim() || "UNKNOWN";
    this.attemptedAt = props.attemptedAt;
    this.createdAt = props.createdAt ?? props.attemptedAt;
    this._updatedAt = props.updatedAt ?? this.createdAt;
    this._status = props.status ?? "PENDING";
    this._providerMessageId = props.providerMessageId?.trim() || null;
    this._documentSha256 = props.documentSha256?.trim() || null;
    this._errorCode = props.errorCode?.trim() || null;
    this._errorMessage = props.errorMessage?.trim() || null;
    this._sentAt = props.sentAt ?? null;
  }

  get status(): QuotationDeliveryStatus { return this._status; }
  get providerMessageId(): string | null { return this._providerMessageId; }
  get documentSha256(): string | null { return this._documentSha256; }
  get errorCode(): string | null { return this._errorCode; }
  get errorMessage(): string | null { return this._errorMessage; }
  get sentAt(): Date | null { return this._sentAt; }
  get updatedAt(): Date { return this._updatedAt; }

  attachDocumentSha256(value: string, updatedAt: Date): void {
    this.assertPending();
    if (!/^[a-f0-9]{64}$/.test(value)) {
      throw new Error("Delivery document SHA-256 is invalid.");
    }
    this._documentSha256 = value;
    this._updatedAt = updatedAt;
  }

  markSent(providerMessageId: string | null, sentAt: Date): void {
    this.assertPending();
    this._status = "SENT";
    this._providerMessageId = providerMessageId?.trim() || null;
    this._errorCode = null;
    this._errorMessage = null;
    this._sentAt = sentAt;
    this._updatedAt = sentAt;
  }

  markFailed(errorCode: string, errorMessage: string, failedAt: Date): void {
    this.assertPending();
    if (!errorCode.trim()) throw new Error("Delivery error code is required.");
    this._status = "FAILED";
    this._providerMessageId = null;
    this._errorCode = errorCode.trim();
    this._errorMessage = errorMessage.trim() || "Quotation delivery failed.";
    this._sentAt = null;
    this._updatedAt = failedAt;
  }

  private assertPending(): void {
    if (this._status !== "PENDING") {
      throw new Error("Only pending delivery attempts can be completed.");
    }
  }
}
