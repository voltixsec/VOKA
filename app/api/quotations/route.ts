import {
  ApiError,
  apiSuccess,
  withCompanyAuth,
} from '@/lib/api';

import {
  CreateQuotationUseCase,
  ListQuotationsUseCase,
  type CreateQuotationDto,
} from '@/src/application/quotation';

import type { QuotationStatus } from '@/src/domain/quotation';

import { PrismaQuotationRepository } from '@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository';
import { PrismaQuotationReferenceValidator } from '@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator';

import { serializeQuotation } from './serialize-quotation';

const quotationRepository =
  new PrismaQuotationRepository();

const quotationReferenceValidator =
  new PrismaQuotationReferenceValidator();

const createQuotation =
  new CreateQuotationUseCase(
    quotationRepository,
    quotationReferenceValidator,
  );


const listQuotations =
  new ListQuotationsUseCase(quotationRepository);
type CreateQuotationBody = {
  customerId?: unknown;
  priceListId?: unknown;
  quotationNumber?: unknown;
  currencyCode?: unknown;
  customer?: unknown;
  lines?: unknown;
  discount?: unknown;
  notes?: unknown;
  termsAndConditions?: unknown;
  issueDate?: unknown;
  expiryDate?: unknown;
};

function parseOptionalString(
  value: unknown,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim() || null;
}

function parseOptionalDate(
  value: unknown,
  field: string,
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw ApiError.badRequest(
      'INVALID_DATE',
      `${field} must be a valid ISO date string.`,
      {
        field,
      },
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw ApiError.badRequest(
      'INVALID_DATE',
      `${field} must be a valid ISO date string.`,
      {
        field,
      },
    );
  }

  return date;
}
const quotationStatuses = new Set([
  "DRAFT",
  "SENT",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
]);

function parsePositiveInteger(
  value: string | null,
): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

export const GET = withCompanyAuth(
  ["OWNER", "ADMIN", "SALES", "VIEWER"],
  async (request, _auth, company) => {
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status");
    const status =
      rawStatus && quotationStatuses.has(rawStatus)
        ? (rawStatus as QuotationStatus)
        : undefined;

    const result = await listQuotations.execute({
      companyId: company.companyId,
      status,
      customerId:
        url.searchParams.get("customerId")?.trim() ||
        undefined,
      search:
        url.searchParams.get("search")?.trim() ||
        undefined,
      page: parsePositiveInteger(
        url.searchParams.get("page"),
      ),
      pageSize: parsePositiveInteger(
        url.searchParams.get("pageSize"),
      ),
    });

    return apiSuccess(
      {
        quotations:
          result.quotations.map(serializeQuotation),
        pagination: result.pagination,
      },
      {
        headers: {
          "Cache-Control": "no-store",
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
      (await request.json()) as CreateQuotationBody;

    if (
      typeof body.customerId !== 'string' ||
      !body.customerId.trim()
    ) {
      throw ApiError.badRequest(
        'CUSTOMER_ID_REQUIRED',
        'customerId is required.',
        {
          field: 'customerId',
        },
      );
    }

    if (
      typeof body.quotationNumber !==
        'string' ||
      !body.quotationNumber.trim()
    ) {
      throw ApiError.badRequest(
        'QUOTATION_NUMBER_REQUIRED',
        'quotationNumber is required.',
        {
          field: 'quotationNumber',
        },
      );
    }

    if (
      typeof body.customer !== 'object' ||
      body.customer === null ||
      Array.isArray(body.customer)
    ) {
      throw ApiError.badRequest(
        'CUSTOMER_SNAPSHOT_REQUIRED',
        'customer must contain a valid customer snapshot.',
        {
          field: 'customer',
        },
      );
    }

    const customer =
      body.customer as Record<string, unknown>;

    if (
      typeof customer.name !== 'string' ||
      !customer.name.trim()
    ) {
      throw ApiError.badRequest(
        'CUSTOMER_NAME_REQUIRED',
        'customer.name is required.',
        {
          field: 'customer.name',
        },
      );
    }

    if (
      !Array.isArray(body.lines) ||
      body.lines.length === 0
    ) {
      throw ApiError.badRequest(
        'QUOTATION_LINES_REQUIRED',
        'At least one quotation line is required.',
        {
          field: 'lines',
        },
      );
    }

    const issueDate = parseOptionalDate(
      body.issueDate,
      'issueDate',
    );

    const expiryDate = parseOptionalDate(
      body.expiryDate,
      'expiryDate',
    );

    const dto: CreateQuotationDto = {
      companyId: company.companyId,
      customerId: body.customerId.trim(),
      quotationNumber:
        body.quotationNumber.trim(),

      priceListId: parseOptionalString(
        body.priceListId,
      ),

      currencyCode:
        typeof body.currencyCode === 'string'
          ? body.currencyCode.trim().toUpperCase()
          : undefined,

      customer: body.customer as
        CreateQuotationDto['customer'],

      lines: body.lines as
        CreateQuotationDto['lines'],

      discount: body.discount as
        CreateQuotationDto['discount'],

      notes: parseOptionalString(
        body.notes,
      ),

      termsAndConditions:
        parseOptionalString(
          body.termsAndConditions,
        ),

      issueDate: issueDate ?? undefined,
      expiryDate,
    };

    const result =
      await createQuotation.execute(dto);

    if (!result.success) {
      if (
        result.error.code ===
        'QUOTATION_ALREADY_EXISTS'
      ) {
        throw ApiError.conflict(
          result.error.code,
          result.error.message,
        );
      }

      throw ApiError.badRequest(
        result.error.code,
        result.error.message,
      );
    }

    return apiSuccess(
      serializeQuotation(result.data),
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  },
);