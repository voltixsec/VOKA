// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic: false }) }));
import NewInvoicePage from '../page';
const json = (data: unknown) => ({ ok: true, json: async () => ({ data }) } as Response);
const source = { id: 'private-source-id', quotationNumber: 'QT-100', number: 'SO-100', customer: { name: 'Horizon Co' }, totals: { totalAmount: 25 }, currencyCode: 'KWD' };
function mockFetch() {
  const post = vi.fn(async (_url: string, _init?: RequestInit) => json({ id: 'inv-created' }));
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === 'POST' && url === '/api/invoices') return post(url, init);
    if (url.startsWith('/api/customers')) return json({ customers: [{ id: 'c-1', name: 'Acme' }] });
    if (url.startsWith('/api/catalog/items')) return json([]);
    if (url.startsWith('/api/companies/current')) return json({ defaultCurrency: 'KWD' });
    if (url.startsWith('/api/quotations')) return json({ quotations: [source], pagination: { totalPages: 1 } });
    if (url.startsWith('/api/sales-orders')) return json({ salesOrders: [source], pagination: { totalPages: 1 } });
    throw new Error('Unexpected request');
  });
  return { post, fetchMock };
}
beforeEach(() => { push.mockReset(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('invoice commercial source integration', () => {
  it.each(['QUOTATION', 'SALES_ORDER'])('selects %s and preserves exact source POST contract and redirect', async kind => {
    const { post, fetchMock } = mockFetch();
    const { container } = render(<NewInvoicePage />);
    const origin = await screen.findByLabelText('Invoice origin');
    fireEvent.change(origin, { target: { value: kind } });
    expect(screen.queryByText(/Quotation ID|Sales Order ID/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save invoice draft' })).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: /Horizon Co/ }));
    expect(container.textContent).not.toContain('private-source-id');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=' + (kind === 'QUOTATION' ? 'APPROVED' : 'CONFIRMED')))).toBe(true);
    fireEvent.change(screen.getByLabelText('Invoice date'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save invoice draft' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(post.mock.calls[0][1]?.body))).toEqual({ sourceKind: kind, sourceId: source.id, invoiceDate: '2026-09-10', dueDate: '2026-10-10' });
    expect(post.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': expect.any(String) }));
    expect(push).toHaveBeenCalledWith('/dashboard/invoices/inv-created');
  });
  it.each([['QUOTATION', 'SALES_ORDER'], ['SALES_ORDER', 'QUOTATION'], ['QUOTATION', 'DIRECT'], ['SALES_ORDER', 'DIRECT']])('clears selection when switching %s to %s', async (from, to) => {
    mockFetch(); render(<NewInvoicePage />);
    const origin = await screen.findByLabelText('Invoice origin');
    fireEvent.change(origin, { target: { value: from } });
    fireEvent.click(await screen.findByRole('button', { name: /Horizon Co/ }));
    fireEvent.change(origin, { target: { value: to } });
    if (to === 'DIRECT') fireEvent.change(origin, { target: { value: from } });
    expect(screen.getByRole('button', { name: 'Save invoice draft' })).toBeDisabled();
    expect(screen.queryByText(/Selected document:/)).not.toBeInTheDocument();
  });
  it('keeps direct customer, lines, totals, payload and redirect unchanged', async () => {
    const { post, fetchMock } = mockFetch(); render(<NewInvoicePage />);
    const customer = await screen.findByLabelText('Customer search');
    fireEvent.focus(customer); fireEvent.click(screen.getByRole('button', { name: 'Acme' }));
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: 'Direct service' } });
    expect(screen.getByText('Commercial lines')).toBeInTheDocument();
    expect(screen.getByText('Estimated total')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save invoice draft' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String(post.mock.calls[0][1]?.body));
    expect(Object.keys(payload).sort()).toEqual(['customerId','invoiceDate','dueDate','currencyCode','notes','termsAndConditions','lines'].sort());
    expect(payload).toEqual(expect.objectContaining({ customerId: 'c-1', currencyCode: 'KWD', dueDate: null, notes: null, termsAndConditions: null, lines: [expect.objectContaining({ itemName: 'Direct service', position: 1, catalogItemId: null })] }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/quotations') || String(url).includes('/api/sales-orders'))).toBe(false);
    expect(push).toHaveBeenCalledWith('/dashboard/invoices/inv-created');
  });
});
