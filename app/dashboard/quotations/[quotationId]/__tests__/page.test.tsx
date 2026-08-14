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

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ quotationId: "quotation-1" }),
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
    lines: [],
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
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuotationDetailsPage localization visibility", () => {
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
});
