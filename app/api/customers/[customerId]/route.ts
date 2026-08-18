import { ApiError, apiSuccess, withCompanyAuth } from '@/lib/api';
import { UpdateCustomer } from '@/features/customers/application/commands/UpdateCustomer';
import { GetCustomer } from '@/features/customers/application/queries/GetCustomer';
import { PrismaCustomerRepository } from '@/features/customers/infrastructure/prisma/PrismaCustomerRepository';
import { prisma } from '@/lib/prisma';

import { customerToResponse, parseCustomerChanges, throwCustomerError } from '../customer-api';

export const runtime = 'nodejs';
const repository = new PrismaCustomerRepository(prisma);
const getCustomer = new GetCustomer(repository);
const updateCustomer = new UpdateCustomer(repository);

function customerId(request: Request): string {
  const value = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
  if (!value || value === 'customers') throw ApiError.badRequest('CUSTOMER_ID_REQUIRED', 'customerId is required.');
  return decodeURIComponent(value);
}

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (request, _auth, company) => {
    const customer = await getCustomer.execute({ companyId: company.companyId, customerId: customerId(request) });
    if (!customer) throw ApiError.notFound('CUSTOMER_NOT_FOUND', 'Customer not found.');
    return apiSuccess({ customer: customerToResponse(customer) }, { headers: { 'Cache-Control': 'no-store' } });
  },
);

export const PATCH = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES'],
  async (request, _auth, company) => {
    const changes = parseCustomerChanges((await request.json()) as Record<string, unknown>);
    // Remove code from changes to prevent editing customer code
    delete (changes as Record<string, unknown>).code;

    if (Object.keys(changes).length === 0) {
      throw ApiError.badRequest('CUSTOMER_CHANGES_REQUIRED', 'At least one editable customer field is required.');
    }
    const result = await updateCustomer.execute({
      companyId: company.companyId,
      customerId: customerId(request),
      changes,
    });
    if (!result.isSuccess) throwCustomerError(result.getError());
    return apiSuccess({ customer: customerToResponse(result.getValue()) }, { headers: { 'Cache-Control': 'no-store' } });
  },
);
