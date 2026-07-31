import { NextRequest, NextResponse } from 'next/server';

import {
  CreateCatalogItem,
  ListCatalogItems,
  PrismaCatalogItemRepository,
  type CatalogItem,
  type CatalogItemType,
} from '../../../../features/catalog';

import { prisma } from '../../../../lib/prisma';

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
  companyId?: unknown;
  type?: unknown;
  code?: unknown;
  name?: unknown;
  salePrice?: unknown;
  categoryId?: unknown;
  unitId?: unknown;
  taxRateId?: unknown;
  sku?: unknown;
  barcode?: unknown;
  description?: unknown;
  purchasePrice?: unknown;
  trackInventory?: unknown;
  allowDiscount?: unknown;
  imageUrl?: unknown;
  notes?: unknown;
  isActive?: unknown;
};

function serializeCatalogItem(item: CatalogItem) {
  return {
    id: item.id.toString(),
    companyId: item.companyId,
    categoryId: item.categoryId,
    unitId: item.unitId,
    taxRateId: item.taxRateId,
    type: item.type,
    code: item.code,
    sku: item.sku,
    barcode: item.barcode,
    name: item.name,
    description: item.description,
    purchasePrice: item.purchasePrice,
    salePrice: item.salePrice,
    trackInventory: item.trackInventory,
    allowDiscount: item.allowDiscount,
    imageUrl: item.imageUrl,
    notes: item.notes,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const companyId = searchParams.get('companyId')?.trim();

    if (!companyId) {
      return NextResponse.json(
        {
          error: {
            code: 'COMPANY_ID_REQUIRED',
            message: 'companyId is required.',
          },
        },
        {
          status: 400,
        },
      );
    }

    const rawType = searchParams.get('type');

    if (
      rawType &&
      !allowedTypes.includes(rawType as CatalogItemType)
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CATALOG_ITEM_TYPE',
            message: 'Catalog item type is invalid.',
          },
        },
        {
          status: 400,
        },
      );
    }

    const result = await listCatalogItems.execute({
      companyId,
      search: searchParams.get('search') ?? undefined,
      type: rawType as CatalogItemType | undefined,
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

    return NextResponse.json({
      data: result.items.map(serializeCatalogItem),
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error('GET /api/catalog/items failed:', error);

    return NextResponse.json(
      {
        error: {
          code: 'CATALOG_ITEMS_LIST_FAILED',
          message: 'Unable to load catalog items.',
        },
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body =
      (await request.json()) as CreateCatalogItemBody;

    if (
      typeof body.companyId !== 'string' ||
      typeof body.type !== 'string' ||
      typeof body.code !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.salePrice !== 'number'
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST_BODY',
            message:
              'companyId, type, code, name, and salePrice are required.',
          },
        },
        {
          status: 400,
        },
      );
    }

    if (
      !allowedTypes.includes(
        body.type as CatalogItemType,
      )
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CATALOG_ITEM_TYPE',
            message: 'Catalog item type is invalid.',
          },
        },
        {
          status: 400,
        },
      );
    }

    const result = await createCatalogItem.execute({
      companyId: body.companyId,
      type: body.type as CatalogItemType,
      code: body.code,
      name: body.name,
      salePrice: body.salePrice,
      categoryId: optionalString(body.categoryId),
      unitId: optionalString(body.unitId),
      taxRateId: optionalString(body.taxRateId),
      sku: optionalString(body.sku),
      barcode: optionalString(body.barcode),
      description: optionalString(body.description),
      purchasePrice: optionalNumber(body.purchasePrice),
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

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: duplicateCodes.includes(error.code)
            ? 409
            : 400,
        },
      );
    }

    return NextResponse.json(
      {
        data: serializeCatalogItem(
          result.getValue(),
        ),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error('POST /api/catalog/items failed:', error);

    if (
      error instanceof SyntaxError
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_JSON',
            message: 'Request body must be valid JSON.',
          },
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'CATALOG_ITEM_CREATE_FAILED',
          message: 'Unable to create catalog item.',
        },
      },
      {
        status: 500,
      },
    );
  }
}