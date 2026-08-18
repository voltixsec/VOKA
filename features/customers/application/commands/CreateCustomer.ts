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

export type CreateCustomerInput = CreateCustomerProps;

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
    const customerResult = Customer.create(input);

    if (!customerResult.isSuccess) {
      return Result.failure(customerResult.getError());
    }

    const customer = customerResult.getValue();

    if (customer.code) {
      const existingCustomer =
        await this.customerRepository.findByCode(
          customer.companyId,
          customer.code,
        );

      if (existingCustomer) {
        return Result.failure(
          new DomainError(
            'A customer with this code already exists in this company.',
            'CUSTOMER_CODE_ALREADY_EXISTS',
          ),
        );
      }
    }

    const savedCustomer =
      await this.customerRepository.save(customer);

    return Result.success(savedCustomer);
  }
}
