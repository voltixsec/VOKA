import type { Customer } from '../../domain/entities';
import type { CustomerRepository } from '../../domain/repositories';

export class GetCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  public async execute(input: {
    companyId: string;
    customerId: string;
  }): Promise<Customer | null> {
    const customer = await this.customers.findByIdAndCompanyId(
      input.customerId,
      input.companyId,
    );
    return customer && !customer.isDeleted ? customer : null;
  }
}
