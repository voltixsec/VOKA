// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  vi.restoreAllMocks();
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

const statuses = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;
const orders = statuses.map((status, index) => ({ id: 'so-' + index, number: 'SO-' + index, status, sourceQuotationNumber: 'QT-' + index, orderDate: '2026-09-10', currencyCode: 'KWD', customer: { name: 'Customer' }, totals: { totalAmount: 10 } }));
const populated = { salesOrders: orders, pagination: { total: 21, page: 1, pageSize: 20, totalPages: 2 } };

describe.each([
  { ar: true, labels: ['مسودة', 'مؤكد', 'ملغي'], load: 'جارٍ تحميل أوامر البيع', error: 'تعذر تحميل أوامر البيع.', retry: 'إعادة المحاولة', empty: 'لا توجد أوامر بيع', search: 'البحث في أوامر البيع', next: 'التالي' },
  { ar: false, labels: ['Draft', 'Confirmed', 'Cancelled'], load: 'Loading Sales Orders', error: 'Could not load Sales Orders.', retry: 'Retry', empty: 'No Sales Orders', search: 'Search Sales Orders', next: 'Next' },
])('Sales Order list locale ar=$ar', copy => {
  beforeEach(() => { isArabic = copy.ar; });
  it('localizes every badge and filter without changing internal filter, search, pagination or links', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(populated));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(createElement(SalesOrdersPage));
    await screen.findByText('SO-0');
    orders.forEach((order, index) => {
      const link = screen.getByRole('link', { name: (copy.ar ? 'فتح أمر البيع ' : 'Open Sales Order ') + order.number });
      expect(within(link).getByText(copy.labels[index])).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/dashboard/sales-orders/' + order.id);
      expect(screen.getByRole('button', { name: copy.labels[index] })).toBeTruthy();
    });
    statuses.forEach(status => expect(container.textContent).not.toContain(status));
    fireEvent.click(screen.getByRole('button', { name: copy.next }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('page=2')));
    fireEvent.click(screen.getByRole('button', { name: copy.labels[2] }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('status=CANCELLED')));
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('page=1');
    fireEvent.change(screen.getByRole('textbox', { name: copy.search }), { target: { value: ' Customer ' } });
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('search=Customer')));
    expect(fetchMock.mock.calls.at(-1)![0]).toContain('locale=' + (copy.ar ? 'ar' : 'en'));
  });
  it('localizes loading and empty states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ salesOrders: [], pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 } })));
    render(createElement(SalesOrdersPage));
    expect(screen.getByLabelText(copy.load).getAttribute('aria-busy')).toBe('true');
    expect(await screen.findByText(copy.empty)).toBeTruthy();
  });
  it.each(['http', 'network', 'json'])('localizes %s failures, logs diagnostics, and keeps retry working', async failure => {
    const diagnostics = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error(copy.ar ? 'English backend detail' : 'تفاصيل خطأ الخادم');
    const fetchMock = vi.fn();
    if (failure === 'network') fetchMock.mockRejectedValueOnce(error);
    else if (failure === 'json') fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw error; } });
    else fetchMock.mockResolvedValueOnce(response(null, 500));
    fetchMock.mockResolvedValue(response(populated));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(createElement(SalesOrdersPage));
    expect(await screen.findByText(copy.error)).toBeTruthy();
    expect(container.textContent).not.toContain(error.message);
    expect(container.textContent).not.toContain(copy.ar ? 'Could not load Sales Orders.' : 'تعذر تحميل أوامر البيع.');
    expect(diagnostics).toHaveBeenCalledWith('Sales Order list load failed', expect.any(Error));
    fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    expect(await screen.findByText('SO-0')).toBeTruthy();
    expect(screen.queryByText(copy.error)).toBeNull();
  });
});
