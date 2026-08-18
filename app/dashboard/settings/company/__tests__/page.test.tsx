// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompanySettingsPage from "../page";

let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ language: isArabic ? "ar" : "en", isArabic }),
}));

function companyPayload() {
  return {
    data: {
      id: "company-1",
      name: "VOKA OS",
      nameAr: "فوكا",
      nameEn: "VOKA",
      addressAr: null,
      addressEn: null,
      poBox: null,
      phone: null,
      mobile: null,
      whatsapp: null,
      logoUrl: null,
      letterheadUrl: null,
      signatureUrl: null,
      stampUrl: null,
      defaultLocale: "EN",
      brandTheme: "NAVY_GOLD",
      defaultCurrency: "KWD",
      timezone: "Asia/Kuwait",
    },
  };
}

function deliverySettingsPayload(
  emailConfigured = true,
  whatsappConfigured = false,
) {
  return {
    data: {
      email: {
        provider: emailConfigured ? "RESEND" : null,
        configured: emailConfigured,
        requirements: {
          providerSelected: emailConfigured,
          apiKeyConfigured: emailConfigured,
          senderConfigured: emailConfigured,
        },
      },
      whatsapp: {
        provider: "META",
        configured: whatsappConfigured,
        requirements: {
          providerSelected: true,
          accessTokenConfigured: true,
          phoneNumberIdConfigured: false,
          graphApiVersionConfigured: true,
        },
        locales: {
          ar: {
            templateConfigured: true,
            languageConfigured: true,
            configured: true,
          },
          en: {
            templateConfigured: false,
            languageConfigured: false,
            configured: false,
          },
        },
      },
    },
  };
}

function response(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

beforeEach(() => {
  isArabic = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CompanySettingsPage Delivery UX", () => {
  it("renders Delivery & Messaging section in English with ready and partial cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input === "/api/companies/current") return response(companyPayload());
        if (input === "/api/companies/current/delivery-settings") {
          return response(deliverySettingsPayload(true, false));
        }
        if (input === "/api/companies/current/quotation-terms") {
          return response({ data: { templates: [] } });
        }
        return response({});
      }),
    );

    render(createElement(CompanySettingsPage));

    expect(await screen.findByText("Delivery & Messaging")).toBeTruthy();
    expect(
      screen.getByText(
        "Delivery credentials are managed securely on the server. This page only shows configuration readiness.",
      ),
    ).toBeTruthy();

    const emailCard = screen.getByTestId("email-readiness-card");
    expect(emailCard.textContent).toContain("Ready");
    expect(emailCard.textContent).toContain("RESEND");

    const whatsappCard = screen.getByTestId("whatsapp-readiness-card");
    expect(whatsappCard.textContent).toContain("Setup required");
    expect(whatsappCard.textContent).toContain("META");
    expect(whatsappCard.textContent).toContain("Missing");

    expect(screen.queryByLabelText(/RESEND_API_KEY/i)).toBeNull();
    expect(screen.queryByLabelText(/ACCESS_TOKEN/i)).toBeNull();
  });

  it("renders Delivery & Messaging section in Arabic", async () => {
    isArabic = true;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input === "/api/companies/current") return response(companyPayload());
        if (input === "/api/companies/current/delivery-settings") {
          return response(deliverySettingsPayload(true, true));
        }
        if (input === "/api/companies/current/quotation-terms") {
          return response({ data: { templates: [] } });
        }
        return response({});
      }),
    );

    render(createElement(CompanySettingsPage));

    expect(await screen.findByText("الإرسال والمراسلات")).toBeTruthy();
    expect(
      screen.getByText(
        "تتم إدارة بيانات اعتماد الإرسال بشكل آمن على الخادم. تعرض هذه الصفحة حالة جاهزية الإعداد فقط.",
      ),
    ).toBeTruthy();

    const emailCard = screen.getByTestId("email-readiness-card");
    expect(emailCard.textContent).toContain("جاهز");

    const whatsappCard = screen.getByTestId("whatsapp-readiness-card");
    expect(whatsappCard.textContent).toContain("جاهز");
  });

  it("does not render credential editing inputs or secret values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input === "/api/companies/current") return response(companyPayload());
        if (input === "/api/companies/current/delivery-settings") {
          return response(deliverySettingsPayload(true, false));
        }
        if (input === "/api/companies/current/quotation-terms") {
          return response({ data: { templates: [] } });
        }
        return response({});
      }),
    );

    render(createElement(CompanySettingsPage));

    await screen.findByText("Delivery & Messaging");

    const inputs = screen.getAllByRole("textbox");
    const passwords = screen.queryAllByPlaceholderText(/key|token|secret/i);

    expect(passwords).toHaveLength(0);
    for (const input of inputs) {
      const name = (input as HTMLInputElement).getAttribute("name") || "";
      expect(name).not.toContain("API_KEY");
      expect(name).not.toContain("ACCESS_TOKEN");
    }
  });
});
