import type { Customer } from "../../../domain/customer/entities/Customer";

import type {
  ICustomerRepository,
} from "../repositories/ICustomerRepository";

import {
  CreateCustomerUseCase,
} from "../use-cases/CreateCustomerUseCase";

export class CustomerResolver {

  constructor(
    private readonly repository: ICustomerRepository,
  ) {}

  async resolve(
    companyId: string,
    name: string,
    email?: string,
  ): Promise<Customer> {

    const existing =
      await this.repository.findByName(
        companyId,
        name,
      );

    if (existing) {
      return existing;
    }

    const useCase =
      new CreateCustomerUseCase(
        this.repository,
      );

    const result =
      await useCase.execute({
        companyId,
        name,
        email,
      });

    const customer =
      await this.repository.findById(
        result.id,
      );

    if (!customer) {
      throw new Error(
        "Customer creation failed.",
      );
    }

    return customer;

  }

}
