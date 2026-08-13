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
  channel: QuotationDeliveryChannel;
  recipient: string;
  status?: QuotationDeliveryStatus;
  providerMessageId?: string | null;
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
  public readonly channel: QuotationDeliveryChannel;
  public readonly recipient: string;
  public readonly attemptedAt: Date;
  public readonly createdAt: Date;

  private _status: QuotationDeliveryStatus;
  private _providerMessageId: string | null;
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
    this.channel = props.channel;
    this.recipient = props.recipient.trim();
    this.attemptedAt = props.attemptedAt;
    this.createdAt = props.createdAt ?? props.attemptedAt;
    this._updatedAt = props.updatedAt ?? this.createdAt;
    this._status = props.status ?? "PENDING";
    this._providerMessageId = props.providerMessageId?.trim() || null;
    this._errorCode = props.errorCode?.trim() || null;
    this._errorMessage = props.errorMessage?.trim() || null;
    this._sentAt = props.sentAt ?? null;
  }

  get status(): QuotationDeliveryStatus { return this._status; }
  get providerMessageId(): string | null { return this._providerMessageId; }
  get errorCode(): string | null { return this._errorCode; }
  get errorMessage(): string | null { return this._errorMessage; }
  get sentAt(): Date | null { return this._sentAt; }
  get updatedAt(): Date { return this._updatedAt; }

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
