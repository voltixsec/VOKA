import { describe, expect, it, vi } from "vitest";

import { MetaWhatsAppCloudTransport } from "../MetaWhatsAppCloudTransport";

const document = {
  filename: "quotation-Q-001.pdf",
  contentType: "application/pdf" as const,
  bytes: new Uint8Array([37, 80, 68, 70]),
};

describe("MetaWhatsAppCloudTransport", () => {
  it("uploads the PDF to the configured Graph API phone endpoint", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "media-1" }), { status: 200 }));
    const transport = new MetaWhatsAppCloudTransport({
      accessToken: "test-secret-token",
      phoneNumberId: "phone/id",
      graphApiVersion: "v23.0",
    }, request);

    const result = await transport.uploadDocument(document);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const file = form.get("file") as File;

    expect(url).toBe("https://graph.facebook.com/v23.0/phone%2Fid/media");
    expect(init.headers).toEqual({ Authorization: "Bearer test-secret-token" });
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(file.name).toBe(document.filename);
    expect(file.type).toBe("application/pdf");
    expect(file.size).toBe(4);
    expect(result).toEqual({ ok: true, status: 200, data: { id: "media-1" } });
  });

  it("sends an approved document-header template with the uploaded media ID", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    const transport = new MetaWhatsAppCloudTransport({
      accessToken: "token",
      phoneNumberId: "123",
      graphApiVersion: "v23.0",
    }, request);

    await transport.sendTemplate({
      recipient: "96590000000",
      templateName: "quotation_en",
      languageCode: "en_US",
      mediaId: "media-1",
      filename: document.filename,
    });
    const [url, init] = request.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "96590000000",
      type: "template",
      template: {
        name: "quotation_en",
        language: { code: "en_US" },
        components: [{
          type: "header",
          parameters: [{
            type: "document",
            document: { id: "media-1", filename: document.filename },
          }],
        }],
      },
    });
  });
});
