import { ApiError, apiSuccess, withCompanyAuth } from '@/lib/api';
import { CreateCustomer } from '@/features/customers/application/commands/CreateCustomer';
import { ListCustomers } from '@/features/customers/application/queries/ListCustomers';
import type { CustomerStatus, CustomerType } from '@/features/customers/domain/entities/Customer';
import { PrismaCustomerRepository } from '@/features/customers/infrastructure/prisma/PrismaCustomerRepository';
import { prisma } from '@/lib/prisma';

import { customerToResponse, parseCustomerChanges, throwCustomerError } from './customer-api';

export const runtime = 'nodejs';
const repository = new PrismaCustomerRepository(prisma);
const createCustomer = new CreateCustomer(repository);
const listCustomers = new ListCustomers(repository);

function positiveInteger(value: string | null): number | undefined {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (request, _auth, company) => {
    const url = new URL(request.url);
    const output = await listCustomers.execute({
      companyId: company.companyId,
      search: url.searchParams.get('search')?.trim() || undefined,
      status: (url.searchParams.get('status') as CustomerStatus | null) ?? undefined,
      type: (url.searchParams.get('type') as CustomerType | null) ?? undefined,
      page: positiveInteger(url.searchParams.get('page')),
      pageSize: positiveInteger(url.searchParams.get('pageSize')),
    });
    return apiSuccess({
      customers: output.customers.map(customerToResponse),
      pagination: { total: output.total, page: output.page, pageSize: output.pageSize, totalPages: output.totalPages },
    }, { headers: { 'Cache-Control': 'no-store' } });
  },
);

export const POST = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES'],
  async (request, _auth, company) => {
    const body = (await request.json()) as Record<string, unknown>;
    const changes = parseCustomerChanges(body);
    if (typeof changes.code !== 'string' || !changes.code) {
      throw ApiError.badRequest('CUSTOMER_CODE_REQUIRED', 'Customer code is required.', { field: 'code' });
    }
    if (typeof changes.name !== 'string' || !changes.name) {
      throw ApiError.badRequest('CUSTOMER_NAME_REQUIRED', 'Customer name is required.', { field: 'name' });
    }
    const result = await createCustomer.execute({ ...changes, companyId: company.companyId, code: changes.code, name: changes.name });
    if (!result.isSuccess) throwCustomerError(result.getError());
    return apiSuccess({ customer: customerToResponse(result.getValue()) }, {
      status: 201, headers: { 'Cache-Control': 'no-store' },
    });
  },
);
