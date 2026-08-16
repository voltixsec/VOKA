import {
  PrismaCatalogItemRepository,
  UpdateCatalogItem,
} from '../../../../../features/catalog';
import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from '../../../../../lib/api';
import { prisma } from '../../../../../lib/prisma';
import { serializeCatalogItem } from '../serialize-catalog-item';

const catalogItemRepository = new PrismaCatalogItemRepository(prisma);
const updateCatalogItem = new UpdateCatalogItem(catalogItemRepository);

function itemId(request: Request): string {
  const value = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  if (!value || value === 'items') {
    throw ApiError.badRequest('ITEM_ID_REQUIRED', 'itemId is required.');
  }
  return decodeURIComponent(value);
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'number' ? value : Number.NaN;
}

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (request, _auth, company) => {
    const id = itemId(request);

    const item = await catalogItemRepository.findByIdAndCompanyId(
      id,
      company.companyId,
    );

    if (!item) {
      throw ApiError.notFound(
        'CATALOG_ITEM_NOT_FOUND',
        'Catalog item not found for active company.',
      );
    }

    return apiSuccess(serializeCatalogItem(item), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);

export const PATCH = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES'],
  async (request, _auth, company) => {
    const id = itemId(request);
    const body = (await request.json()) as Record<string, unknown>;

    const result = await updateCatalogItem.execute({
      id,
      companyId: company.companyId,
      name: optionalString(body.name) ?? undefined,
      nameAr: optionalString(body.nameAr),
      nameEn: optionalString(body.nameEn),
      description: optionalString(body.description),
      descriptionAr: optionalString(body.descriptionAr),
      descriptionEn: optionalString(body.descriptionEn),
      unitId: optionalString(body.unitId),
      taxRateId: optionalString(body.taxRateId),
      categoryId: optionalString(body.categoryId),
      sku: optionalString(body.sku),
      barcode: optionalString(body.barcode),
      salePrice: optionalNumber(body.salePrice) ?? undefined,
      purchasePrice: optionalNumber(body.purchasePrice),
      trackInventory: optionalBoolean(body.trackInventory),
      allowDiscount: optionalBoolean(body.allowDiscount),
      isActive: optionalBoolean(body.isActive),
    });

    if (!result.isSuccess) {
      const error = result.getError();
      if (error.code === 'CATALOG_ITEM_NOT_FOUND') {
        throw ApiError.notFound(error.code, error.message);
      }
      if (
        error.code === 'CATALOG_ITEM_SKU_ALREADY_EXISTS' ||
        error.code === 'CATALOG_ITEM_BARCODE_ALREADY_EXISTS'
      ) {
        throw ApiError.conflict(error.code, error.message);
      }
      throw ApiError.badRequest(error.code, error.message);
    }

    return apiSuccess(serializeCatalogItem(result.getValue()), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);

export const DELETE = withCompanyAuth(
  ['OWNER', 'ADMIN'],
  async (request, _auth, company) => {
    const id = itemId(request);

    const item = await catalogItemRepository.findByIdAndCompanyId(
      id,
      company.companyId,
    );

    if (!item) {
      throw ApiError.notFound(
        'CATALOG_ITEM_NOT_FOUND',
        'Catalog item not found for active company.',
      );
    }

    item.deactivate();
    await catalogItemRepository.save(item);

    return apiSuccess(serializeCatalogItem(item), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);
