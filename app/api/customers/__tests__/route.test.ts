import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByIdAndCompanyId: vi.fn(), findByCode: vi.fn(), findAll: vi.fn(), count: vi.fn(), save: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock('@/features/customers/infrastructure/prisma/PrismaCustomerRepository', () => ({
  PrismaCustomerRepository: class {
    findByIdAndCompanyId = mocks.findByIdAndCompanyId; findByCode = mocks.findByCode;
    findAll = mocks.findAll; count = mocks.count; save = mocks.save;
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/api', async () => {
  const errors = await vi.importActual<typeof import('@/lib/api/ApiError')>('@/lib/api/ApiError');
  const responses = await vi.importActual<typeof import('@/lib/api/ApiResponse')>('@/lib/api/ApiResponse');
  return {
    ApiError: errors.ApiError, apiSuccess: responses.apiSuccess,
    withCompanyAuth: (roles: readonly string[], handler: (request: Request, auth: never, company: { companyId: string }) => Promise<Response>) => {
      mocks.roleSets.push([...roles]);
      return async (request: Request) => { try { return await handler(request, {} as never, { companyId: 'company-1' }); } catch (error) { return responses.handleApiError(error); } };
    },
  };
});

import { Customer } from '@/features/customers/domain/entities/Customer';
import { GET as list, POST } from '../route';
import { GET, PATCH } from '../[customerId]/route';

function customer(overrides: Record<string, unknown> = {}) {
  return Customer.create({ companyId: 'company-1', code: 'C-1', name: 'Acme', ...overrides }).getValue();
}
function request(url: string, method = 'GET', body?: unknown) {
  return new Request(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
}

describe('customer APIs', () => {
  it('checks tenant duplicates before explicit proposed creation and does not save a near match', async () => {
    mocks.findAll.mockResolvedValue([customer({ name: 'شركة الأفق للتجهيزات' })]);
    const response = await POST(request('/api/customers', 'POST', { companyId: 'other', nameAr: 'شركة الافق', checkDuplicates: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { customer: null, candidates: [{ name: 'شركة الأفق للتجهيزات' }] } });
    expect(mocks.findAll).toHaveBeenCalledWith({ companyId: 'company-1', search: 'شركة الافق', take: 20 });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('creates exactly the proposed name through the existing minimum-valid flow when no match exists', async () => {
    mocks.findAll.mockResolvedValue([]);
    const response = await POST(request('/api/customers', 'POST', { companyId: 'other', name: 'شركة الأفق', nameAr: 'شركة الأفق', checkDuplicates: true }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { customer: { name: 'شركة الأفق', nameAr: 'شركة الأفق', type: 'COMPANY', status: 'LEAD' } } });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls[0][0].companyId).toBe('company-1');
    expect(mocks.findAll.mock.invocationCallOrder[0]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]);
  });
  beforeEach(() => { vi.clearAllMocks(); mocks.findByCode.mockResolvedValue(null); mocks.count.mockResolvedValue(1); mocks.save.mockImplementation(async (value) => value); });

  it('uses authenticated company context for list and never accepts browser company scope', async () => {
    mocks.findAll.mockResolvedValue([customer()]);
    const response = await list(request('/api/customers?companyId=other'));
    expect(response.status).toBe(200);
    expect(mocks.findAll).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-1' }));
  });

  it('forwards search, status, type and pagination and returns tenant summaries', async () => {
    mocks.findAll.mockResolvedValue([customer()]);
    mocks.count.mockResolvedValueOnce(21).mockResolvedValueOnce(4).mockResolvedValueOnce(10).mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const response = await list(request('/api/customers?search=Noor&status=ACTIVE&type=COMPANY&page=2&pageSize=20'));
    expect(response.status).toBe(200);
    expect(mocks.findAll).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1', search: 'Noor', status: 'ACTIVE', type: 'COMPANY', skip: 20, take: 20,
    }));
    expect(await response.json()).toMatchObject({
      data: {
        pagination: { total: 21, page: 2, pageSize: 20, totalPages: 2 },
        summaries: { total: 21, LEAD: 4, ACTIVE: 10, INACTIVE: 5, BLOCKED: 2 },
      },
    });
  });

  it('creates a customer with canonical WhatsApp and resists mass assignment', async () => {
    const response = await POST(request('/api/customers', 'POST', { companyId: 'other', code: 'C-2', nameEn: 'New', whatsapp: '+96590000000', isDeleted: true }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.customer).toMatchObject({ whatsapp: '+96590000000' });
    expect(body.data.customer).not.toHaveProperty('companyId');
    expect(body.data.customer).not.toHaveProperty('isDeleted');
    expect(mocks.save.mock.calls[0][0].companyId).toBe('company-1');
    expect(mocks.save.mock.calls[0][0].isDeleted).toBe(false);
  });

  it('rejects invalid customer WhatsApp on create', async () => {
    const response = await POST(request('/api/customers', 'POST', { code: 'C-2', nameEn: 'New', whatsapp: '0501234567' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CUSTOMER_WHATSAPP' } });
  });

  it('returns a tenant-scoped active customer detail', async () => {
    mocks.findByIdAndCompanyId.mockResolvedValue(customer({ email: 'a@example.com' }));
    const response = await GET(request('/api/customers/customer-1'));
    expect(response.status).toBe(200);
    expect(mocks.findByIdAndCompanyId).toHaveBeenCalledWith('customer-1', 'company-1');
  });

  it('returns the same not-found boundary for missing and inaccessible customers', async () => {
    mocks.findByIdAndCompanyId.mockResolvedValue(null);
    const response = await GET(request('/api/customers/cross-tenant'));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'CUSTOMER_NOT_FOUND' } });
  });

  it('does not expose a soft-deleted customer', async () => {
    const deleted = customer();
    deleted.softDelete();
    mocks.findByIdAndCompanyId.mockResolvedValue(deleted);
    const response = await GET(request('/api/customers/deleted'));
    expect(response.status).toBe(404);
  });

  it('applies changed fields only and ignores companyId/deletion mass assignment', async () => {
    const existing = customer({ phone: '22223333', whatsapp: '+96590000000' });
    mocks.findByIdAndCompanyId.mockResolvedValue(existing);
    const response = await PATCH(request(`/api/customers/${existing.id}`, 'PATCH', { email: 'new@example.com', companyId: 'other', isDeleted: true }));
    expect(response.status).toBe(200);
    expect(existing).toMatchObject({ email: 'new@example.com', phone: '22223333', whatsapp: '+96590000000', isDeleted: false });
  });

  it('allows viewers to read but excludes them from create and edit roles', () => {
    expect(mocks.roleSets).toContainEqual(['OWNER', 'ADMIN', 'SALES', 'VIEWER']);
    expect(mocks.roleSets.filter((roles) => roles.length === 3)).toEqual(expect.arrayContaining([['OWNER', 'ADMIN', 'SALES']]));
  });
});
