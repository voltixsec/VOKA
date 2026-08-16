// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SalesAssistantPage from "../page";

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SalesAssistantPage", () => {
  it("renders natural language input prompt and triggers proposal generation", async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url === "/api/ai/sales-assistant/draft") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              customer: {
                status: "MATCHED",
                candidates: [],
                reviewRequired: false,
                name: "Kuwait National Telecom",
                matchConfidence: 0.95,
              },
              proposal: {
                subject: "Quotation - Kuwait National Telecom",
                scopeType: "SUPPLY_AND_INSTALLATION",
                validityDays: 30,
                currencyCode: "KWD",
              },
              lines: [
                {
                  resolutionStatus: "MATCHED",
                  catalogCandidates: [],
                  reviewRequired: false,
                  itemName: "4K IP Camera",
                  quantity: 5,
                  unit: "PCS",
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
                sourcePrompt: "Create a quotation for Kuwait National Telecom 5 4K IP Cameras",
                extractedLocale: "en",
                resolvedAt: new Date().toISOString(),
                confidenceSummary: "Existing customer matched | 1 of 1 line items matched",
              },
            },
          }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    vi.stubGlobal("fetch", fetchMock);

    render(createElement(SalesAssistantPage));

    expect(screen.getByText(/Structured Commercial Draft/i)).toBeTruthy();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "Create a quotation for Kuwait National Telecom 5 4K IP Cameras" },
    });

    const generateBtn = screen.getByRole("button", { name: "Generate Proposal Draft" });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Kuwait National Telecom")).toBeTruthy();
    });

    expect(screen.getByText("Existing Customer Matched")).toBeTruthy();
    expect(screen.getByText("4K IP Camera")).toBeTruthy();
    expect(screen.getAllByText(/225.000 KWD/).length).toBeGreaterThan(0);
  });
});
