import { Result, type DomainError } from '../../../../lib/core';
import type { Customer } from '../../domain/entities';
import type { CustomerRepository } from '../../domain/repositories';
import { CreateCustomer, type CreateCustomerInput } from './CreateCustomer';

/** An explicit human action; discovery is never allowed to create customers. */
export class CreateProposedCustomer {
  constructor(private readonly repository: CustomerRepository) {}

  async execute(input: CreateCustomerInput): Promise<Result<{ customer: Customer | null; candidates: Customer[] }, DomainError>> {
    const names = [...new Set([input.name, input.nameAr, input.nameEn, input.legalName].filter((name): name is string => Boolean(name?.trim())))];
    const matches = await Promise.all(names.map((search) => this.repository.findAll({ companyId: input.companyId, search, take: 20 })));
    const candidates = [...new Map(matches.flat().map((customer) => [customer.id.toString(), customer])).values()];
    if (candidates.length) return Result.success({ customer: null, candidates });
    const created = await new CreateCustomer(this.repository).execute(input);
    return created.isSuccess ? Result.success({ customer: created.getValue(), candidates: [] }) : Result.failure(created.getError());
  }
}
