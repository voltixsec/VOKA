import type {
  QuotationDeliveryGateway,
  QuotationDeliveryGatewayInput,
  QuotationDeliveryGatewayResult,
} from "@/src/application/quotation-delivery";

import type { MetaWhatsAppTransport, MetaWhatsAppTransportResponse } from "./MetaWhatsAppCloudTransport";

type LocaleConfiguration = { templateName: string; languageCode: string };

export class MetaWhatsAppQuotationDeliveryGateway implements QuotationDeliveryGateway {
  constructor(
    private readonly transport: MetaWhatsAppTransport,
    private readonly locales: Partial<Record<"ar" | "en", LocaleConfiguration>>,
    private readonly maximumDocumentBytes = 100 * 1024 * 1024,
  ) {}

  async deliver(input: QuotationDeliveryGatewayInput): Promise<QuotationDeliveryGatewayResult> {
    if (input.channel !== "WHATSAPP") return notConfigured();
    const locale = this.locales[input.locale];
    if (!locale) return notConfigured();
    if (input.document.bytes.byteLength > this.maximumDocumentBytes) {
      return failure("DELIVERY_WHATSAPP_DOCUMENT_TOO_LARGE", "The quotation document is too large for WhatsApp delivery.");
    }

    try {
      const upload = await this.transport.uploadDocument(input.document);
      if (!upload.ok) return mapFailure(upload, "upload");
      const mediaId = readString(upload.data, "id");
      if (!mediaId) {
        return failure("DELIVERY_WHATSAPP_MEDIA_UPLOAD_FAILED", "WhatsApp could not accept the quotation document.");
      }

      const sent = await this.transport.sendTemplate({
        recipient: input.recipient,
        templateName: locale.templateName,
        languageCode: locale.languageCode,
        mediaId,
        filename: input.document.filename,
      });
      if (!sent.ok) return mapFailure(sent, "send");
      const providerMessageId = readMessageId(sent.data);
      if (!providerMessageId) {
        return failure("DELIVERY_WHATSAPP_PROVIDER_ERROR", "WhatsApp did not confirm quotation delivery.");
      }
      return { success: true, providerMessageId };
    } catch {
      return failure("DELIVERY_WHATSAPP_PROVIDER_ERROR", "WhatsApp delivery could not be completed.");
    }
  }
}

function readString(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object") return null;
  const result = (data as Record<string, unknown>)[key];
  return typeof result === "string" && result.trim() ? result : null;
}

function readMessageId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const messages = (data as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || !messages[0] || typeof messages[0] !== "object") return null;
  return readString(messages[0], "id");
}

function mapFailure(response: MetaWhatsAppTransportResponse, operation: "upload" | "send"): QuotationDeliveryGatewayResult {
  const providerCode = readProviderErrorCode(response.data);
  if (response.status === 401 || response.status === 403 || providerCode === 190) {
    return failure("DELIVERY_WHATSAPP_AUTH_FAILED", "WhatsApp delivery authentication failed.");
  }
  if (response.status === 429 || [4, 17, 32, 613, 130429].includes(providerCode ?? -1)) {
    return failure("DELIVERY_WHATSAPP_RATE_LIMITED", "WhatsApp delivery is temporarily rate limited.");
  }
  if (response.status === 400 || response.status === 422) {
    return failure("DELIVERY_WHATSAPP_INVALID_REQUEST", "WhatsApp rejected the delivery request.");
  }
  return operation === "upload"
    ? failure("DELIVERY_WHATSAPP_MEDIA_UPLOAD_FAILED", "WhatsApp could not accept the quotation document.")
    : failure("DELIVERY_WHATSAPP_PROVIDER_ERROR", "WhatsApp delivery could not be completed.");
}

function readProviderErrorCode(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

function notConfigured(): QuotationDeliveryGatewayResult {
  return failure("DELIVERY_PROVIDER_NOT_CONFIGURED", "WhatsApp delivery is not configured for this language.");
}

function failure(errorCode: string, errorMessage: string): QuotationDeliveryGatewayResult {
  return { success: false, errorCode, errorMessage };
}
