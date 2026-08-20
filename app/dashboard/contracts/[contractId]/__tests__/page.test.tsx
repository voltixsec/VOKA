// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContractDetailPage from "../page";

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useParams: () => ({
    contractId: "contract-123",
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ContractDetailPage", () => {
  it("renders contract details snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: "contract-123",
          number: "CN-202608-0001",
          status: "DRAFT",
          currencyCode: "KWD",
          contractDate: "2026-08-04T00:00:00.000Z",
          customer: { name: "Acme Kuwait", email: "info@acme.com" },
          subtotal: 1000,
          discountAmount: 0,
          taxAmount: 50,
          totalAmount: 1050,
          lines: [
            {
              position: 1,
              type: "PRODUCT",
              itemName: "Widget A",
              unitName: "PCS",
              quantity: 10,
              unitPrice: 100,
              discountAmount: 0,
              taxPercentage: 5,
              taxAmount: 50,
              subtotal: 1000,
              totalAmount: 1050,
            },
          ],
          milestones: [
            {
              position: 1,
              title: "Initial Advance",
              amountType: "PERCENTAGE",
              percentage: 50,
            },
          ],
          createdByName: "Sales Agent",
          createdByRole: "SALES",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(ContractDetailPage));

    expect(await screen.findByText("CN-202608-0001")).toBeTruthy();
    expect(screen.getAllByText("Acme Kuwait")).toHaveLength(2);
    expect(screen.getByText("Widget A")).toBeTruthy();
    expect(screen.getByText("Initial Advance")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });
});
