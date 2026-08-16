import {
  CreateCatalogItem,
  ListCatalogItems,
  PrismaCatalogItemRepository,
  type CatalogItemType,
} from '../../../../features/catalog';

import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from '../../../../lib/api';
import { prisma } from '../../../../lib/prisma';
import { serializeCatalogItem } from './serialize-catalog-item';

const catalogItemRepository =
  new PrismaCatalogItemRepository(prisma);

const createCatalogItem =
  new CreateCatalogItem(catalogItemRepository);

const listCatalogItems =
  new ListCatalogItems(catalogItemRepository);

const allowedTypes: CatalogItemType[] = [
  'PRODUCT',
  'SERVICE',
  'SHIPPING',
  'LABOR',
  'DISCOUNT',
  'CUSTOM',
];

type CreateCatalogItemBody = {
  type?: unknown;
  code?: unknown;
  name?: unknown;
  nameAr?: unknown;
  nameEn?: unknown;
  salePrice?: unknown;
  categoryId?: unknown;
  unitId?: unknown;
  taxRateId?: unknown;
  sku?: unknown;
  barcode?: unknown;
  description?: unknown;
  descriptionAr?: unknown;
  descriptionEn?: unknown;
  purchasePrice?: unknown;
  trackInventory?: unknown;
  allowDiscount?: unknown;
  imageUrl?: unknown;
  notes?: unknown;
  isActive?: unknown;
};

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return typeof value === 'number' ? value : Number.NaN;
}

function parsePositiveInteger(
  value: string | null,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function parseBoolean(
  value: string | null,
): boolean | undefined {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

export const GET = withCompanyAuth(
  [
    'OWNER',
    'ADMIN',
    'SALES',
    'VIEWER',
  ],
  async (request, _auth, company) => {
    const searchParams =
      new URL(request.url).searchParams;

    const rawType = searchParams.get('type');

    if (
      rawType &&
      !allowedTypes.includes(
        rawType as CatalogItemType,
      )
    ) {
      throw ApiError.badRequest(
        'INVALID_CATALOG_ITEM_TYPE',
        'Catalog item type is invalid.',
        {
          field: 'type',
        },
      );
    }

    const result = await listCatalogItems.execute({
      companyId: company.companyId,
      search:
        searchParams.get('search') ?? undefined,
      type:
        rawType as CatalogItemType | undefined,
      categoryId:
        searchParams.get('categoryId') ?? undefined,
      isActive: parseBoolean(
        searchParams.get('isActive'),
      ),
      page: parsePositiveInteger(
        searchParams.get('page'),
      ),
      pageSize: parsePositiveInteger(
        searchParams.get('pageSize'),
      ),
    });

    return apiSuccess(
      result.items.map(serializeCatalogItem),
      {
        meta: {
          pagination: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
          },
        },
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  },
);

export const POST = withCompanyAuth(
  [
    'OWNER',
    'ADMIN',
    'SALES',
  ],
  async (request, _auth, company) => {
    const body =
      (await request.json()) as CreateCatalogItemBody;

    if (
      typeof body.type !== 'string' ||
      typeof body.code !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.salePrice !== 'number'
    ) {
      throw ApiError.badRequest(
        'INVALID_REQUEST_BODY',
        'type, code, name, and salePrice are required.',
      );
    }

    if (
      !allowedTypes.includes(
        body.type as CatalogItemType,
      )
    ) {
      throw ApiError.badRequest(
        'INVALID_CATALOG_ITEM_TYPE',
        'Catalog item type is invalid.',
        {
          field: 'type',
        },
      );
    }

    const result =
      await createCatalogItem.execute({
        companyId: company.companyId,
        type: body.type as CatalogItemType,
        code: body.code,
        name: body.name,
        nameAr: optionalString(body.nameAr),
        nameEn: optionalString(body.nameEn),
        salePrice: body.salePrice,
        categoryId: optionalString(
          body.categoryId,
        ),
        unitId: optionalString(
          body.unitId,
        ),
        taxRateId: optionalString(
          body.taxRateId,
        ),
        sku: optionalString(body.sku),
        barcode: optionalString(body.barcode),
        description: optionalString(
          body.description,
        ),
        descriptionAr: optionalString(
          body.descriptionAr,
        ),
        descriptionEn: optionalString(
          body.descriptionEn,
        ),
        purchasePrice: optionalNumber(
          body.purchasePrice,
        ),
        trackInventory: optionalBoolean(
          body.trackInventory,
        ),
        allowDiscount: optionalBoolean(
          body.allowDiscount,
        ),
        imageUrl: optionalString(body.imageUrl),
        notes: optionalString(body.notes),
        isActive: optionalBoolean(body.isActive),
      });

    if (!result.isSuccess) {
      const error = result.getError();

      const duplicateCodes = [
        'CATALOG_ITEM_CODE_ALREADY_EXISTS',
        'CATALOG_ITEM_SKU_ALREADY_EXISTS',
        'CATALOG_ITEM_BARCODE_ALREADY_EXISTS',
      ];

      if (duplicateCodes.includes(error.code)) {
        throw ApiError.conflict(
          error.code,
          error.message,
        );
      }

      throw ApiError.badRequest(
        error.code,
        error.message,
      );
    }

    return apiSuccess(
      serializeCatalogItem(
        result.getValue(),
      ),
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  },
);
