// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CommercialSourcePicker } from '../CommercialSourcePicker';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const row = { id: 'internal-secret-id', quotationNumber: 'QT-100', number: 'SO-100', customer: { name: 'Horizon Company' }, totals: { totalAmount: 25 }, currencyCode: 'KWD' };
const reply = (kind: string, rows: unknown[] = [row], pages = 1) => ({ ok: true, json: async () => ({ data: { [kind === 'QUOTATION' ? 'quotations' : 'salesOrders']: rows, pagination: { totalPages: pages } } }) });
function Harness({ kind, ar, choose }: { kind: 'QUOTATION' | 'SALES_ORDER'; ar: boolean; choose: (id: string) => void }) {
  const [value, setValue] = useState('');
  return <CommercialSourcePicker kind={kind} isArabic={ar} value={value} onChange={id => { setValue(id); choose(id); }} />;
}
describe.each(['QUOTATION', 'SALES_ORDER'] as const)('%s picker', kind => {
  it.each([true, false])('uses eligible server search and human selection, ar=%s', async ar => {
    const fetchMock = vi.fn().mockResolvedValue(reply(kind, [row], 2));
    const choose = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<Harness kind={kind} ar={ar} choose={choose} />);
    const button = await screen.findByRole('button', { name: /Horizon Company/ });
    expect(button.textContent).toContain(kind === 'QUOTATION' ? 'QT-100' : 'SO-100');
    const params = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost').searchParams;
    expect(params.get('status')).toBe(kind === 'QUOTATION' ? 'APPROVED' : 'CONFIRMED');
    expect(params.get('pageSize')).toBe('20'); expect(params.get('locale')).toBe(ar ? 'ar' : 'en');
    expect(container.textContent).not.toMatch(/internal-secret-id|QUOTATION|SALES_ORDER|APPROVED|CONFIRMED/);
    expect(container.firstElementChild).toHaveAttribute('dir', ar ? 'rtl' : 'ltr');
    fireEvent.click(button); expect(choose).toHaveBeenLastCalledWith(row.id);
    expect(screen.getByRole('status')).toHaveTextContent('Horizon Company');
    fireEvent.click(screen.getByRole('button', { name: ar ? 'التالي' : 'Next' }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('page=2'), expect.any(Object)));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' different customer ' } });
    expect(choose).toHaveBeenLastCalledWith('');
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('search=different+customer'), expect.any(Object)));
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('page=1');
  });
  it.each([true, false])('localizes loading, empty, error and retry, ar=%s', async ar => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(kind, [])).mockRejectedValueOnce(new Error('RAW_BACKEND_DETAIL')).mockResolvedValue(reply(kind));
    vi.stubGlobal('fetch', fetchMock); vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<Harness kind={kind} ar={ar} choose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(ar ? 'جارٍ التحميل' : 'Loading');
    const empty = kind === 'QUOTATION' ? (ar ? 'لا توجد عروض أسعار مؤهلة' : 'No eligible quotations found') : (ar ? 'لا توجد أوامر بيع مؤهلة' : 'No eligible sales orders found');
    expect(await screen.findByText(empty)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'retry-search' } });
    const error = kind === 'QUOTATION' ? (ar ? 'تعذر تحميل عروض الأسعار' : 'Could not load quotations') : (ar ? 'تعذر تحميل أوامر البيع' : 'Could not load sales orders');
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(container.textContent).not.toContain('RAW_BACKEND_DETAIL');
    fireEvent.click(screen.getByRole('button', { name: ar ? 'إعادة المحاولة' : 'Retry' }));
    expect(await screen.findByRole('button', { name: /Horizon Company/ })).toBeInTheDocument();
  });
});
it('ignores late results when source kind changes', async () => {
  let resolveOld!: (value: unknown) => void;
  const fetchMock = vi.fn().mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(reply('SALES_ORDER'));
  vi.stubGlobal('fetch', fetchMock);
  const { rerender } = render(<CommercialSourcePicker kind="QUOTATION" isArabic={false} value="" onChange={vi.fn()} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  rerender(<CommercialSourcePicker kind="SALES_ORDER" isArabic={false} value="" onChange={vi.fn()} />);
  expect(await screen.findByRole('button', { name: /SO-100/ })).toBeInTheDocument();
  await act(async () => { resolveOld(reply('QUOTATION')); });
  expect(screen.queryByRole('button', { name: /QT-100/ })).not.toBeInTheDocument();
});
