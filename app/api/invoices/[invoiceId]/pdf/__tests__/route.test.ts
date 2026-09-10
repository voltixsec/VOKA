import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), render: vi.fn() }));
vi.mock('@/lib/api', async () => {
 const { ApiError } = await import('@/lib/api/ApiError');
 return { ApiError, withCompanyAuth: (_roles: unknown, handler: Function) => (request: Request) => handler(request, { user: { locale: 'EN' } }, { companyId: 'tenant-a' }) };
});
vi.mock('@/lib/documents/company-document-identity', () => ({ localizeCompanyDocumentIdentity: () => ({ name: 'Company' }) }));
vi.mock('@/lib/documents/invoice-snapshot', () => ({ invoiceIdFromDocumentRequest: () => 'invoice-a', getInvoiceDocumentSnapshot: async (companyId: string) => {
 expect(companyId).toBe('tenant-a'); return { company: { name: 'Company' }, number: 'INV-1', status: 'ISSUED', settlementStatus: 'PAID', invoiceDate: new Date('2026-09-10'), currencyCode: 'KWD', customerName: 'Customer', lines: [], paidAmount: 10, outstandingAmount: 0, subtotal: 10, totalAmount: 10, discountAmount: 0, taxAmount: 0 };
} }));
vi.mock('@/lib/documents/commercial-pdf', () => ({ commercialSnapshotFromParts: mocks.snapshot, renderCommercialProposalPdf: mocks.render }));
import { GET } from '../route';
describe('Invoice PDF locale and settled amounts', () => {
 beforeEach(() => { mocks.snapshot.mockReset().mockImplementation(input => input); mocks.render.mockReset().mockResolvedValue(Buffer.from('%PDF-test')); });
 it.each(['ar', 'en'])('renders %s with tenant scope and localized settlement', async locale => {
  const response = await GET(new Request('http://localhost/api/invoices/invoice-a/pdf?locale=' + locale));
  expect(response.status).toBe(200); expect(mocks.snapshot).toHaveBeenCalledWith(expect.objectContaining({ locale, kind: 'INVOICE', notes: expect.stringContaining('10.000') }));
  expect(mocks.snapshot.mock.calls[0][0].notes).not.toMatch(/ISSUED|PAID/);
 });
 it('rejects unsupported locale', async () => {
  await expect(GET(new Request('http://localhost/api/invoices/invoice-a/pdf?locale=xx'))).rejects.toMatchObject({ code: 'DOCUMENT_LOCALE_INVALID' });
 });
});
