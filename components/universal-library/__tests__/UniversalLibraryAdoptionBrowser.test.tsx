// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from '@/app/dashboard/products/universal-library/page';

vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic: false }) }));
const item = { id: 'published-camera', type: 'PRODUCT', name: 'Published camera', isActive: true, manufacturer: { name: 'Maker' }, modelNumber: 'CAM-4K' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });
afterEach(() => vi.restoreAllMocks());
function mockApi(salePrice: number | null, status = 201) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') return reply({ catalogItem: { id: 'tenant-item', code: 'TENANT-CAM', name: 'Tenant camera', salePrice }, isNewAdoption: status === 201 }, status);
    if (String(url).includes('?limit=50')) return reply([item]);
    if (String(url).endsWith('/published-camera')) return reply({ ...item, identifiers: [{ id: 'mpn', identifierType: 'MPN', value: 'MAKER-4K' }], provenances: [{ id: 'evidence', source: { name: 'Manufacturer datasheet' } }] });
    return reply([]);
  });
}
describe('tenant published-library adoption', () => {
  it.each([['', null], ['0', 0], ['123.456', 123.456]] as const)('submits price %s without client identity fields', async (input, expected) => {
    const fetchMock = mockApi(expected);
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Company Catalog' }));
    const modal = screen.getByRole('dialog');
    await within(modal).findByText('MPN: MAKER-4K');
    expect(within(modal).getByText('Evidence source: Manufacturer datasheet')).toBeInTheDocument();
    if (input) fireEvent.change(within(modal).getByLabelText('Sale Price (optional)'), { target: { value: input } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Add to Company Catalog' }));
    await screen.findByText('Added to Company Catalog');
    expect(fetchMock).toHaveBeenCalledWith('/api/universal-library/items?limit=50&isActive=true', expect.any(Object));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('/api/universal-library/items/published-camera/adopt');
    expect(JSON.parse(posts[0][1]!.body as string)).toEqual(expected === null ? {} : { salePrice: expected });
    expect(screen.getByText(expected === null ? 'Price not set' : expected.toFixed(3))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to Company Catalog' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Universal Library operator navigation' })).not.toBeInTheDocument();
  });
  it('shows existing tenant truth returned by an idempotent adoption', async () => {
    mockApi(75, 200);
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Company Catalog' }));
    const modal = screen.getByRole('dialog');
    fireEvent.change(within(modal).getByLabelText('Sale Price (optional)'), { target: { value: '0' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Add to Company Catalog' }));
    await screen.findByText('Added to Company Catalog');
    expect(screen.getByText('75.000')).toBeInTheDocument();
    expect(screen.getByText('Tenant camera · TENANT-CAM')).toBeInTheDocument();
  });
  it('keeps server rejection visible without claiming adoption', async () => {
    const fetchMock = mockApi(null);
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add to Company Catalog' }));
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'Forbidden' } }), { status: 403 }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add to Company Catalog' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Forbidden'));
    expect(screen.queryByText('Added to Company Catalog')).not.toBeInTheDocument();
  });
});
