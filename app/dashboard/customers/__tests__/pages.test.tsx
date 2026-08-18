// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ customerId: 'customer-1' }), useRouter: () => ({ push: navigation.push }) }));
vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic: false }) }));

import CustomerDetailPage from '../[customerId]/page';
import EditCustomerPage from '../[customerId]/edit/page';
import NewCustomerPage from '../new/page';

const customer = { id: 'customer-1', code: 'CUST-000001', name: 'Acme', nameEn: 'Acme', type: 'COMPANY', status: 'ACTIVE', email: 'hello@example.com', whatsapp: '+96590000000', countryCode: 'KW', preferredCurrency: 'KWD' };
const response = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));

describe('customer management pages', () => {
  beforeEach(() => { vi.restoreAllMocks(); navigation.push.mockReset(); });

  it('renders customer detail and canonical contacts', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => response({ data: { customer } }));
    render(<CustomerDetailPage />);
    const matches = await screen.findAllByText('Acme');
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText('+96590000000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit customer' })).toHaveAttribute('href', '/dashboard/customers/customer-1/edit');
  });

  it('creates a new customer and navigates to its detail', async () => {
    const fetch = vi.spyOn(global, 'fetch').mockImplementation(() => response({ data: { customer: { id: 'customer-new', code: 'CUST-000002' } } }, 201));
    render(<NewCustomerPage />);
    fireEvent.change(screen.getByLabelText('Customer Name (English)'), { target: { value: 'New Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/dashboard/customers/customer-new'));
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ nameEn: 'New Co', whatsapp: null });
  });

  it('loads edit state and PATCHes changed fields only', async () => {
    const fetch = vi.spyOn(global, 'fetch')
      .mockImplementationOnce(() => response({ data: { customer } }))
      .mockImplementationOnce(() => response({ data: { customer: { ...customer, email: 'new@example.com' } } }));
    render(<EditCustomerPage />);
    const email = await screen.findByLabelText('Email');
    fireEvent.change(email, { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/dashboard/customers/customer-1'));
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ email: 'new@example.com' });
  });
});
