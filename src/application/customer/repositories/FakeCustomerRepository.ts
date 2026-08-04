import type { Customer } from "../../../domain/customer/entities/Customer";
import type { ICustomerRepository } from "../../../application/customer/repositories/ICustomerRepository";

export class FakeCustomerRepository
  implements ICustomerRepository {

  private readonly customers: Customer[] = [];

  async save(
    customer: Customer,
  ): Promise<void> {

    this.customers.push(customer);

  }

  async findById(
    id: string,
  ): Promise<Customer | null> {

    return (
      this.customers.find(
        customer =>
          customer.id.toString() === id,
      ) ?? null
    );

  }

  async findByName(
    companyId: string,
    name: string,
  ): Promise<Customer | null> {

    return (
      this.customers.find(
        customer =>
          customer.name.toString() === name,
      ) ?? null
    );

  }

  count(): number {

    return this.customers.length;

  }

}
