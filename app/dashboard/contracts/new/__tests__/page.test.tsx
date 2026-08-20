// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NewContractPage from "../page";

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

describe("NewContractPage", () => {
  it("renders contract creation form with options", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { activeCompanyId: "company-1" } }),
        });
      }
      if (url.includes("/api/customers")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: { customers: [{ id: "customer-1", name: "Acme Kuwait" }] },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(createElement(NewContractPage));

    expect(await screen.findByText("Contract Builder")).toBeTruthy();
    expect(screen.getByText("Acme Kuwait")).toBeTruthy();
    expect(screen.getByText("Contract lines")).toBeTruthy();
    expect(screen.getByText("Payment Milestones")).toBeTruthy();
  });
});
