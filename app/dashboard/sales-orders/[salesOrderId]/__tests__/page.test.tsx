// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SalesOrderDetailsPage from "../page";

let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ salesOrderId: "sales-order-1" }),
}));

beforeEach(() => {
  isArabic = false;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function salesOrder() {
  return {
    id: "sales-order-1",
    number: "SO-QT-1001",
    status: "DRAFT",
    sourceQuotationId: "quotation-1",
    sourceQuotationNumber: "QT-1001",
    currencyCode: "KWD",
    orderDate: "2026-08-14T12:00:00.000Z",
    customer: {
      name: "Snapshot Customer",
      email: "saved@example.com",
      taxNumber: "TAX-1",
    },
    subject: "Saved subject",
    brief: "Saved brief",
    projectName: "Saved project",
    attentionName: "Saved attention",
    scopeType: "SUPPLY_ONLY",
    lines: [
      {
        id: "line-1",
        position: 1,
        itemCode: "ITEM-1",
        itemName: "Saved item",
        description: "Saved description",
        unitName: "piece",
        quantity: 2,
        unitPrice: 100,
        discount: { type: "FIXED", value: 5, amount: 5 },
        taxPercentage: 7,
        taxAmount: 13.65,
        totalAmount: 208.65,
      },
      {
        id: "line-2",
        position: 2,
        itemName: "No description item",
        description: null,
        unitName: null,
        quantity: 1,
        unitPrice: 10,
        discount: null,
        taxPercentage: 0,
        taxAmount: 0,
        totalAmount: 10,
      },
    ],
    discount: { type: "FIXED", value: 5, amount: 5 },
    totals: {
      subtotal: 210,
      discountAmount: 5,
      taxAmount: 13.65,
      totalAmount: 218.65,
    },
    notes: "Saved notes",
    termsAndConditions: "Saved terms",
    sourceApproval: {
      approvedAt: "2026-08-14T10:00:00.000Z",
      approvedByName: "Approver Snapshot",
      approvedByRole: "ADMIN",
    },
    creator: { name: "Creator Snapshot", role: "SALES" },
    createdAt: "2026-08-14T12:00:00.000Z",
  };
}

describe("SalesOrderDetailsPage", () => {
  it("renders the independent commercial and audit snapshot accessibly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: salesOrder() }),
    }));
    render(createElement(SalesOrderDetailsPage));

    expect(await screen.findByText("Saved subject")).toBeTruthy();
    expect(screen.getByText("Snapshot Customer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "QT-1001" }).getAttribute("href"))
      .toBe("/dashboard/quotations/quotation-1");
    expect(screen.getByText("Saved description")).toBeTruthy();
    expect(screen.getByText("Approver Snapshot · ADMIN")).toBeTruthy();
    expect(screen.getByText("Creator Snapshot · SALES")).toBeTruthy();
    expect(screen.getAllByText(/KWD\s*218\.650/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("does not create an empty description row and requests Arabic locale", async () => {
    isArabic = true;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: salesOrder() }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SalesOrderDetailsPage));

    expect(await screen.findByText("مسودة أمر بيع")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sales-orders/sales-order-1?locale=ar",
    );
    expect(screen.getByText("No description item").parentElement?.textContent)
      .toBe("No description item");
    expect(document.querySelector("section")?.dir).toBe("rtl");
  });

  it("renders the safe error state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Sales Order not found." } }),
    }));
    render(createElement(SalesOrderDetailsPage));

    expect(await screen.findByText("Sales Order not found.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Sales Orders" })).toBeTruthy();
  });
});
