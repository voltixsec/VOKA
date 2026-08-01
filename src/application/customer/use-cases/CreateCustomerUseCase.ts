import type {
  CreateCustomerRequest,
} from "../dto/CreateCustomerRequest";

import type {
  CreateCustomerResponse,
} from "../dto/CreateCustomerResponse";

import {
  Customer,
} from "../../../domain/customer/entities/Customer";

import type {
  ICustomerRepository,
} from "../repositories/ICustomerRepository";

export class CreateCustomerUseCase {

  constructor(
    private readonly repository: ICustomerRepository,
  ) {}

  async execute(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse> {

    const existingCustomer =
      await this.repository.findByName(
        request.companyId,
        request.name,
      );

    if (existingCustomer) {
      throw new Error(
        "Customer already exists.",
      );
    }

    const customer =
      Customer.create(
        request.name,
      );

    await this.repository.save(
      customer,
    );

    return {
      id: customer.id.toString(),
    };

  }

}
