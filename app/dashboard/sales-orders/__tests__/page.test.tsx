// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SalesOrdersPage from "../page";

let isArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  isArabic = false;
});

function response(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  };
}

describe("SalesOrdersPage", () => {
  it("renders the empty state and active-locale request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      salesOrders: [],
      pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SalesOrdersPage));

    expect(await screen.findByText("No Sales Orders")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("locale=en"));
  });

  it("renders snapshot list fields, three-decimal total, and accessible link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({
      salesOrders: [{
        id: "sales-order-1",
        number: "SO-QT-1001",
        status: "DRAFT",
        sourceQuotationNumber: "QT-1001",
        orderDate: "2026-08-14T12:00:00.000Z",
        currencyCode: "KWD",
        customer: { name: "Snapshot Customer" },
        totals: { totalAmount: 450 },
      }],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    })));
    render(createElement(SalesOrdersPage));

    expect(await screen.findByText("SO-QT-1001")).toBeTruthy();
    expect(screen.getByText("Snapshot Customer")).toBeTruthy();
    expect(screen.getAllByText(/QT-1001/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/KWD\s*450\.000/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open Sales Order SO-QT-1001" })
        .getAttribute("href"),
    ).toBe("/dashboard/sales-orders/sales-order-1");
  });

  it("renders unauthorized and Arabic states safely", async () => {
    isArabic = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(null, 403)));
    render(createElement(SalesOrdersPage));

    expect(await screen.findByText("ليست لديك صلاحية لعرض أوامر البيع.")).toBeTruthy();
    await waitFor(() => expect(document.querySelector("section")?.dir).toBe("rtl"));
  });
});
