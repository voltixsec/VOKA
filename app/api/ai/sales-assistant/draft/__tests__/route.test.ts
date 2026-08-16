import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateDraftProposal: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock("@/src/application/ai-sales-assistant", async () => {
  const actual = await vi.importActual<typeof import("@/src/application/ai-sales-assistant")>("@/src/application/ai-sales-assistant");
  return {
    ...actual,
    AISalesAssistantService: class {
      generateDraftProposal = mocks.generateDraftProposal;
    },
  };
});

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => {
      try {
        return await handler(request, {}, { companyId: "company-100" });
      } catch (error) {
        return responses.handleApiError(error);
      }
    },
  };
});

import { POST } from "../route";

describe("POST /api/ai/sales-assistant/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when prompt is missing or empty", async () => {
    const request = new Request("http://localhost/api/ai/sales-assistant/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "  " }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("PROMPT_REQUIRED");
  });

  it("generates a draft proposal successfully for authenticated company", async () => {
    const mockProposal = {
      customer: {
        name: "Ø´Ø±ÙƒØ© Ø§Ù„ÙƒÙˆÙŠØª Ø§Ù„ÙˆØ·Ù†ÙŠØ© Ù„Ù„Ø§ØªØµØ§Ù„Ø§Øª",
        matchConfidence: 0.95,
      },
      proposal: {
        subject: "Ø¹Ø±Ø¶ Ø³Ø¹Ø± - Ø´Ø±ÙƒØ© Ø§Ù„ÙƒÙˆÙŠØª Ø§Ù„ÙˆØ·Ù†ÙŠØ© Ù„Ù„Ø§ØªØµØ§Ù„Ø§Øª",
        scopeType: "SUPPLY_AND_INSTALLATION",
        validityDays: 30,
        currencyCode: "KWD",
      },
      lines: [
        {
          itemName: "ÙƒØ§Ù…ÙŠØ±Ø§ IP 4K",
          quantity: 5,
          unit: "Ù‚Ø·Ø¹Ø©",
          unitPrice: 45,
          subtotal: 225,
          isMatchedFromCatalog: true,
        },
      ],
      financials: {
        subtotal: 225,
        discountAmount: 0,
        taxRatePercentage: 0,
        taxAmount: 0,
        totalAmount: 225,
      },
      metadata: {
        sourcePrompt: "Ø§Ø¹Ù…Ù„ Ø¹Ø±Ø¶ Ø³Ø¹Ø± Ù„Ø´Ø±ÙƒØ© Ø§Ù„ÙƒÙˆÙŠØª Ø§Ù„ÙˆØ·Ù†ÙŠØ© Ù„Ù„Ø§ØªØµØ§Ù„Ø§Øª 5 ÙƒØ§Ù…ÙŠØ±Ø§Øª IP",
        extractedLocale: "ar",
        resolvedAt: new Date().toISOString(),
        confidenceSummary: "Existing customer matched",
      },
    };

    mocks.generateDraftProposal.mockResolvedValue(mockProposal);

    const request = new Request("http://localhost/api/ai/sales-assistant/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "Ø§Ø¹Ù…Ù„ Ø¹Ø±Ø¶ Ø³Ø¹Ø± Ù„Ø´Ø±ÙƒØ© Ø§Ù„ÙƒÙˆÙŠØª Ø§Ù„ÙˆØ·Ù†ÙŠØ© Ù„Ù„Ø§ØªØµØ§Ù„Ø§Øª 5 ÙƒØ§Ù…ÙŠØ±Ø§Øª IP",
        sourceLocale: "ar",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.customer.name).toBe("Ø´Ø±ÙƒØ© Ø§Ù„ÙƒÙˆÙŠØª Ø§Ù„ÙˆØ·Ù†ÙŠØ© Ù„Ù„Ø§ØªØµØ§Ù„Ø§Øª");
    expect(json.data.financials.totalAmount).toBe(225);
    expect(mocks.generateDraftProposal).toHaveBeenCalledWith({
      companyId: "company-100",
      prompt: "Ø§Ø¹Ù…Ù„ Ø¹Ø±Ø¶ Ø³Ø¹Ø± Ù„Ø´Ø±ÙƒØ© Ø§Ù„ÙƒÙˆÙŠØª Ø§Ù„ÙˆØ·Ù†ÙŠØ© Ù„Ù„Ø§ØªØµØ§Ù„Ø§Øª 5 ÙƒØ§Ù…ÙŠØ±Ø§Øª IP",
      sourceLocale: "ar",
    });
  });
});
