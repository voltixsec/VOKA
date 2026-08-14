import type { QuotationDocument } from "@/src/application/document";

export type MetaWhatsAppTransportResponse = {
  ok: boolean;
  status: number;
  data: unknown;
};

export type MetaWhatsAppTemplateInput = {
  recipient: string;
  templateName: string;
  languageCode: string;
  mediaId: string;
  filename: string;
};

export interface MetaWhatsAppTransport {
  uploadDocument(document: QuotationDocument): Promise<MetaWhatsAppTransportResponse>;
  sendTemplate(input: MetaWhatsAppTemplateInput): Promise<MetaWhatsAppTransportResponse>;
}

type Fetch = typeof fetch;

export class MetaWhatsAppCloudTransport implements MetaWhatsAppTransport {
  private readonly endpoint: string;

  constructor(
    private readonly configuration: {
      accessToken: string;
      phoneNumberId: string;
      graphApiVersion: string;
    },
    private readonly request: Fetch = fetch,
  ) {
    this.endpoint = `https://graph.facebook.com/${configuration.graphApiVersion}/${encodeURIComponent(configuration.phoneNumberId)}`;
  }

  async uploadDocument(document: QuotationDocument): Promise<MetaWhatsAppTransportResponse> {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set(
      "file",
      new Blob([document.bytes], { type: document.contentType }),
      document.filename,
    );

    const response = await this.request(`${this.endpoint}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.configuration.accessToken}` },
      body: form,
    });
    return this.toResponse(response);
  }

  async sendTemplate(input: MetaWhatsAppTemplateInput): Promise<MetaWhatsAppTransportResponse> {
    const response = await this.request(`${this.endpoint}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.configuration.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.recipient,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          components: [{
            type: "header",
            parameters: [{
              type: "document",
              document: { id: input.mediaId, filename: input.filename },
            }],
          }],
        },
      }),
    });
    return this.toResponse(response);
  }

  private async toResponse(response: Response): Promise<MetaWhatsAppTransportResponse> {
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // A provider may return an empty/non-JSON error body; callers only receive safe mappings.
    }
    return { ok: response.ok, status: response.status, data };
  }
}
