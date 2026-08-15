// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import QuotationDetailsPage from "../page";

let isArabic = false;
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

type QuotationTestLine = {
  id?: string;
  position: number;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  quantity: number;
  unitPrice: number;
  unitName?: string | null;
  unitNameAr?: string | null;
  unitNameEn?: string | null;
  taxAmount: number;
  totalAmount: number;
};

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ quotationId: "quotation-1" }),
  useRouter: () => ({ push: navigation.push }),
}));

function quotation(
  localizationStatus: "PENDING" | "COMPLETED" | "FAILED",
  status = "SENT",
) {
  return {
    id: "quotation-1",
    quotationNumber: "QT-1001",
    status,
    issueDate: "2026-08-14T00:00:00.000Z",
    expiryDate: null,
    currencyCode: "KWD",
    customer: { name: "Acme", email: "customer@example.com" },
    lines: [] as QuotationTestLine[],
    totals: {
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
    },
    localizationStatus,
  };
}

function response(data: unknown, meta?: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data, ...(meta === undefined ? {} : { meta }) }),
  };
}

beforeEach(() => {
  isArabic = false;
  navigation.push.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuotationDetailsPage localization visibility", () => {
  it("shows conversion only for APPROVED and redirects new or existing orders", async () => {
    for (const created of [true, false]) {
      cleanup();
      navigation.push.mockReset();
      const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith("/deliveries")) return response([]);
        if (input.endsWith("/convert-to-sales-order") && init?.method === "POST") {
          return response({ created, salesOrderId: "sales-order-1" });
        }
        return response(quotation("COMPLETED", "APPROVED"));
      });
      vi.stubGlobal("fetch", fetchMock);
      render(createElement(QuotationDetailsPage));

      fireEvent.click(await screen.findByRole("button", { name: "Create Sales Order" }));
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(
        "/dashboard/sales-orders/sales-order-1",
      ));
    }

    cleanup();
    vi.stubGlobal("fetch", vi.fn(async (input: string) =>
      input.endsWith("/deliveries")
        ? response([])
        : response(quotation("COMPLETED", "SENT")),
    ));
    render(createElement(QuotationDetailsPage));
    await screen.findByText("QT-1001");
    expect(screen.queryByRole("button", { name: "Create Sales Order" })).toBeNull();
  });

  it("prevents duplicate conversion clicks while processing", async () => {
    let resolveConversion!: (value: ReturnType<typeof response>) => void;
    const pending = new Promise<ReturnType<typeof response>>((resolve) => {
      resolveConversion = resolve;
    });
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) return Promise.resolve(response([]));
      if (input.endsWith("/convert-to-sales-order") && init?.method === "POST") {
        return pending;
      }
      return Promise.resolve(response(quotation("COMPLETED", "APPROVED")));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(QuotationDetailsPage));

    const button = await screen.findByRole("button", { name: "Create Sales Order" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/convert-to-sales-order"),
    )).toHaveLength(1);
    resolveConversion(response({ created: true, salesOrderId: "sales-order-1" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledOnce());
  });

  it("renders a localized safe conversion error", async () => {
    isArabic = true;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) return response([]);
      if (input.endsWith("/convert-to-sales-order") && init?.method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: "QUOTATION_NOT_APPROVED" } }),
        };
      }
      return response(quotation("COMPLETED", "APPROVED"));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(QuotationDetailsPage));

    fireEvent.click(await screen.findByRole("button", { name: "إنشاء أمر بيع" }));
    expect(await screen.findByText(
      "يجب اعتماد عرض السعر قبل إنشاء أمر البيع.",
    )).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("shows aggregate tax in the commercial totals summary", async () => {
    const value = quotation("COMPLETED", "DRAFT");
    value.totals = {
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 5,
      totalAmount: 105,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(value)));

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByText("Tax")).toBeTruthy();
    expect(screen.getByText(/KWD\s*5\.000/)).toBeTruthy();
  });

  it.each([
    [false, "English line description"],
    [true, "وصف البند العربي"],
  ] as const)("shows the active localized line description for Arabic=%s", async (arabic, expected) => {
    isArabic = arabic;
    const value = quotation("COMPLETED", "DRAFT");
    value.lines = [{
      id: "line-1",
      position: 1,
      itemName: arabic ? "بند" : "Item",
      itemNameAr: "بند",
      itemNameEn: "Item",
      description: expected,
      descriptionAr: "وصف البند العربي",
      descriptionEn: "English line description",
      quantity: 1,
      unitPrice: 10,
      unitName: arabic ? "قطعة" : "piece",
      unitNameAr: "قطعة",
      unitNameEn: "piece",
      taxAmount: 0,
      totalAmount: 10,
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(value)));

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it.each([
    ["PENDING", "Preparing translated version"],
    ["COMPLETED", "Arabic and English versions are ready"],
    ["FAILED", "Translation failed"],
  ] as const)("renders %s status", async (status, label) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quotation(status, "DRAFT"))));

    render(createElement(QuotationDetailsPage));

    const indicator = await screen.findByTestId("localization-status");
    expect(indicator.textContent).toContain(status);
    expect(indicator.textContent).toContain(label);
  });

  it.each([
    ["PENDING", true],
    ["FAILED", true],
    ["COMPLETED", false],
  ] as const)("keeps approval fencing for %s", async (status, disabled) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quotation(status))));

    render(createElement(QuotationDetailsPage));

    const approve = await screen.findByRole("button", { name: "Approve" });
    expect((approve as HTMLButtonElement).disabled).toBe(disabled);
  });

  it("uses bilingual labels while preserving lifecycle API action names", async () => {
    let status = "DRAFT";
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) return response([]);
      if (init?.method === "POST") {
        status = "SENT";
        return response({});
      }
      return response(quotation("COMPLETED", status));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    fireEvent.click(await screen.findByRole("button", { name: "Mark as sent" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quotations/quotation-1/send",
        { method: "POST" },
      );
    });
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("renders Arabic lifecycle labels", async () => {
    isArabic = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(quotation("COMPLETED"))));

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByRole("button", { name: "\u0627\u0639\u062a\u0645\u0627\u062f" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u0631\u0641\u0636" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "\u0625\u0644\u063a\u0627\u0621" })).toBeTruthy();
  });

  it("shows a localized valid-until date only when expiry is present", async () => {
    const withExpiry = {
      ...quotation("COMPLETED", "DRAFT"),
      expiryDate: "2026-09-15T20:59:59.999Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(withExpiry)));

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByText("Valid until")).toBeTruthy();
    expect(screen.getByText("15/09/2026")).toBeTruthy();

    cleanup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      response(quotation("COMPLETED", "DRAFT")),
    ));
    render(createElement(QuotationDetailsPage));

    await screen.findByText("QT-1001");
    expect(screen.queryByText("Valid until")).toBeNull();
  });

  it.each([
    [false, "Preview proposal", "en"],
    [true, "\u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0639\u0631\u0636", "ar"],
  ] as const)("renders the active-language preview action", async (
    arabic,
    label,
    locale,
  ) => {
    isArabic = arabic;
    const fetchMock = vi.fn().mockResolvedValue(
      response(quotation("COMPLETED", "DRAFT")),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    const previewButton = await screen.findByRole("button", { name: label });
    const previewLink = previewButton.closest("a");
    expect(previewLink?.getAttribute("href")).toBe(
      `/api/quotations/quotation-1/pdf?locale=${locale}&disposition=inline`,
    );
    expect(previewLink?.getAttribute("target")).toBe("_blank");
    expect(previewLink?.getAttribute("rel")).toBe("noopener noreferrer");

    const downloadButton = screen.getByRole("button", {
      name: arabic ? "\u062a\u0646\u0632\u064a\u0644 PDF" : "Download PDF",
    });
    const downloadLink = downloadButton.closest("a");
    expect(downloadLink?.getAttribute("href")).toBe(
      `/api/quotations/quotation-1/pdf?locale=${locale}`,
    );
    expect(downloadLink?.getAttribute("href")).not.toContain("disposition");

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/quotations/quotation-1?locale=${locale}`,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/quotations/quotation-1/deliveries",
    );
  });

  it("truthfully presents disabled channels and renders delivery history", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/deliveries")) {
        return response([
          {
            id: "delivery-1",
            channel: "EMAIL",
            recipient: "customer@example.com",
            status: "FAILED",
            attemptedAt: "2026-08-14T10:00:00.000Z",
          },
          {
            id: "delivery-2",
            channel: "WHATSAPP",
            recipient: "+96590000000",
            status: "SENT",
            attemptedAt: "2026-08-14T11:00:00.000Z",
          },
        ]);
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByText("Delivery")).toBeTruthy();
    expect(screen.getByText("Email provider not configured")).toBeTruthy();
    expect(screen.getByText("WhatsApp provider not configured")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send by email" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Send by WhatsApp" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/quotations/quotation-1/deliver",
      expect.anything(),
    );
    expect((await screen.findAllByText("customer@example.com")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("+96590000000")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy();
  });

  it("enables configured EMAIL, uses the active locale, and refreshes history after SENT", async () => {
    let historyLoads = 0;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        historyLoads += 1;
        return response([], {
          channels: {
            EMAIL: { configured: true, provider: "RESEND" },
            WHATSAPP: { configured: false, provider: null },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        return response({
          id: "delivery-1",
          status: "SENT",
          channel: "EMAIL",
          recipient: "customer@example.com",
        });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    const send = await screen.findByRole("button", { name: "Send by email" });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    expect(await screen.findByText("Email sent")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/quotations/quotation-1/deliver",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          channel: "EMAIL",
          recipient: "customer@example.com",
          locale: "en",
        }),
      }),
    );
    expect(historyLoads).toBeGreaterThanOrEqual(2);
    expect((screen.getByRole("button", { name: "Send by WhatsApp" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a safe FAILED result without claiming email success", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        return response([], {
          channels: {
            EMAIL: { configured: true, provider: "RESEND" },
            WHATSAPP: { configured: false, provider: null },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        return response({
          id: "delivery-1",
          status: "FAILED",
          errorMessage: "Email provider rate limit was reached.",
        });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    const send = await screen.findByRole("button", { name: "Send by email" });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    expect(await screen.findByText("Email provider rate limit was reached.")).toBeTruthy();
    expect(screen.queryByText("Email sent")).toBeNull();
  });

  it("uses the editable customer phone and active locale for configured WhatsApp delivery", async () => {
    let historyLoads = 0;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        historyLoads += 1;
        return response([], {
          channels: {
            EMAIL: { configured: false },
            WHATSAPP: { configured: true, locales: { ar: true, en: true } },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        return response({ status: "SENT", providerMessageId: "wamid.1" });
      }
      return response({
        ...quotation("COMPLETED", "DRAFT"),
        customer: { name: "Acme", phone: "+965 9000-0000" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    const recipient = await screen.findByRole("textbox", { name: "Customer WhatsApp number" });
    expect((recipient as HTMLInputElement).value).toBe("+965 9000-0000");
    fireEvent.change(recipient, { target: { value: "00965 9111 1111" } });
    const send = screen.getByRole("button", { name: "Send by WhatsApp" });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    expect(await screen.findByText("WhatsApp sent")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/quotations/quotation-1/deliver",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          channel: "WHATSAPP",
          recipient: "00965 9111 1111",
          locale: "en",
        }),
      }),
    );
    expect(historyLoads).toBeGreaterThanOrEqual(2);
    expect((screen.getByRole("button", { name: "Send by email" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps WhatsApp disabled when the active locale template is unavailable", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/deliveries")) {
        return response([], {
          channels: {
            EMAIL: { configured: false },
            WHATSAPP: { configured: true, locales: { ar: true, en: false } },
          },
        });
      }
      return response({
        ...quotation("COMPLETED", "DRAFT"),
        customer: { name: "Acme", phone: "+96590000000" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByText("WhatsApp template is not configured for English")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send by WhatsApp" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/quotations/quotation-1/deliver",
      expect.anything(),
    );
  });

  it("shows a truthful WhatsApp FAILED response without claiming success", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        return response([], {
          channels: {
            EMAIL: { configured: false },
            WHATSAPP: { configured: true, locales: { ar: false, en: true } },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        return response({
          status: "FAILED",
          errorMessage: "WhatsApp delivery is temporarily rate limited.",
        });
      }
      return response({
        ...quotation("COMPLETED", "DRAFT"),
        customer: { name: "Acme", phone: "+96590000000" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    const send = await screen.findByRole("button", { name: "Send by WhatsApp" });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send);

    expect(await screen.findByText("WhatsApp delivery is temporarily rate limited.")).toBeTruthy();
    expect(screen.queryByText("WhatsApp sent")).toBeNull();
  });

  it.each([
    [false, true, true, "customer@example.com", "+96590000000"],
    [true, false, true, "customer@example.com", "+96590000000"],
    [true, true, false, "customer@example.com", "+96590000000"],
    [true, true, true, "", "+96590000000"],
    [true, true, true, "customer@example.com", ""],
  ])("disables Both unless both channels and recipients are ready", async (
    emailConfigured,
    whatsappConfigured,
    whatsappLocaleConfigured,
    email,
    phone,
  ) => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/deliveries")) {
        return response([], {
          channels: {
            EMAIL: { configured: emailConfigured },
            WHATSAPP: {
              configured: whatsappConfigured,
              locales: { ar: whatsappLocaleConfigured, en: whatsappLocaleConfigured },
            },
          },
        });
      }
      return response({
        ...quotation("COMPLETED", "DRAFT"),
        customer: { name: "Acme", email, phone },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    const both = await screen.findByRole("button", { name: "Send by both" });
    await waitFor(() => expect((both as HTMLButtonElement).disabled).toBe(true));
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/quotations/quotation-1/deliver",
      expect.anything(),
    );
  });

  it.each([
    ["SENT", "SENT", "Quotation sent by email and WhatsApp"],
    ["SENT", "FAILED", "Email sent; WhatsApp delivery failed"],
    ["FAILED", "SENT", "WhatsApp sent; email delivery failed"],
    ["FAILED", "FAILED", "Email and WhatsApp delivery failed"],
  ] as const)("orchestrates independent Both results: %s/%s", async (
    emailStatus,
    whatsappStatus,
    expectedMessage,
  ) => {
    let historyLoads = 0;
    const attemptedChannels: string[] = [];
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        historyLoads += 1;
        return response([], {
          channels: {
            EMAIL: { configured: true },
            WHATSAPP: { configured: true, locales: { ar: true, en: true } },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        attemptedChannels.push(body.channel);
        return response({
          status: body.channel === "EMAIL" ? emailStatus : whatsappStatus,
          errorMessage: `${body.channel} safe failure`,
        });
      }
      return response({
        ...quotation("COMPLETED", "DRAFT"),
        customer: {
          name: "Acme",
          email: "customer@example.com",
          phone: "+96590000000",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    const both = await screen.findByRole("button", { name: "Send by both" });
    await waitFor(() => expect((both as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(both);

    expect(await screen.findByText(expectedMessage)).toBeTruthy();
    expect(attemptedChannels.sort()).toEqual(["EMAIL", "WHATSAPP"]);
    const bodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual(expect.arrayContaining([
      {
        channel: "EMAIL",
        recipient: "customer@example.com",
        locale: "en",
      },
      {
        channel: "WHATSAPP",
        recipient: "+96590000000",
        locale: "en",
      },
    ]));
    expect(historyLoads).toBeGreaterThanOrEqual(2);
  });

  it("shows Retry only for FAILED rows and retries only the selected Email attempt", async () => {
    let historyLoads = 0;
    const deliveries = [
      {
        id: "email-failed",
        channel: "EMAIL",
        recipient: "historical@example.com",
        status: "FAILED",
        errorMessage: "Previous safe failure",
        attemptedAt: "2026-08-14T10:00:00.000Z",
      },
      {
        id: "whatsapp-failed",
        channel: "WHATSAPP",
        recipient: "96591111111",
        status: "FAILED",
        attemptedAt: "2026-08-14T11:00:00.000Z",
      },
      {
        id: "sent",
        channel: "EMAIL",
        recipient: "sent@example.com",
        status: "SENT",
        attemptedAt: "2026-08-14T12:00:00.000Z",
      },
      {
        id: "pending",
        channel: "WHATSAPP",
        recipient: "96592222222",
        status: "PENDING",
        attemptedAt: "2026-08-14T13:00:00.000Z",
      },
    ];
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        historyLoads += 1;
        return response(deliveries, {
          channels: {
            EMAIL: { configured: true },
            WHATSAPP: { configured: true, locales: { ar: true, en: true } },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        return response({ status: "SENT" });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    const retries = await screen.findAllByRole("button", { name: "Retry" });
    expect(retries).toHaveLength(2);
    expect(screen.getByText("Previous safe failure")).toBeTruthy();
    fireEvent.click(retries[0]);

    expect(await screen.findByText("Email resent")).toBeTruthy();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      channel: "EMAIL",
      recipient: "historical@example.com",
      locale: "en",
    });
    expect(historyLoads).toBeGreaterThanOrEqual(2);
  });

  it("retries only failed WhatsApp with its historical recipient and current Arabic locale", async () => {
    isArabic = true;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        return response([{
          id: "whatsapp-failed",
          channel: "WHATSAPP",
          recipient: "96591111111",
          status: "FAILED",
          attemptedAt: "2026-08-14T11:00:00.000Z",
        }], {
          channels: {
            EMAIL: { configured: true },
            WHATSAPP: { configured: true, locales: { ar: true, en: false } },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        return response({ status: "SENT" });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    fireEvent.click(await screen.findByRole("button", { name: "إعادة المحاولة" }));

    expect(await screen.findByText("تمت إعادة الإرسال عبر واتساب")).toBeTruthy();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      channel: "WHATSAPP",
      recipient: "96591111111",
      locale: "ar",
    });
  });

  it.each([
    ["EMAIL", false, true, true],
    ["WHATSAPP", true, false, true],
    ["WHATSAPP", true, true, false],
  ] as const)("disables %s Retry when its provider or locale is unavailable", async (
    channel,
    emailConfigured,
    whatsappConfigured,
    localeConfigured,
  ) => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/deliveries")) {
        return response([{
          id: "failed",
          channel,
          recipient: channel === "EMAIL" ? "old@example.com" : "96591111111",
          status: "FAILED",
          attemptedAt: "2026-08-14T11:00:00.000Z",
        }], {
          channels: {
            EMAIL: { configured: emailConfigured },
            WHATSAPP: {
              configured: whatsappConfigured,
              locales: { ar: localeConfigured, en: localeConfigured },
            },
          },
        });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retry);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/quotations/quotation-1/deliver",
      expect.anything(),
    );
  });

  it("shows safe failure and refreshes history after a failed Retry", async () => {
    let historyLoads = 0;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) {
        historyLoads += 1;
        return response([{
          id: "email-failed",
          channel: "EMAIL",
          recipient: "historical@example.com",
          status: "FAILED",
          attemptedAt: "2026-08-14T10:00:00.000Z",
        }], {
          channels: {
            EMAIL: { configured: true },
            WHATSAPP: { configured: false, locales: { ar: false, en: false } },
          },
        });
      }
      if (input.endsWith("/deliver") && init?.method === "POST") {
        return response({ status: "FAILED", errorMessage: "Safe retry failure" });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Safe retry failure")).toBeTruthy();
    expect(screen.queryByText("Email resent")).toBeNull();
    expect(historyLoads).toBeGreaterThanOrEqual(2);
  });

  it("shows live contact provenance and only persists an explicitly selected email override", async () => {
    const value = {
      ...quotation("COMPLETED"),
      customerId: "customer-1",
      customerProfile: { id: "customer-1", email: "live@example.com", whatsapp: null },
      deliveryContacts: {
        email: { value: "live@example.com", source: "CUSTOMER", differsFromSnapshot: true },
        whatsapp: { value: "+96522223333", source: "SNAPSHOT", differsFromSnapshot: false },
      },
    };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.endsWith("/deliveries")) return response([], { channels: { EMAIL: { configured: true }, WHATSAPP: { configured: false, locales: { ar: false, en: false } } } });
      if (input.endsWith("/deliver") && init?.method === "POST") return response({ status: "SENT" });
      return response(value);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(QuotationDetailsPage));
    expect(await screen.findByText(/From current customer profile/)).toBeTruthy();
    expect(screen.getByText(/Differs from quotation snapshot/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Customer email"), { target: { value: "override@example.com" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Update customer email/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send by email" }));
    await screen.findByText("Email sent");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      channel: "EMAIL", recipient: "override@example.com", locale: "en", updateCustomerContact: true,
    });
  });
});
