import { DomainError, Result } from '../../../../lib/core';
import type { CreateCustomerProps, Customer } from '../../domain/entities';
import type { CustomerRepository } from '../../domain/repositories';

export type UpdateCustomerInput = {
  companyId: string;
  customerId: string;
  changes: Omit<Partial<CreateCustomerProps>, 'companyId'>;
};

export class UpdateCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  public async execute(
    input: UpdateCustomerInput,
  ): Promise<Result<Customer, DomainError>> {
    const customer = await this.customers.findByIdAndCompanyId(
      input.customerId,
      input.companyId,
    );
    if (!customer || customer.isDeleted) {
      return Result.failure(
        new DomainError('Customer not found.', 'CUSTOMER_NOT_FOUND'),
      );
    }

    if (input.changes.code !== undefined) {
      const code = input.changes.code.trim().toUpperCase();
      if (code !== customer.code) {
        const existing = await this.customers.findByCode(input.companyId, code);
        if (existing && existing.id.toString() !== input.customerId) {
          return Result.failure(
            new DomainError(
              'A customer with this code already exists in this company.',
              'CUSTOMER_CODE_ALREADY_EXISTS',
            ),
          );
        }
      }
    }

    const updated = customer.updateDetails(input.changes);
    if (!updated.isSuccess) return Result.failure(updated.getError());
    return Result.success(await this.customers.save(customer));
  }
}
