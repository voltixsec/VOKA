import {
  DomainError,
  Result,
  type Service,
} from '../../../../lib/core';

import {
  Customer,
  type CreateCustomerProps,
} from '../../domain/entities';

import type { CustomerRepository } from '../../domain/repositories';

export type CreateCustomerInput = Omit<CreateCustomerProps, 'code'>;

export class CreateCustomer
  implements
    Service<
      CreateCustomerInput,
      Result<Customer, DomainError>
    >
{
  constructor(
    private readonly customerRepository: CustomerRepository,
  ) {}

  public async execute(
    input: CreateCustomerInput,
  ): Promise<Result<Customer, DomainError>> {
    // Customer business code is server-owned.
    // Runtime callers cannot override the generated CUST sequence.
    const customerResult = Customer.create({
      ...input,
      code: '',
    });

    if (!customerResult.isSuccess) {
      return Result.failure(customerResult.getError());
    }

    const customer = customerResult.getValue();

    const savedCustomer =
      await this.customerRepository.save(customer);

    return Result.success(savedCustomer);
  }
}
