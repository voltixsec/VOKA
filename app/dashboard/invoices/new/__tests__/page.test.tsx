// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: false }),
}));

import NewInvoicePage from "../page";

function json(data: unknown, ok = true) {
  return {
    ok,
    json: async () => ({ data }),
  } as Response;
}

function salesOrder(id = "so-1") {
  return {
    id,
    number: "SO-100",
    orderDate: "2026-02-01T00:00:00.000Z",
    currencyCode: "KWD",
    customer: { name: "Horizon Co" },
    totals: { totalAmount: 25 },
  };
}

function mockFetch(options?: { salesOrders?: unknown[] }) {
  const post = vi.fn(async (_url: string, _init?: RequestInit) => json({ id: "inv-created" }));
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST" && url.includes("/api/invoices")) {
      return post(url, init);
    }
    if (url.startsWith("/api/customers")) return json({ customers: [{ id: "c-1", name: "Acme" }] });
    if (url.startsWith("/api/catalog/items")) return json([]);
    if (url.startsWith("/api/companies/current")) return json({ defaultCurrency: "KWD" });
    if (url.startsWith("/api/sales-orders")) {
      return json({
        salesOrders: options?.salesOrders ?? [salesOrder()],
        pagination: { total: (options?.salesOrders ?? [salesOrder()]).length, page: 1, pageSize: 20, totalPages: 1 },
      });
    }
    return json({});
  });
  return { fetchMock, post };
}

describe("new invoice sales order picker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
  });

  it("loads a confirmed sales order picker instead of a raw ID field", async () => {
    const { fetchMock } = mockFetch();
    render(<NewInvoicePage />);
    await screen.findByText("Invoice origin");
    fireEvent.change(screen.getByDisplayValue("Direct invoice"), { target: { value: "SALES_ORDER" } });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/sales-orders?") && String(url).includes("status=CONFIRMED"))).toBe(true);
    });
    expect(screen.queryByText("Sales Order ID")).not.toBeInTheDocument();
    const picker = await screen.findByLabelText("Confirmed sales order");
    expect(screen.getByRole("option", { name: /SO-100 · Horizon Co/ })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "so-1" } });
    expect((picker as HTMLSelectElement).value).toBe("so-1");
  });

  it("submits the selected sales order id without duplicating source data", async () => {
    const { post } = mockFetch();
    render(<NewInvoicePage />);
    await screen.findByText("Invoice origin");
    fireEvent.change(screen.getByDisplayValue("Direct invoice"), { target: { value: "SALES_ORDER" } });
    fireEvent.change(await screen.findByLabelText("Confirmed sales order"), { target: { value: "so-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save invoice draft" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = JSON.parse(String(post.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body).toEqual(expect.objectContaining({
      sourceKind: "SALES_ORDER",
      sourceId: "so-1",
    }));
    expect(body).not.toHaveProperty("customerId");
    expect(body).not.toHaveProperty("lines");
  });

  it("keeps direct customer picker and quotation ID field unchanged", async () => {
    mockFetch();
    render(<NewInvoicePage />);
    await screen.findByText("Customer");
    expect(screen.queryByText("Sales Order ID")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Direct invoice"), { target: { value: "QUOTATION" } });
    expect(screen.getByText("Quotation ID")).toBeInTheDocument();
    expect(screen.queryByText("Sales Order ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirmed sales order")).not.toBeInTheDocument();
  });

  it("clears a selected sales order when origin changes", async () => {
    const { post } = mockFetch();
    render(<NewInvoicePage />);
    await screen.findByText("Invoice origin");
    fireEvent.change(screen.getByDisplayValue("Direct invoice"), { target: { value: "SALES_ORDER" } });
    fireEvent.change(await screen.findByLabelText("Confirmed sales order"), { target: { value: "so-1" } });
    fireEvent.change(screen.getByDisplayValue("Confirmed sales order"), { target: { value: "DIRECT" } });
    fireEvent.change(screen.getByDisplayValue("Direct invoice"), { target: { value: "SALES_ORDER" } });
    const picker = await screen.findByLabelText("Confirmed sales order");
    expect((picker as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Save invoice draft" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows a truthful empty state when no confirmed sales orders exist", async () => {
    mockFetch({ salesOrders: [] });
    render(<NewInvoicePage />);
    await screen.findByText("Invoice origin");
    fireEvent.change(screen.getByDisplayValue("Direct invoice"), { target: { value: "SALES_ORDER" } });
    expect(await screen.findByText("No confirmed sales orders available.")).toBeInTheDocument();
    expect(screen.queryByText("Sales Order ID")).not.toBeInTheDocument();
  });
});
