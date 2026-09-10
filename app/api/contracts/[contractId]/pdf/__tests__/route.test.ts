import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), render: vi.fn() }));
vi.mock('@/lib/api', async () => {
 const { ApiError } = await import('@/lib/api/ApiError');
 return { ApiError, withCompanyAuth: (_roles: unknown, handler: Function) => (request: Request) => handler(request, { user: { locale: 'EN' } }, { companyId: 'tenant-a' }) };
});
vi.mock('@/lib/documents/company-document-identity', () => ({ localizeCompanyDocumentIdentity: () => ({ name: 'Company' }) }));
vi.mock('@/lib/documents/contract-snapshot', () => ({ contractIdFromDocumentRequest: () => 'contract-a', getContractDocumentSnapshot: async (companyId: string) => {
 expect(companyId).toBe('tenant-a'); return { companyIdentity: { name: 'Company' }, number: 'CN-1', status: 'DRAFT', contractDate: '2026-09-10', currencyCode: 'KWD', customer: { name: 'Customer' }, lines: [], milestones: [] };
} }));
vi.mock('@/lib/documents/commercial-pdf', () => ({ commercialSnapshotFromParts: mocks.snapshot, renderCommercialProposalPdf: mocks.render }));
import { GET } from '../route';
describe('Contract PDF locale', () => {
 beforeEach(() => { mocks.snapshot.mockReset().mockImplementation(input => input); mocks.render.mockReset().mockResolvedValue(Buffer.from('%PDF-test')); });
 it.each(['ar', 'en'])('honors explicit %s without changing account language', async locale => {
  const response = await GET(new Request('http://localhost/api/contracts/contract-a/pdf?locale=' + locale));
  expect(response.status).toBe(200); expect(mocks.snapshot).toHaveBeenCalledWith(expect.objectContaining({ locale, kind: 'CONTRACT' }));
 });
 it('rejects unsupported locale before rendering', async () => {
  await expect(GET(new Request('http://localhost/api/contracts/contract-a/pdf?locale=xx'))).rejects.toMatchObject({ code: 'DOCUMENT_LOCALE_INVALID' });
  expect(mocks.render).not.toHaveBeenCalled();
 });
});
