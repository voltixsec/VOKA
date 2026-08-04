// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuotationsPage from "../page";

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QuotationsPage", () => {
  it("renders tenant quotation data returned by the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          quotations: [
            {
              id: "quotation-1",
              quotationNumber: "QT-1001",
              status: "DRAFT",
              issueDate: "2026-08-04T00:00:00.000Z",
              currencyCode: "KWD",
              customer: { name: "Acme Kuwait" },
              totals: { totalAmount: 125 },
            },
          ],
          pagination: {
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(QuotationsPage));

    expect(await screen.findByText("QT-1001")).toBeTruthy();
    expect(screen.getByText("Acme Kuwait")).toBeTruthy();
    expect(screen.getAllByText("DRAFT")).toHaveLength(2);
    expect(screen.getByText(/125/)).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/quotations?page=1&pageSize=20",
      );
    });
  });

  it("shows the sign-in state when the API returns unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    render(createElement(QuotationsPage));

    expect(await screen.findByText("Sign in to view quotations")).toBeTruthy();
    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
  });
});
