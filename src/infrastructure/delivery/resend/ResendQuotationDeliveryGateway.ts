import type {
  QuotationDeliveryGateway,
  QuotationDeliveryGatewayInput,
  QuotationDeliveryGatewayResult,
} from "@/src/application/quotation-delivery";

export type ResendSendInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: "application/pdf";
  }>;
};

export type ResendSendError = {
  name?: string;
  message?: string;
  statusCode?: number | null;
};

export interface ResendEmailTransport {
  send(
    input: ResendSendInput,
    options: { idempotencyKey: string },
  ): Promise<{
    data: { id: string } | null;
    error: ResendSendError | null;
  }>;
}

const MAX_RESEND_ATTACHMENT_BYTES = 30 * 1024 * 1024;

function content(locale: "ar" | "en") {
  if (locale === "ar") {
    return {
      subject: "عرض السعر الخاص بكم",
      text: "مرحبًا،\n\nيرجى الاطلاع على عرض السعر المرفق.\n\nمع خالص التحية،\nVOKA",
      html: '<div dir="rtl" lang="ar"><p>مرحبًا،</p><p>يرجى الاطلاع على عرض السعر المرفق.</p><p>مع خالص التحية،<br>VOKA</p></div>',
    };
  }

  return {
    subject: "Your quotation",
    text: "Hello,\n\nPlease find attached our quotation for your review.\n\nKind regards,\nVOKA",
    html: '<div lang="en"><p>Hello,</p><p>Please find attached our quotation for your review.</p><p>Kind regards,<br>VOKA</p></div>',
  };
}

function mapError(error: ResendSendError): QuotationDeliveryGatewayResult {
  const name = error.name?.toLowerCase() ?? "";

  if (["missing_api_key", "invalid_api_key", "restricted_api_key"].includes(name)) {
    return {
      success: false,
      errorCode: "DELIVERY_EMAIL_AUTH_FAILED",
      errorMessage: "Email provider authentication failed.",
    };
  }
  if (["rate_limit_exceeded", "monthly_quota_exceeded", "daily_quota_exceeded"].includes(name)) {
    return {
      success: false,
      errorCode: "DELIVERY_EMAIL_RATE_LIMITED",
      errorMessage: "Email provider rate limit was reached.",
    };
  }
  if (["invalid_idempotent_request", "concurrent_idempotent_requests", "invalid_idempotency_key"].includes(name)) {
    return {
      success: false,
      errorCode: "DELIVERY_EMAIL_IDEMPOTENCY_CONFLICT",
      errorMessage: "Email provider rejected the delivery request identity.",
    };
  }
  if ([
    "validation_error",
    "invalid_attachment",
    "invalid_from_address",
    "invalid_parameter",
    "missing_required_field",
  ].includes(name)) {
    return {
      success: false,
      errorCode: "DELIVERY_EMAIL_INVALID_REQUEST",
      errorMessage: "Email provider rejected the delivery request.",
    };
  }
  if (["security_error", "invalid_access"].includes(name)) {
    return {
      success: false,
      errorCode: "DELIVERY_EMAIL_PROVIDER_REJECTED",
      errorMessage: "Email provider rejected the delivery.",
    };
  }

  return {
    success: false,
    errorCode: "DELIVERY_EMAIL_PROVIDER_ERROR",
    errorMessage: "Email provider failed safely.",
  };
}

export class ResendQuotationDeliveryGateway
  implements QuotationDeliveryGateway {
  constructor(
    private readonly transport: ResendEmailTransport,
    private readonly from: string,
  ) {}

  async deliver(
    input: QuotationDeliveryGatewayInput,
  ): Promise<QuotationDeliveryGatewayResult> {
    if (input.channel !== "EMAIL") {
      return {
        success: false,
        errorCode: "DELIVERY_PROVIDER_NOT_CONFIGURED",
        errorMessage: "Quotation delivery provider is not configured.",
      };
    }

    if (input.document.bytes.byteLength > MAX_RESEND_ATTACHMENT_BYTES) {
      return {
        success: false,
        errorCode: "DELIVERY_EMAIL_INVALID_REQUEST",
        errorMessage: "Quotation PDF exceeds the email provider size limit.",
      };
    }

    const message = content(input.locale);

    try {
      const result = await this.transport.send(
        {
          from: this.from,
          to: input.recipient,
          subject: message.subject,
          html: message.html,
          text: message.text,
          attachments: [{
            filename: input.document.filename,
            content: Buffer.from(input.document.bytes),
            contentType: input.document.contentType,
          }],
        },
        { idempotencyKey: input.providerRequestKey },
      );

      if (result.error) return mapError(result.error);
      if (!result.data?.id) {
        return mapError({ name: "provider_response_missing_id" });
      }

      return { success: true, providerMessageId: result.data.id };
    } catch {
      return mapError({ name: "unexpected_provider_error" });
    }
  }
}
