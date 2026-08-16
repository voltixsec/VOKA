import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByIdAndCompanyId: vi.fn(),
  findByCode: vi.fn(),
  findBySku: vi.fn(),
  findByBarcode: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  roleSets: [] as string[][],
}));

vi.mock('../../../../../features/catalog/infrastructure/prisma/PrismaCatalogItemRepository', () => ({
  PrismaCatalogItemRepository: class {
    findByIdAndCompanyId = mocks.findByIdAndCompanyId;
    findByCode = mocks.findByCode;
    findBySku = mocks.findBySku;
    findByBarcode = mocks.findByBarcode;
    findAll = mocks.findAll;
    count = mocks.count;
    save = mocks.save;
  },
}));

vi.mock('../../../../../lib/prisma', () => ({ prisma: {} }));

vi.mock('../../../../../lib/api', async () => {
  const errors = await vi.importActual<typeof import('../../../../../lib/api/ApiError')>('../../../../../lib/api/ApiError');
  const responses = await vi.importActual<typeof import('../../../../../lib/api/ApiResponse')>('../../../../../lib/api/ApiResponse');
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

import { CatalogItem } from '../../../../../features/catalog/domain/entities/CatalogItem';
import { GET as list, POST } from '../route';
import { DELETE, GET as getOne, PATCH } from '../[itemId]/route';

function catalogItem(overrides: Record<string, unknown> = {}) {
  return CatalogItem.create({
    companyId: 'company-1',
    type: 'PRODUCT',
    code: 'PROD-100',
    name: 'Default Camera',
    nameAr: 'كاميرا افتراضية',
    nameEn: 'Default Camera',
    salePrice: 200,
    ...overrides,
  }).getValue();
}

function request(url: string, method = 'GET', body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('Catalog Item APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByCode.mockResolvedValue(null);
    mocks.findBySku.mockResolvedValue(null);
    mocks.findByBarcode.mockResolvedValue(null);
    mocks.count.mockResolvedValue(1);
    mocks.save.mockImplementation(async (value) => value);
  });

  it('lists catalog items for authenticated active company and ignores browser spoofing', async () => {
    mocks.findAll.mockResolvedValue([catalogItem()]);
    mocks.count.mockResolvedValue(1);

    const response = await list(request('/api/catalog/items?companyId=spoofed-company'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1' }),
    );
    expect(body.data[0]).toMatchObject({
      code: 'PROD-100',
      nameAr: 'كاميرا افتراضية',
      nameEn: 'Default Camera',
    });
  });

  it('creates a product with bilingual fields and enforces tenant isolation', async () => {
    const response = await POST(
      request('/api/catalog/items', 'POST', {
        type: 'PRODUCT',
        code: 'PROD-200',
        name: 'New Camera',
        nameAr: 'كاميرا جديدة',
        nameEn: 'New Camera',
        salePrice: 150,
        companyId: 'spoofed-company',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      code: 'PROD-200',
      nameAr: 'كاميرا جديدة',
      nameEn: 'New Camera',
      companyId: 'company-1',
    });
    expect(mocks.save.mock.calls[0][0].companyId).toBe('company-1');
  });

  it('rejects duplicate catalog item code within the same company', async () => {
    mocks.findByCode.mockResolvedValue(catalogItem({ code: 'PROD-200' }));

    const response = await POST(
      request('/api/catalog/items', 'POST', {
        type: 'PRODUCT',
        code: 'PROD-200',
        name: 'Duplicate Camera',
        salePrice: 100,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'CATALOG_ITEM_CODE_ALREADY_EXISTS' },
    });
  });

  it('returns a single catalog item by ID', async () => {
    mocks.findByIdAndCompanyId.mockResolvedValue(catalogItem());

    const response = await getOne(request('/api/catalog/items/item-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ code: 'PROD-100' });
    expect(mocks.findByIdAndCompanyId).toHaveBeenCalledWith('item-1', 'company-1');
  });

  it('returns same 404 for missing or inaccessible catalog items', async () => {
    mocks.findByIdAndCompanyId.mockResolvedValue(null);

    const response = await getOne(request('/api/catalog/items/cross-tenant-item'));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'CATALOG_ITEM_NOT_FOUND' },
    });
  });

  it('updates catalog item details and resists mass assignment of companyId or code', async () => {
    const existing = catalogItem();
    mocks.findByIdAndCompanyId.mockResolvedValue(existing);

    const response = await PATCH(
      request('/api/catalog/items/item-1', 'PATCH', {
        nameAr: 'اسم معدل',
        salePrice: 250,
        companyId: 'hacked-company',
        code: 'HACKED-CODE',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      nameAr: 'اسم معدل',
      salePrice: 250,
      code: 'PROD-100',
      companyId: 'company-1',
    });
  });

  it('deactivates catalog item on DELETE to preserve historical documents', async () => {
    const existing = catalogItem();
    mocks.findByIdAndCompanyId.mockResolvedValue(existing);

    const response = await DELETE(request('/api/catalog/items/item-1', 'DELETE'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.isActive).toBe(false);
    expect(mocks.save.mock.calls[0][0].isActive).toBe(false);
  });

  it('enforces expected role boundaries across endpoints', () => {
    expect(mocks.roleSets).toContainEqual(['OWNER', 'ADMIN', 'SALES', 'VIEWER']);
    expect(mocks.roleSets).toContainEqual(['OWNER', 'ADMIN', 'SALES']);
    expect(mocks.roleSets).toContainEqual(['OWNER', 'ADMIN']);
  });
});
