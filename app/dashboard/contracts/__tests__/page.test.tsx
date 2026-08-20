// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContractsPage from "../page";

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ContractsPage", () => {
  it("renders tenant contract data returned by the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          contracts: [
            {
              id: "contract-1",
              number: "CN-202608-0001",
              status: "DRAFT",
              contractDate: "2026-08-04T00:00:00.000Z",
              currencyCode: "KWD",
              customer: { name: "Acme Kuwait" },
              totalAmount: 1250,
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

    render(createElement(ContractsPage));

    expect(await screen.findByText("CN-202608-0001")).toBeTruthy();
    expect(screen.getByText("Acme Kuwait")).toBeTruthy();
    expect(screen.getAllByText("DRAFT")).toHaveLength(2);
    expect(screen.getByText(/1,250/)).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contracts?page=1&pageSize=20",
      );
    });
  });

  it("shows the sign-in state when the API returns unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    render(createElement(ContractsPage));

    expect(await screen.findByText("Sign in to view contracts")).toBeTruthy();
    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
  });
});
