import { NextResponse } from 'next/server';

import {
  CreateCustomer,
  ListCustomers,
  PrismaCustomerRepository,
  type CreateCustomerInput,
  type Customer,
  type CustomerStatus,
  type CustomerType,
} from '../../../features/customers';

import { prisma } from '../../../lib/prisma';

export const runtime = 'nodejs';

const customerRepository =
  new PrismaCustomerRepository(prisma);

const createCustomer =
  new CreateCustomer(customerRepository);

const listCustomers =
  new ListCustomers(customerRepository);

function customerToResponse(customer: Customer) {
  return {
    id: customer.id.toString(),
    companyId: customer.companyId,
    code: customer.code,
    type: customer.type,
    status: customer.status,
    name: customer.name,
    legalName: customer.legalName,
    email: customer.email,
    phone: customer.phone,
    mobile: customer.mobile,
    taxNumber: customer.taxNumber,
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    city: customer.city,
    state: customer.state,
    postalCode: customer.postalCode,
    countryCode: customer.countryCode,
    preferredLocale: customer.preferredLocale,
    preferredCurrency: customer.preferredCurrency,
    creditLimit: customer.creditLimit,
    paymentTermDays: customer.paymentTermDays,
    notes: customer.notes,
    isDeleted: customer.isDeleted,
    deletedAt: customer.deletedAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

function parsePositiveInteger(
  value: string | null,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1
  ) {
    return undefined;
  }

  return parsedValue;
}

function getDomainErrorStatus(code: string): number {
  switch (code) {
    case 'CUSTOMER_CODE_ALREADY_EXISTS':
      return 409;

    default:
      return 400;
  }
}

export async function GET(
  request: Request,
): Promise<NextResponse> {
  try {
    const url = new URL(request.url);

    const companyId =
      url.searchParams.get('companyId')?.trim();

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
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const output = await listCustomers.execute({
      companyId,
      search:
        url.searchParams.get('search')?.trim() ||
        undefined,
      status:
        (url.searchParams.get('status') as
          | CustomerStatus
          | null) ?? undefined,
      type:
        (url.searchParams.get('type') as
          | CustomerType
          | null) ?? undefined,
      includeDeleted:
        url.searchParams.get('includeDeleted') ===
        'true',
      page: parsePositiveInteger(
        url.searchParams.get('page'),
      ),
      pageSize: parsePositiveInteger(
        url.searchParams.get('pageSize'),
      ),
    });

    return NextResponse.json(
      {
        data: {
          customers: output.customers.map(
            customerToResponse,
          ),
          pagination: {
            total: output.total,
            page: output.page,
            pageSize: output.pageSize,
            totalPages: output.totalPages,
          },
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      '[VOKA CUSTOMERS GET ERROR]',
      error,
    );

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'The customers could not be retrieved.',
        },
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const body =
      (await request.json()) as Partial<CreateCustomerInput>;

    if (
      typeof body.companyId !== 'string' ||
      !body.companyId.trim()
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'COMPANY_ID_REQUIRED',
            message: 'companyId is required.',
          },
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (
      typeof body.code !== 'string' ||
      !body.code.trim()
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'CUSTOMER_CODE_REQUIRED',
            message: 'Customer code is required.',
          },
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (
      typeof body.name !== 'string' ||
      !body.name.trim()
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'CUSTOMER_NAME_REQUIRED',
            message: 'Customer name is required.',
          },
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const result = await createCustomer.execute({
      ...body,
      companyId: body.companyId.trim(),
      code: body.code.trim(),
      name: body.name.trim(),
    } as CreateCustomerInput);

    if (!result.isSuccess) {
      const error = result.getError();

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: getDomainErrorStatus(error.code),
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    return NextResponse.json(
      {
        data: {
          customer: customerToResponse(
            result.getValue(),
          ),
        },
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      '[VOKA CUSTOMERS POST ERROR]',
      error,
    );

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'The customer could not be created.',
        },
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
