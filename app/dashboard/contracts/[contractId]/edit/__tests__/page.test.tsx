// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditContractPage from "../page";

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

describe("EditContractPage", () => {
  it("loads existing contract data and populates edit form", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { activeCompanyId: "company-1" } }),
        });
      }
      if (url === "/api/contracts/contract-123") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "contract-123",
              number: "CN-202608-0001",
              status: "DRAFT",
              customerId: "customer-1",
              currencyCode: "KWD",
              contractDate: "2026-08-04T00:00:00.000Z",
              projectName: "Project Alpha",
              lines: [
                {
                  id: "line-1",
                  position: 1,
                  type: "PRODUCT",
                  itemName: "Widget Alpha",
                  quantity: 5,
                  unitPrice: 100,
                },
              ],
              milestones: [
                {
                  id: "m-1",
                  position: 1,
                  title: "Milestone 1",
                  amountType: "PERCENTAGE",
                  percentage: 100,
                },
              ],
            },
          }),
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

    render(createElement(EditContractPage));

    expect(await screen.findByText("Edit Contract")).toBeTruthy();
    expect(screen.getByDisplayValue("Project Alpha")).toBeTruthy();
    expect(screen.getByDisplayValue("Widget Alpha")).toBeTruthy();
    expect(screen.getByDisplayValue("Milestone 1")).toBeTruthy();
  });
});
