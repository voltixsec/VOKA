import type { Customer } from "../../../domain/customer/entities/Customer";

export interface ICustomerRepository {

  save(
    customer: Customer,
  ): Promise<void>;

  findById(
    id: string,
  ): Promise<Customer | null>;

  findByName(
    companyId: string,
    name: string,
  ): Promise<Customer | null>;

}
