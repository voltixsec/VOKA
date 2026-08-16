import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Unit } from '../../../../features/catalog/domain/entities/Unit';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findBySymbol: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock('../../../../features/catalog', () => ({
  Unit,
  PrismaUnitRepository: class {
    findById = mocks.findById;
    findBySymbol = mocks.findBySymbol;
    findAll = mocks.findAll;
    save = mocks.save;
  },
}));

vi.mock('../../../../lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

vi.mock('../../../../lib/api', async () => {
  const errors = await vi.importActual<typeof import('../../../../lib/api/ApiError')>('../../../../lib/api/ApiError');
  const responses = await vi.importActual<typeof import('../../../../lib/api/ApiResponse')>('../../../../lib/api/ApiResponse');
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (roles: readonly string[], handler: (request: Request, auth: never, company: { companyId: string }) => Promise<Response>) => {
      mocks.roleSets.push([...roles]);
      return async (request: Request) => {
        try {
          return await handler(
            request,
            {} as never,
            { companyId: 'company-1' },
          );
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

function createUnit(overrides: Record<string, unknown> = {}) {
  return Unit.create({
    companyId: 'company-1',
    name: 'Piece',
    symbol: 'PCS',
    nameAr: 'قطعة',
    nameEn: 'Piece',
    ...overrides,
  }).getValue();
}

function request(url: string, method = 'GET', body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

import { GET, POST } from '../route';

describe('Unit API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findBySymbol.mockResolvedValue(null);
    mocks.save.mockImplementation(async (unit) => unit);
  });

  it('lists units passing active companyId filter', async () => {
    mocks.findAll.mockResolvedValue([createUnit()]);

    const response = await GET(request('/api/units?companyId=spoofed-company'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findAll).toHaveBeenCalledWith({
      companyId: 'company-1',
      isActive: true,
    });
    expect(body.data[0]).toMatchObject({
      symbol: 'PCS',
      companyId: 'company-1',
    });
  });

  it('creates a tenant-owned unit and ignores request body companyId spoofing', async () => {
    const response = await POST(
      request('/api/units', 'POST', {
        name: 'Meter',
        symbol: 'MTR',
        companyId: 'spoofed-company',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      symbol: 'MTR',
      companyId: 'company-1',
    });
    expect(mocks.findBySymbol).toHaveBeenCalledWith('company-1', 'MTR');
    expect(mocks.save.mock.calls[0][0].companyId).toBe('company-1');
  });

  it('rejects duplicate unit symbol within the active company', async () => {
    mocks.findBySymbol.mockResolvedValue(createUnit({ symbol: 'PCS' }));

    const response = await POST(
      request('/api/units', 'POST', {
        name: 'Piece',
        symbol: 'PCS',
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNIT_SYMBOL_ALREADY_EXISTS' },
    });
  });

  it('allows different companies to use the same symbol (e.g. MTR in company-1 vs company-2)', async () => {
    mocks.findBySymbol.mockResolvedValue(null);

    const response = await POST(
      request('/api/units', 'POST', {
        name: 'Meter',
        symbol: 'MTR',
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.findBySymbol).toHaveBeenCalledWith('company-1', 'MTR');
  });
});
