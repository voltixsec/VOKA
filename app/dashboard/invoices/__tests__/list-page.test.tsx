// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

vi.mock("@/components/reporting/ModuleSummaryBar", () => ({
  ModuleSummaryBar: () => null,
}));

import InvoicesPage from "../page";

function invoice(id = "inv-1") {
  return {
    id,
    number: "INV-1",
    status: "ISSUED",
    settlementStatus: "UNPAID",
    invoiceDate: "2026-01-15T00:00:00.000Z",
    dueDate: null,
    currencyCode: "KWD",
    customer: { name: "Acme" },
    totals: { totalAmount: 10 },
    paidAmount: 0,
    outstandingAmount: 10,
  };
}

function json(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data }),
  } as Response;
}

describe("invoice list page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests page 1 with pageSize 20 and uses pagination.total not row count", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        invoices: [invoice()],
        pagination: { total: 41, page: 1, pageSize: 20, totalPages: 3 },
      }),
    );
    render(<InvoicesPage />);
    await screen.findByText("INV-1");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/invoices?page=1&pageSize=20");
    expect(screen.getByText("41 results")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("keeps search server-side and resets to page 1", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        invoices: [invoice()],
        pagination: { total: 41, page: 1, pageSize: 20, totalPages: 3 },
      }),
    );
    render(<InvoicesPage />);
    await screen.findByText("INV-1");
    await new Promise((resolve) => setTimeout(resolve, 300));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("page=2");
    });
    fireEvent.change(screen.getByPlaceholderText("Search invoice or customer"), {
      target: { value: "INV-1" },
    });
    await waitFor(() => {
      expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("search=INV-1");
    });
    const last = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(last).toContain("page=1");
    expect(last).toContain("pageSize=20");
  });

  it("navigates next then previous", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const page = url.includes("page=2") ? 2 : 1;
      return json({
        invoices: [invoice()],
        pagination: { total: 41, page, pageSize: 20, totalPages: 3 },
      });
    });
    render(<InvoicesPage />);
    await screen.findByText("INV-1");
    await new Promise((resolve) => setTimeout(resolve, 300));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("2 / 3")).toBeInTheDocument());
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("page=2");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByText("1 / 3")).toBeInTheDocument());
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("page=1");
  });

  it("hides pagination when there is only one page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        invoices: [invoice()],
        pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      }),
    );
    render(<InvoicesPage />);
    await screen.findByText("INV-1");
    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});
