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

    expect(await screen.findByRole("button", { name: "اعتماد" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "رفض" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeTruthy();
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
    [true, "معاينة العرض", "ar"],
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
      name: arabic ? "تنزيل PDF" : "Download PDF",
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

    expect(await screen.findByTestId("delivery-card")).toBeTruthy();
    expect(screen.getByTestId("email-disabled-explanation").textContent).toContain("Email provider not configured");
    expect(screen.getByTestId("whatsapp-disabled-explanation").textContent).toContain("WhatsApp provider not configured");
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

  it("renders compact channel readiness badges and active-locale WhatsApp template badge", async () => {
    isArabic = true;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/deliveries")) {
        return response([], {
          channels: {
            EMAIL: { configured: true, provider: "RESEND" },
            WHATSAPP: { configured: true, provider: "META", locales: { ar: true, en: false } },
          },
        });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    const emailBadge = await screen.findByTestId("email-readiness-badge");
    expect(emailBadge.textContent).toContain("البريد الإلكتروني:");
    expect(emailBadge.textContent).toContain("جاهز");

    const whatsappBadge = screen.getByTestId("whatsapp-readiness-badge");
    expect(whatsappBadge.textContent).toContain("واتساب:");
    expect(whatsappBadge.textContent).toContain("جاهز");

    const templateBadge = screen.getByTestId("whatsapp-template-locale-badge");
    expect(templateBadge.textContent).toContain("قالب العربية:");
    expect(templateBadge.textContent).toContain("جاهز");
  });

  it("explains why delivery actions are disabled for missing recipient or missing locale template", async () => {
    isArabic = true;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/deliveries")) {
        return response([], {
          channels: {
            EMAIL: { configured: true },
            WHATSAPP: { configured: true, locales: { ar: false, en: true } },
          },
        });
      }
      return response({
        ...quotation("COMPLETED", "DRAFT"),
        customer: { name: "Acme", email: "", phone: "" },
        deliveryContacts: {
          email: { value: null, source: "MISSING", differsFromSnapshot: false },
          whatsapp: { value: null, source: "MISSING", differsFromSnapshot: false },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    expect(await screen.findByTestId("delivery-card")).toBeTruthy();

    const emailExplanation = screen.getByTestId("email-disabled-explanation");
    expect(emailExplanation.textContent).toContain("البريد الإلكتروني للعميل مفقود");

    const whatsappExplanation = screen.getByTestId("whatsapp-disabled-explanation");
    expect(whatsappExplanation.textContent).toContain("قالب واتساب العربي غير مهيأ");

    expect((screen.getByRole("button", { name: "إرسال بالبريد الإلكتروني" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "إرسال عبر واتساب" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "إرسال بالبريد وواتساب" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("proves visible Arabic delivery labels are valid Arabic text free from mojibake", async () => {
    isArabic = true;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.endsWith("/deliveries")) {
        return response([
          {
            id: "delivery-1",
            channel: "EMAIL",
            recipient: "customer@example.com",
            status: "FAILED",
            errorMessage: "تعذر الإرسال بسبب خادم البريد",
            attemptedAt: "2026-08-14T10:00:00.000Z",
          },
        ], {
          channels: {
            EMAIL: { configured: true },
            WHATSAPP: { configured: true, locales: { ar: true, en: true } },
          },
        });
      }
      return response(quotation("COMPLETED", "DRAFT"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationDetailsPage));

    const card = await screen.findByTestId("delivery-card");
    const text = card.textContent || "";

    // Must contain Arabic characters
    expect(/[\u0600-\u06FF]/.test(text)).toBe(true);

    // Must NOT contain typical UTF-8 mojibake patterns
    expect(text).not.toContain("Ø");
    expect(text).not.toContain("Ù");
    expect(text).not.toContain("â€");

    // Specific expected Arabic labels
    expect(text).toContain("الإرسال للمستلم");
    expect(text).toContain("جاهز");
    expect(text).toContain("تعذر الإرسال");
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy();
  });
});
